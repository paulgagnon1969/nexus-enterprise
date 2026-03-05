import { Injectable, ForbiddenException } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";

export type DirectoryCategory = "internal" | "clients" | "subs" | "personal";
export type DirectorySource = "ncc" | "personal";

export interface DirectoryContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  title: string | null;
  company: string | null;
  category: DirectoryCategory;
  source: DirectorySource;
}

interface ListOptions {
  search?: string | null;
  category?: string | null;
  includePersonal?: boolean;
  projectId?: string | null;
  limit?: number;
}

@Injectable()
export class ContactsDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureCompanyId(actor: AuthenticatedUser): string {
    if (!actor.companyId) {
      throw new ForbiddenException("Missing company context for contacts directory.");
    }
    return actor.companyId;
  }

  private ensureUserId(actor: AuthenticatedUser): string {
    if (!actor.userId) {
      throw new ForbiddenException("Missing user id for contacts directory.");
    }
    return actor.userId;
  }

  private matchesSearch(contact: DirectoryContact, term: string): boolean {
    const lower = term.toLowerCase();
    return (
      (contact.displayName ?? "").toLowerCase().includes(lower) ||
      (contact.firstName ?? "").toLowerCase().includes(lower) ||
      (contact.lastName ?? "").toLowerCase().includes(lower) ||
      (contact.email ?? "").toLowerCase().includes(lower) ||
      (contact.phone ?? "").includes(lower) ||
      (contact.company ?? "").toLowerCase().includes(lower) ||
      (contact.role ?? "").toLowerCase().includes(lower)
    );
  }

  async listDirectory(actor: AuthenticatedUser, options: ListOptions = {}): Promise<DirectoryContact[]> {
    const companyId = this.ensureCompanyId(actor);
    const userId = this.ensureUserId(actor);
    const {
      search,
      category,
      includePersonal = true,
      projectId,
      limit = 200,
    } = options;

    const contacts: DirectoryContact[] = [];
    const seenEmails = new Set<string>();

    // ── 1. NCC Org: Internal team members ────────────────────────────
    if (!category || category === "all" || category === "internal") {
      const memberWhere: any = {
        companyId,
        isActive: true,
        userId: { not: userId }, // Exclude self
      };

      // If projectId is set, scope to project members only.
      if (projectId) {
        const projectMembers = await this.prisma.projectMembership.findMany({
          where: { projectId, companyId },
          select: { userId: true },
        });
        const projectUserIds = projectMembers.map((m) => m.userId);
        memberWhere.userId = { in: projectUserIds, not: userId };
      }

      const members = await this.prisma.companyMembership.findMany({
        where: memberWhere,
        select: {
          role: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        take: limit,
      });

      for (const m of members) {
        const email = m.user.email?.toLowerCase() ?? null;
        if (email) seenEmails.add(email);

        const displayName = [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
        contacts.push({
          id: `ncc-member-${m.user.id}`,
          firstName: m.user.firstName ?? null,
          lastName: m.user.lastName ?? null,
          displayName,
          email: m.user.email ?? null,
          phone: null,
          role: String(m.role),
          title: null,
          company: null,
          category: "internal",
          source: "ncc",
        });
      }
    }

    // ── 2. NCC Org: Tenant clients ───────────────────────────────────
    if (!category || category === "all" || category === "clients") {
      const clientWhere: any = { companyId, active: true };

      if (projectId) {
        clientWhere.projects = { some: { id: projectId } };
      }

      const clients = await this.prisma.tenantClient.findMany({
        where: clientWhere,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          email: true,
          phone: true,
          company: true,
        },
        take: limit,
      });

      for (const c of clients) {
        const email = c.email?.toLowerCase() ?? null;
        if (email) seenEmails.add(email);

        const name = c.displayName || [c.firstName, c.lastName].filter(Boolean).join(" ");
        contacts.push({
          id: `ncc-client-${c.id}`,
          firstName: c.firstName ?? null,
          lastName: c.lastName ?? null,
          displayName: name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          role: "Client",
          title: null,
          company: c.company ?? null,
          category: "clients",
          source: "ncc",
        });
      }

      // ── 2b. Legacy fallback: projects with primaryContact* but no TenantClient
      const legacyWhere: any = {
        companyId,
        tenantClientId: null,
        OR: [
          { primaryContactName: { not: null } },
          { primaryContactEmail: { not: null } },
          { primaryContactPhone: { not: null } },
        ],
      };

      if (projectId) {
        legacyWhere.id = projectId;
      }

      const legacyProjects = await this.prisma.project.findMany({
        where: legacyWhere,
        select: {
          id: true,
          primaryContactName: true,
          primaryContactEmail: true,
          primaryContactPhone: true,
        },
        take: limit,
      });

      // Deduplicate by email so the same contact across multiple projects appears once
      for (const p of legacyProjects) {
        const email = p.primaryContactEmail?.toLowerCase() ?? null;
        if (email && seenEmails.has(email)) continue;
        if (email) seenEmails.add(email);

        // Parse name into first/last as best we can
        const nameParts = (p.primaryContactName ?? "").trim().split(/\s+/);
        const firstName = nameParts[0] ?? null;
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

        contacts.push({
          id: `ncc-project-contact-${p.id}`,
          firstName,
          lastName,
          displayName: p.primaryContactName ?? p.primaryContactEmail ?? null,
          email: p.primaryContactEmail ?? null,
          phone: p.primaryContactPhone ?? null,
          role: "Client",
          title: null,
          company: null,
          category: "clients",
          source: "ncc",
        });
      }
    }

    // ── 3. NCC Org: Subs (cross-tenant invites accepted) ─────────────
    if (!category || category === "all" || category === "subs") {
      const crossTenantInvites = await this.prisma.crossTenantInvite.findMany({
        where: {
          targetCompanyId: companyId,
          status: "ACCEPTED",
        },
        select: {
          invitee: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        take: limit,
      }).catch(() => []);

      for (const inv of crossTenantInvites) {
        if (!inv.invitee) continue;
        const email = inv.invitee.email?.toLowerCase() ?? null;
        if (email) seenEmails.add(email);

        const name = [inv.invitee.firstName, inv.invitee.lastName].filter(Boolean).join(" ") || inv.invitee.email;
        contacts.push({
          id: `ncc-sub-${inv.invitee.id}`,
          firstName: inv.invitee.firstName ?? null,
          lastName: inv.invitee.lastName ?? null,
          displayName: name,
          email: inv.invitee.email ?? null,
          phone: null,
          role: "Subcontractor",
          title: null,
          company: null,
          category: "subs",
          source: "ncc",
        });
      }
    }

    // ── 4. Personal contacts (toggled) ───────────────────────────────
    if (includePersonal && (!category || category === "all" || category === "personal")) {
      const personalRows = await this.prisma.personalContact.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      for (const pc of personalRows) {
        const email = pc.email?.toLowerCase() ?? null;

        // Deduplicate: skip if this email already exists from NCC sources.
        if (email && seenEmails.has(email)) continue;

        const name = pc.displayName
          || [pc.firstName, pc.lastName].filter(Boolean).join(" ")
          || pc.email
          || pc.phone
          || null;

        contacts.push({
          id: `personal-${pc.id}`,
          firstName: pc.firstName ?? null,
          lastName: pc.lastName ?? null,
          displayName: name,
          email: pc.email ?? null,
          phone: pc.phone ?? null,
          role: null,
          title: null,
          company: null,
          category: "personal",
          source: "personal",
        });
      }
    }

    // ── 5. Filter by search term ─────────────────────────────────────
    let result = contacts;
    if (search && search.trim()) {
      result = result.filter((c) => this.matchesSearch(c, search.trim()));
    }

    // Sort: NCC contacts first, then personal. Within each group, alphabetical.
    result.sort((a, b) => {
      if (a.source !== b.source) return a.source === "ncc" ? -1 : 1;
      const nameA = (a.displayName ?? "").toLowerCase();
      const nameB = (b.displayName ?? "").toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return result.slice(0, limit);
  }
}
