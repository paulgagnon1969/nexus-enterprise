import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

export interface CreateTenantClientDto {
  firstName: string;
  lastName: string;
  displayName?: string;
  email?: string;
  phone?: string;
  additionalEmails?: string[];
  additionalPhones?: string[];
  company?: string;
  notes?: string;
}

export interface UpdateTenantClientDto extends Partial<CreateTenantClientDto> {
  active?: boolean;
}

@Injectable()
export class TenantClientService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search for tenant clients by name, email, or phone.
   * Also searches project contact data (primaryContact fields) to find
   * contacts from other projects even if not yet in TenantClient table.
   * Returns matches sorted by relevance.
   */
  async search(companyId: string, query: string, limit = 10) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // 1. Search TenantClient records
    const tenantClients = await this.prisma.tenantClient.findMany({
      where: {
        companyId,
        active: true,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        _count: { select: { projects: true } },
      },
      take: limit,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const results: Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      email: string | null;
      phone: string | null;
      company: string | null;
      projectCount?: number;
      source: "tenant_client" | "project";
    }> = tenantClients.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: c.displayName || `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone,
      company: c.company,
      projectCount: c._count.projects,
      source: "tenant_client" as const,
    }));

    // 2. Search project contact fields (primaryContactName, etc.)
    // Only if we need more results
    if (results.length < limit) {
      const projectContacts = await this.prisma.project.findMany({
        where: {
          companyId,
          OR: [
            { primaryContactName: { contains: q, mode: "insensitive" } },
            { primaryContactEmail: { contains: q, mode: "insensitive" } },
            { primaryContactPhone: { contains: q, mode: "insensitive" } },
          ],
          // Exclude projects already linked to a TenantClient
          tenantClientId: null,
        },
        select: {
          id: true,
          primaryContactName: true,
          primaryContactEmail: true,
          primaryContactPhone: true,
        },
        take: limit * 2, // Get more to allow for deduplication
      });

      // Deduplicate by email or phone (case-insensitive)
      const seen = new Set<string>();
      // Add existing results to seen set
      for (const r of results) {
        if (r.email) seen.add(r.email.toLowerCase());
        if (r.phone) seen.add(r.phone.replace(/\D/g, "")); // normalize phone
      }

      for (const p of projectContacts) {
        // Skip if we've already seen this contact
        const emailKey = p.primaryContactEmail?.toLowerCase();
        const phoneKey = p.primaryContactPhone?.replace(/\D/g, "");
        if (emailKey && seen.has(emailKey)) continue;
        if (phoneKey && phoneKey.length >= 7 && seen.has(phoneKey)) continue;

        // Add to results
        results.push({
          id: `project:${p.id}`, // Prefix to distinguish from TenantClient IDs
          firstName: null,
          lastName: null,
          displayName: p.primaryContactName,
          email: p.primaryContactEmail,
          phone: p.primaryContactPhone,
          company: null,
          source: "project" as const,
        });

        // Mark as seen
        if (emailKey) seen.add(emailKey);
        if (phoneKey && phoneKey.length >= 7) seen.add(phoneKey);

        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Get a single tenant client with their linked projects.
   */
  async getById(companyId: string, clientId: string) {
    const client = await this.prisma.tenantClient.findFirst({
      where: { id: clientId, companyId },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            status: true,
            addressLine1: true,
            city: true,
            state: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone,
      additionalEmails: client.additionalEmails as string[] | null,
      additionalPhones: client.additionalPhones as string[] | null,
      company: client.company,
      notes: client.notes,
      active: client.active,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      projects: client.projects,
    };
  }

  /**
   * Create a new tenant client.
   */
  async create(companyId: string, dto: CreateTenantClientDto) {
    const client = await this.prisma.tenantClient.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        additionalEmails: dto.additionalEmails ?? undefined,
        additionalPhones: dto.additionalPhones ?? undefined,
        company: dto.company,
        notes: dto.notes,
      },
    });

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone,
    };
  }

  /**
   * Update an existing tenant client.
   */
  async update(companyId: string, clientId: string, dto: UpdateTenantClientDto) {
    // Verify client belongs to this company
    const existing = await this.prisma.tenantClient.findFirst({
      where: { id: clientId, companyId },
    });

    if (!existing) {
      throw new NotFoundException("Client not found");
    }

    const client = await this.prisma.tenantClient.update({
      where: { id: clientId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        displayName: dto.displayName,
        email: dto.email,
        phone: dto.phone,
        additionalEmails: dto.additionalEmails,
        additionalPhones: dto.additionalPhones,
        company: dto.company,
        notes: dto.notes,
        active: dto.active,
      },
    });

    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      displayName: client.displayName || `${client.firstName} ${client.lastName}`,
      email: client.email,
      phone: client.phone,
      active: client.active,
    };
  }

  /**
   * List all clients for a company.
   */
  async list(companyId: string, includeInactive = false) {
    const clients = await this.prisma.tenantClient.findMany({
      where: {
        companyId,
        ...(includeInactive ? {} : { active: true }),
      },
      include: {
        _count: { select: { projects: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return clients.map((c: typeof clients[number]) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: c.displayName || `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone,
      company: c.company,
      active: c.active,
      projectCount: c._count.projects,
    }));
  }
}
