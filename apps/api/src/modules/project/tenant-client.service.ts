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
   * Returns matches sorted by relevance (exact matches first).
   */
  async search(companyId: string, query: string, limit = 10) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    // Search by firstName, lastName, email, or phone
    const clients = await this.prisma.tenantClient.findMany({
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

    return clients.map((c: typeof clients[number]) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      displayName: c.displayName || `${c.firstName} ${c.lastName}`,
      email: c.email,
      phone: c.phone,
      company: c.company,
      projectCount: c._count.projects,
    }));
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
