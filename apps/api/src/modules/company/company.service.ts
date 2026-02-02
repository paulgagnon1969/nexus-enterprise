import { Injectable, NotFoundException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { GlobalRole, Role } from "../auth/auth.guards";
import { AuditService } from "../../common/audit.service";
import { EmailService } from "../../common/email.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { NotificationsService } from "../notifications/notifications.service";
import { $Enums } from "@prisma/client";
import { randomUUID } from "crypto";
import { UpsertOfficeDto } from "./dto/office.dto";
import { UpsertLandingConfigDto } from "./dto/landing-config.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";
import * as fs from "node:fs";
import * as path from "node:path";

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  async getCurrentCompany(companyId: string, userId: string) {
    return this.prisma.company.findFirst({
      where: {
        id: companyId,
        memberships: {
          some: {
            userId
          }
        }
      },
      select: {
        id: true,
        name: true,
        kind: true,
        defaultTimeZone: true,
        defaultPayrollConfig: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            userId: true,
            role: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                email: true,
                globalRole: true,
                userType: true,
              },
            },
          },
        }
      }
    });
  }

  async createCompany(name: string, userId: string, actor: AuthenticatedUser) {
    const company = await this.prisma.$transaction(async tx => {
      const created = await tx.company.create({
        data: {
          name,
          // Seed a worker invite token so this organization can invite crew via
          // the public onboarding flow.
          workerInviteToken: randomUUID(),
        }
      });

      // Creator gets OWNER membership.
      await tx.companyMembership.create({
        data: {
          userId,
          companyId: created.id,
          role: Role.OWNER,
        }
      });

      // Ensure all SUPER_ADMIN users have access to the new company.
      const superAdmins = await tx.user.findMany({
        where: { globalRole: GlobalRole.SUPER_ADMIN },
        select: { id: true },
      });

      if (superAdmins.length) {
        await tx.companyMembership.createMany({
          data: superAdmins.map(u => ({
            userId: u.id,
            companyId: created.id,
            role: Role.OWNER,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    await this.audit.log(actor, "COMPANY_CREATED", {
      companyId: company.id,
      metadata: { companyName: company.name }
    });

    return company;
  }

  async createInvite(
    companyId: string,
    email: string,
    role: Role,
    actor: AuthenticatedUser
  ) {
    if (actor.companyId !== companyId) {
      throw new Error("Cannot invite users to a different company context");
    }

    if (role === Role.OWNER && actor.role !== Role.OWNER) {
      throw new Error("Only OWNER can grant OWNER role");
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const invite = await this.prisma.companyInvite.create({
      data: {
        companyId,
        email,
        role,
        token,
        expiresAt
      }
    });

    await this.audit.log(actor, "COMPANY_INVITE_CREATED", {
      companyId,
      metadata: { email, role, inviteId: invite.id }
    });

    // Send invite email (best-effort).
    try {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });

      const webBase = (process.env.WEB_APP_BASE_URL || "").replace(/\/$/, "");
      const acceptUrl = webBase
        ? `${webBase}/accept-invite?token=${encodeURIComponent(invite.token)}`
        : `/accept-invite?token=${encodeURIComponent(invite.token)}`;

      await this.email.sendCompanyInvite({
        toEmail: invite.email,
        companyName: company?.name ?? "your company",
        acceptUrl,
        roleLabel: String(invite.role),
      });
    } catch {
      // Don't block invite creation if email delivery fails.
    }

    // Best-effort: notify the inviter themselves that the invite was created,
    // so they can track it from the Activity feed.
    try {
      if (actor.userId) {
        const title = "Company invite sent";
        const body = `You invited ${email} to join this company as ${String(role)}.`;

        await this.notifications.createNotification({
          userId: actor.userId,
          companyId,
          kind: $Enums.NotificationKind.SYSTEM,
          channel: $Enums.NotificationChannel.IN_APP,
          title,
          body,
          metadata: {
            type: "company_invite_created",
            inviteId: invite.id,
            email,
            role,
          },
        });
      }
    } catch {
      // ignore
    }

    return invite;
  }

  async listMembers(companyId: string, actor: AuthenticatedUser) {
    if (actor.companyId !== companyId) {
      throw new Error("Cannot list members for a different company context");
    }

    const memberships = await this.prisma.companyMembership.findMany({
      where: { companyId },
      select: {
        userId: true,
        role: true,
        isActive: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            globalRole: true,
            userType: true,
            firstName: true,
            lastName: true,
            portfolios: {
              where: { companyId },
              select: {
                hr: {
                  select: {
                    encryptedJson: true,
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
    });

    // Decrypt HR contact info if available
    const { decryptPortfolioHrJson } = require('../../common/crypto/portfolio-hr.crypto');

    return memberships.map(m => {
      let phone: string | null = null;
      if (m.user.portfolios[0]?.hr?.encryptedJson) {
        try {
          const hrData = decryptPortfolioHrJson(m.user.portfolios[0].hr.encryptedJson);
          phone = hrData.phone || null;
        } catch {
          // Skip decryption errors
        }
      }

      return {
        userId: m.userId,
        role: m.role,
        isActive: m.isActive,
        createdAt: m.createdAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          globalRole: m.user.globalRole,
          userType: m.user.userType,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          phone,
        },
      };
    });
  }

  async listInvites(companyId: string, actor: AuthenticatedUser) {
    if (actor.companyId !== companyId) {
      throw new Error("Cannot list invites for a different company context");
    }

    return this.prisma.companyInvite.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        token: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true
      }
    });
  }

  async updateCurrentCompany(actor: AuthenticatedUser, dto: UpdateCompanyDto) {
    const companyId = actor.companyId;
    if (!companyId) {
      throw new Error("Missing company context for actor");
    }

    // Only OWNER or ADMIN of the current company may edit company settings.
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new Error("Only OWNER or ADMIN can update company settings");
    }

    const existing = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        memberships: {
          some: {
            userId: actor.userId,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Company not found for current user");
    }

    const data: any = {};
    if (typeof dto.name === "string" && dto.name.trim()) {
      data.name = dto.name.trim();
    }
    if (typeof dto.defaultTimeZone === "string") {
      data.defaultTimeZone = dto.defaultTimeZone || null;
    }
    if (typeof dto.defaultPayrollConfig !== "undefined") {
      data.defaultPayrollConfig = dto.defaultPayrollConfig ?? null;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data,
    });

    await this.audit.log(actor, "COMPANY_UPDATED", {
      companyId,
      metadata: {
        previous: {
          name: (existing as any).name,
          defaultTimeZone: (existing as any).defaultTimeZone ?? null,
        },
        updated: {
          name: updated.name,
          defaultTimeZone: (updated as any).defaultTimeZone ?? null,
        },
      },
    });

    return updated;
  }

  // --- Company offices (soft-delete only; never hard-delete) ---

  async listOfficesForCurrentCompany(actor: AuthenticatedUser) {
    return this.prisma.companyOffice.findMany({
      where: {
        companyId: actor.companyId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async createOfficeForCurrentCompany(actor: AuthenticatedUser, dto: UpsertOfficeDto) {
    const office = await this.prisma.companyOffice.create({
      data: {
        companyId: actor.companyId,
        label: dto.label,
        addressLine1: dto.addressLine1 ?? "",
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city ?? "",
        state: dto.state ?? "",
        postalCode: dto.postalCode ?? "",
        country: dto.country ?? "US",
        payrollConfig: dto.payrollConfig ? (dto.payrollConfig as any) : undefined,
      },
    });

    await this.audit.log(actor, "COMPANY_OFFICE_CREATED", {
      companyId: actor.companyId,
      metadata: {
        officeId: office.id,
        label: office.label,
      },
    });

    return office;
  }

  async updateOfficeForCurrentCompany(
    actor: AuthenticatedUser,
    officeId: string,
    dto: UpsertOfficeDto,
  ) {
    const existing = await this.prisma.companyOffice.findFirst({
      where: {
        id: officeId,
        companyId: actor.companyId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException("Office not found");
    }

    const updated = await this.prisma.companyOffice.update({
      where: { id: officeId },
      data: {
        label: dto.label,
        addressLine1: dto.addressLine1 ?? "",
        addressLine2: dto.addressLine2 ?? null,
        city: dto.city ?? "",
        state: dto.state ?? "",
        postalCode: dto.postalCode ?? "",
        country: dto.country ?? "US",
        payrollConfig: typeof dto.payrollConfig !== "undefined"
          ? (dto.payrollConfig as any)
          : existing.payrollConfig,
      },
    });

    await this.audit.log(actor, "COMPANY_OFFICE_UPDATED", {
      companyId: actor.companyId,
      metadata: {
        officeId: officeId,
        previous: {
          label: existing.label,
          addressLine1: existing.addressLine1,
          addressLine2: existing.addressLine2,
          city: existing.city,
          state: existing.state,
          postalCode: existing.postalCode,
          country: existing.country,
        },
        updated: {
          label: updated.label,
          addressLine1: updated.addressLine1,
          addressLine2: updated.addressLine2,
          city: updated.city,
          state: updated.state,
          postalCode: updated.postalCode,
          country: updated.country,
        },
      },
    });

    return updated;
  }

  async softDeleteOfficeForCurrentCompany(actor: AuthenticatedUser, officeId: string) {
    const existing = await this.prisma.companyOffice.findFirst({
      where: {
        id: officeId,
        companyId: actor.companyId,
        deletedAt: null,
      },
    });

    if (!existing) {
      // Already gone or belongs to another company; treat as not found.
      throw new NotFoundException("Office not found");
    }

    const deletedAt = new Date();

    await this.prisma.companyOffice.update({
      where: { id: officeId },
      data: { deletedAt },
    });

    await this.audit.log(actor, "COMPANY_OFFICE_DELETED", {
      companyId: actor.companyId,
      metadata: {
        officeId: officeId,
        deletedAt,
        previous: {
          label: existing.label,
          addressLine1: existing.addressLine1,
          addressLine2: existing.addressLine2,
          city: existing.city,
          state: existing.state,
          postalCode: existing.postalCode,
          country: existing.country,
        },
      },
    });

    return { success: true };
  }

  // --- Branding / landing configuration helpers ---
   private ensureCanManageBranding(actor: AuthenticatedUser) {
    // SUPER_ADMIN can always manage branding for the current company context.
    if (actor.globalRole === GlobalRole.SUPER_ADMIN) return;
    // For non-super users, require OWNER or ADMIN on the current company.
    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new Error("You do not have permission to manage branding for this organization");
    }
  }

  private coerceLandingConfig(
    raw: any,
  ): {
    logoUrl: string | null;
    headline: string | null;
    subheadline: string | null;
    secondaryLogoUrl: string | null;
  } | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const obj = raw as any;
    const logoUrl = typeof obj.logoUrl === "string" && obj.logoUrl.trim() ? obj.logoUrl.trim() : null;
    const headline = typeof obj.headline === "string" && obj.headline.trim() ? obj.headline.trim() : null;
    const subheadline =
      typeof obj.subheadline === "string" && obj.subheadline.trim() ? obj.subheadline.trim() : null;
    const secondaryLogoUrl =
      typeof obj.secondaryLogoUrl === "string" && obj.secondaryLogoUrl.trim()
        ? obj.secondaryLogoUrl.trim()
        : null;

    return { logoUrl, headline, subheadline, secondaryLogoUrl };
  }
  
  async getLandingConfigForCurrentCompany(actor: AuthenticatedUser) {
    this.ensureCanManageBranding(actor);

    return this.getLandingConfigByCompanyId(actor.companyId);
  }

  // Public-safe landing configuration reader (no auth), used for login/worker
  // registration branding. Only exposes logo/headline/subheadline.
  async getLandingConfigByCompanyId(companyId: string) {
    const rows = await this.prisma.organizationModuleOverride.findMany({
      where: {
        companyId,
        moduleCode: { in: ["NCC_LOGIN_LANDING", "NCC_WORKER_LANDING"] },
      },
      select: {
        moduleCode: true,
        configJson: true,
      },
    });

    const rawLogin = rows.find(r => r.moduleCode === "NCC_LOGIN_LANDING")?.configJson ?? null;
    const rawWorker = rows.find(r => r.moduleCode === "NCC_WORKER_LANDING")?.configJson ?? null;

    const login = this.coerceLandingConfig(rawLogin);
    const worker = this.coerceLandingConfig(rawWorker);

    return { login, worker };
  }

  // Resolve the Nexus System company used for global landing configuration.
  private async getSystemCompanyId(): Promise<string | null> {
    const row = await this.prisma.company.findFirst({
      where: {
        name: "Nexus System",
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  // Global Nexus Contractor-Connect landing configuration, anchored to the
  // "Nexus System" organization. This feeds the public /login and /apply
  // screens and does not depend on the caller's company context.
  async getSystemLandingConfig() {
    const systemCompanyId = await this.getSystemCompanyId();
    if (!systemCompanyId) {
      return { login: null, worker: null };
    }
    return this.getLandingConfigByCompanyId(systemCompanyId);
  }

  // SUPER_ADMIN-only: update landing configuration for the Nexus System
  // organization regardless of the caller's current companyId.
  async upsertSystemLandingConfig(actor: AuthenticatedUser, dto: UpsertLandingConfigDto) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new Error("Only SUPER_ADMIN can update system landing configuration");
    }

    const companyId = await this.getSystemCompanyId();
    if (!companyId) {
      throw new Error("Nexus System organization not found");
    }

    const hasLogin = typeof dto.login !== "undefined";
    const hasWorker = typeof dto.worker !== "undefined";

    await this.prisma.$transaction(async tx => {
      if (hasLogin) {
        await tx.organizationModuleOverride.upsert({
          where: {
            OrgModuleOverride_company_module_key: {
              companyId,
              moduleCode: "NCC_LOGIN_LANDING",
            },
          },
          update: {
            enabled: true,
            configJson: dto.login as any,
          },
          create: {
            companyId,
            moduleCode: "NCC_LOGIN_LANDING",
            enabled: true,
            configJson: dto.login as any,
          },
        });
      }

      if (hasWorker) {
        await tx.organizationModuleOverride.upsert({
          where: {
            OrgModuleOverride_company_module_key: {
              companyId,
              moduleCode: "NCC_WORKER_LANDING",
            },
          },
          update: {
            enabled: true,
            configJson: dto.worker as any,
          },
          create: {
            companyId,
            moduleCode: "NCC_WORKER_LANDING",
            enabled: true,
            configJson: dto.worker as any,
          },
        });
      }
    });

    await this.audit.log(actor, "SYSTEM_LANDING_CONFIG_UPDATED", {
      companyId,
      metadata: {
        hasLoginConfig: dto.login != null,
        hasWorkerConfig: dto.worker != null,
      },
    });

    return this.getSystemLandingConfig();
  }

  async upsertLandingConfigForCurrentCompany(
    actor: AuthenticatedUser,
    dto: UpsertLandingConfigDto,
  ) {
    this.ensureCanManageBranding(actor);

    const companyId = actor.companyId;

    // IMPORTANT: persist exactly what the editor sends. We normalize shapes on
    // read (via coerceLandingConfig) so we don't accidentally drop fields here.
    const hasLogin = typeof dto.login !== "undefined";
    const hasWorker = typeof dto.worker !== "undefined";

    await this.prisma.$transaction(async tx => {
      if (hasLogin) {
        await tx.organizationModuleOverride.upsert({
          where: {
            OrgModuleOverride_company_module_key: {
              companyId,
              moduleCode: "NCC_LOGIN_LANDING",
            },
          },
          update: {
            enabled: true,
            configJson: dto.login as any,
          },
          create: {
            companyId,
            moduleCode: "NCC_LOGIN_LANDING",
            enabled: true,
            configJson: dto.login as any,
          },
        });
      }

      if (hasWorker) {
        await tx.organizationModuleOverride.upsert({
          where: {
            OrgModuleOverride_company_module_key: {
              companyId,
              moduleCode: "NCC_WORKER_LANDING",
            },
          },
          update: {
            enabled: true,
            configJson: dto.worker as any,
          },
          create: {
            companyId,
            moduleCode: "NCC_WORKER_LANDING",
            enabled: true,
            configJson: dto.worker as any,
          },
        });
      }
    });

    await this.audit.log(actor, "COMPANY_LANDING_CONFIG_UPDATED", {
      companyId,
      metadata: {
        hasLoginConfig: dto.login != null,
        hasWorkerConfig: dto.worker != null,
      },
    });

    // Re-read using the same path the editor + public endpoints use so caller
    // sees the normalized shape.
    return this.getLandingConfigForCurrentCompany(actor);
  }

  async uploadCompanyLogo(actor: AuthenticatedUser, req: FastifyRequest) {
    this.ensureCanManageBranding(actor);

    const { file } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
    });

    const uploadsRoot = path.resolve(process.cwd(), "uploads/company-logos");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    const ext = path.extname(file.filename || "");
    const safeExt = ext && ext.length <= 8 ? ext : "";
    const fileName = `${actor.companyId}-${Date.now()}${safeExt}`;
    const destPath = path.join(uploadsRoot, fileName);

    const buffer = await file.toBuffer();
    fs.writeFileSync(destPath, buffer);

    const publicUrl = `/uploads/company-logos/${fileName}`;

    await this.audit.log(actor, "COMPANY_LOGO_UPLOADED", {
      companyId: actor.companyId,
      metadata: {
        fileName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: buffer.length,
        publicUrl,
      },
    });

    return { url: publicUrl };
  }

  async updateMemberRole(
    companyId: string,
    userId: string,
    role: Role,
    actor: AuthenticatedUser
  ) {
    if (actor.companyId !== companyId) {
      throw new Error("Cannot modify members for a different company context");
    }

    // Only OWNER can assign OWNER role
    if (role === Role.OWNER && actor.role !== Role.OWNER) {
      throw new Error("Only OWNER can grant OWNER role");
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new Error("Membership not found");
    }

    const updated = await this.prisma.companyMembership.update({
      where: { userId_companyId: { userId, companyId } },
      data: { role },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            globalRole: true,
            userType: true,
          },
        },
      },
    });

    await this.audit.log(actor, "COMPANY_MEMBER_ROLE_UPDATED", {
      companyId,
      metadata: {
        userId,
        previousRole: membership.role,
        newRole: role,
      },
    });

    return updated;
  }

  async updateMemberActive(
    companyId: string,
    userId: string,
    isActive: boolean,
    actor: AuthenticatedUser,
  ) {
    if (actor.companyId !== companyId) {
      throw new Error("Cannot modify members for a different company context");
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId, companyId } },
    });

    if (!membership) {
      throw new Error("Membership not found");
    }

    const updated = await this.prisma.companyMembership.update({
      where: { userId_companyId: { userId, companyId } },
      data: { isActive },
      select: {
        userId: true,
        role: true,
        isActive: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            globalRole: true,
            userType: true,
          },
        },
      },
    });

    // Best-effort: keep Nex-Net candidate assignment in sync with tenant
    // membership. When a worker is deactivated in this company, we clear their
    // companyId on NexNetCandidate so they remain only in the global pool. When
    // reactivated, we reattach them to this company.
    try {
      if (!isActive) {
        await this.prisma.nexNetCandidate.updateMany({
          where: {
            userId,
            companyId,
          },
          data: {
            companyId: null,
          },
        });
      } else {
        await this.prisma.nexNetCandidate.updateMany({
          where: {
            userId,
            OR: [
              { companyId: null },
              { companyId },
            ],
          },
          data: {
            companyId,
          },
        });
      }
    } catch {
      // Non-fatal: Nex-Net denormalization issues should never block tenant
      // access changes.
    }

    await this.audit.log(actor, "COMPANY_MEMBER_ACCESS_UPDATED", {
      companyId,
      metadata: {
        userId,
        previousIsActive: membership.isActive,
        newIsActive: isActive,
      },
    });

    return updated;
  }
}
