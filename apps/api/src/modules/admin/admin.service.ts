import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import * as argon2 from "argon2";
import { UserType, CompanyKind } from "@prisma/client";
import { GlobalRole, Role } from "../auth/auth.guards";
import { createHash } from "crypto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private async audit(
    actor: AuthenticatedUser,
    action: string,
    details: { companyId?: string; userId?: string } = {}
  ) {
    const { companyId, userId } = details;

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.userId,
        actorEmail: actor.email,
        actorGlobalRole: actor.globalRole,
        action,
        targetCompanyId: companyId ?? null,
        targetUserId: userId ?? null,
        metadata:
          companyId || userId
            ? ({ companyId, userId } as any)
            : undefined
      }
    });
  }

  async listCompanies(actor: AuthenticatedUser) {
    await this.audit(actor, "ADMIN_LIST_COMPANIES");

    return this.prisma.company.findMany({
      // NOTE: Prisma client may not yet know about Company.deletedAt until
      // `prisma generate` has been run. For now we rely on the database/schema
      // to treat deleted organizations specially; the admin UI will also hide
      // deactivated orgs once the client is regenerated.
      select: {
        id: true,
        name: true,
        kind: true,
        templateId: true,
        templateVersionId: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
          },
        },
      },
    });
  }

  async deactivateCompany(actor: AuthenticatedUser, companyId: string) {
    await this.audit(actor, "ADMIN_DEACTIVATE_COMPANY", { companyId });

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      // When the Prisma client has been regenerated against the updated schema,
      // this will set Company.deletedAt. Until then, this call will fail in
      // TypeScript and should only be used after `prisma generate`.
      data: {
        // @ts-expect-error: deletedAt is added in the Prisma schema but may not
        // yet be present in the generated client types until `prisma generate`.
        deletedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        // @ts-expect-error: see note above about regenerated Prisma client.
        deletedAt: true,
        kind: true,
      },
    });

    return updated;
  }

  private getDayKey(d = new Date()): string {
    // Coalesce template sync revisions by day in UTC.
    return d.toISOString().slice(0, 10);
  }

  private hashJson(obj: any): string {
    const json = JSON.stringify(obj);
    return createHash("sha256").update(json).digest("hex");
  }

  private getModuleCatalog(): { moduleCode: string; enabled: boolean; configJson?: any }[] {
    // v1 module catalog
    return [
      { moduleCode: "projects", enabled: true },
      { moduleCode: "project_management", enabled: true },
      { moduleCode: "daily_logs", enabled: true },
      { moduleCode: "files", enabled: true },
      { moduleCode: "messaging", enabled: true },
      { moduleCode: "financial", enabled: true },
      { moduleCode: "reports", enabled: true },
      { moduleCode: "people", enabled: true },
      { moduleCode: "onboarding", enabled: true },
    ];
  }

  private getSystemArticles(): { slug: string; title: string; body: string; sortOrder: number; active: boolean }[] {
    // Minimal seed; we will evolve this into full “administrative articles”.
    return [
      {
        slug: "sorm-overview",
        title: "SORM — System Organization Revision Management",
        body:
          "SORM tracks Nexus System → template revisions (daily coalesced). Use this to provision and reconcile organizations safely.",
        sortOrder: 0,
        active: true,
      },
    ];
  }

  private async ensureSuperAdminsHaveMembership(companyId: string) {
    const superAdmins = await this.prisma.user.findMany({
      where: { globalRole: GlobalRole.SUPER_ADMIN },
      select: { id: true },
    });

    if (!superAdmins.length) return;

    await this.prisma.companyMembership.createMany({
      data: superAdmins.map(u => ({
        userId: u.id,
        companyId,
        role: Role.OWNER,
      })),
      skipDuplicates: true,
    });
  }

  async listTemplates(actor: AuthenticatedUser) {
    await this.audit(actor, "ADMIN_LIST_TEMPLATES");

    return this.prisma.organizationTemplate.findMany({
      orderBy: [{ active: "desc" }, { label: "asc" }],
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            dayKey: true,
            createdAt: true,
          }
        },
      },
    });
  }

  async createTemplate(
    actor: AuthenticatedUser,
    params: { code: string; label: string; description?: string }
  ) {
    const code = (params.code || "").trim().toUpperCase();
    const label = (params.label || "").trim();
    if (!code) throw new Error("Template code is required");
    if (!label) throw new Error("Template label is required");

    await this.audit(actor, "ADMIN_CREATE_TEMPLATE");

    const created = await this.prisma.organizationTemplate.create({
      data: {
        code,
        label,
        description: params.description?.trim() || null,
      },
    });

    return created;
  }

  async getTemplate(actor: AuthenticatedUser, templateId: string) {
    await this.audit(actor, "ADMIN_GET_TEMPLATE");

    const template = await this.prisma.organizationTemplate.findUnique({
      where: { id: templateId },
      include: {
        currentVersion: {
          include: {
            modules: true,
            articles: true,
            roleProfiles: {
              include: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!template) throw new Error("Template not found");

    return template;
  }

  async syncTemplateFromSystem(actor: AuthenticatedUser, templateId: string) {
    await this.audit(actor, "ADMIN_TEMPLATE_SYNC_FROM_SYSTEM");

    const template = await this.prisma.organizationTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        currentVersionId: true,
      },
    });
    if (!template) throw new Error("Template not found");

    const dayKey = this.getDayKey();

    // 1) Load canonical “system” sources.
    const moduleCatalog = this.getModuleCatalog().slice().sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));
    const systemArticles = this.getSystemArticles().slice().sort((a, b) => a.slug.localeCompare(b.slug));

    // Standard role profiles (companyId null).
    const [stdProfiles, resources] = await Promise.all([
      this.prisma.roleProfile.findMany({
        where: { companyId: null, active: true },
        include: { permissions: true },
        orderBy: [{ isStandard: "desc" }, { label: "asc" }],
      }),
      this.prisma.permissionResource.findMany({
        where: { active: true },
        select: { id: true, code: true },
      }),
    ]);

    const resourceCodeById = new Map(resources.map(r => [r.id, r.code]));

    const templateRoles = stdProfiles.map(p => {
      const perms = (p.permissions || [])
        .map((rp: any) => ({
          resourceCode: resourceCodeById.get(rp.resourceId) || null,
          canView: !!rp.canView,
          canAdd: !!rp.canAdd,
          canEdit: !!rp.canEdit,
          canDelete: !!rp.canDelete,
          canViewAll: !!rp.canViewAll,
          canApprove: !!rp.canApprove,
          canManageSettings: !!rp.canManageSettings,
        }))
        .filter(x => !!x.resourceCode)
        .sort((a, b) => (a.resourceCode as string).localeCompare(b.resourceCode as string));

      return {
        code: p.code,
        label: p.label,
        description: p.description ?? null,
        sortOrder: 0,
        active: !!p.active,
        permissions: perms,
      };
    });

    const content = {
      modules: moduleCatalog,
      articles: systemArticles,
      roles: templateRoles,
    };
    const contentHash = this.hashJson(content);

    // 2) Upsert TODAY's version (daily coalesced).
    const result = await this.prisma.$transaction(async tx => {
      let version = await tx.organizationTemplateVersion.findUnique({
        where: {
          OrgTemplateVersion_template_day_key: {
            templateId,
            dayKey,
          },
        },
      });

      if (!version) {
        const max = await tx.organizationTemplateVersion.aggregate({
          where: { templateId },
          _max: { versionNo: true },
        });
        const nextNo = (max._max.versionNo ?? 0) + 1;

        version = await tx.organizationTemplateVersion.create({
          data: {
            templateId,
            versionNo: nextNo,
            dayKey,
            createdByUserId: actor.userId,
            contentHash,
          },
        });
      } else {
        // If nothing changed, short-circuit (still return the current version).
        if (version.contentHash && version.contentHash === contentHash) {
          return { version, changed: false };
        }

        version = await tx.organizationTemplateVersion.update({
          where: { id: version.id },
          data: {
            contentHash,
            notes: null,
          },
        });
      }

      // 3) Replace version content (modules/articles/roles) to reflect “live copy”.
      await tx.organizationTemplateModule.deleteMany({
        where: { templateVersionId: version.id },
      });
      await tx.organizationTemplateArticle.deleteMany({
        where: { templateVersionId: version.id },
      });
      await tx.organizationTemplateRolePermission.deleteMany({
        where: {
          templateRoleProfile: {
            templateVersionId: version.id,
          },
        },
      });
      await tx.organizationTemplateRoleProfile.deleteMany({
        where: { templateVersionId: version.id },
      });

      await tx.organizationTemplateModule.createMany({
        data: moduleCatalog.map(m => ({
          id: undefined as any,
          templateVersionId: version.id,
          moduleCode: m.moduleCode,
          enabled: m.enabled,
          configJson: (m as any).configJson ?? null,
        })),
      });

      await tx.organizationTemplateArticle.createMany({
        data: systemArticles.map(a => ({
          id: undefined as any,
          templateVersionId: version.id,
          slug: a.slug,
          title: a.title,
          body: a.body,
          sortOrder: a.sortOrder,
          active: a.active,
        })),
      });

      // Create role profiles + permissions
      for (const rp of templateRoles) {
        const createdProfile = await tx.organizationTemplateRoleProfile.create({
          data: {
            templateVersionId: version.id,
            code: rp.code,
            label: rp.label,
            description: rp.description,
            sortOrder: rp.sortOrder,
            active: rp.active,
          },
        });

        if (rp.permissions.length) {
          await tx.organizationTemplateRolePermission.createMany({
            data: rp.permissions.map(p => ({
              templateRoleProfileId: createdProfile.id,
              resourceCode: p.resourceCode as string,
              canView: p.canView,
              canAdd: p.canAdd,
              canEdit: p.canEdit,
              canDelete: p.canDelete,
              canViewAll: p.canViewAll,
              canApprove: p.canApprove,
              canManageSettings: p.canManageSettings,
            })),
          });
        }
      }

      // Set current version
      await tx.organizationTemplate.update({
        where: { id: templateId },
        data: { currentVersionId: version.id },
      });

      return { version, changed: true };
    });

    return {
      templateId,
      dayKey,
      versionId: result.version.id,
      versionNo: result.version.versionNo,
      changed: result.changed,
    };
  }

  private async mergeTemplateRolesIntoCompany(companyId: string, templateVersionId: string) {
    const [templateProfiles, resources] = await Promise.all([
      this.prisma.organizationTemplateRoleProfile.findMany({
        where: { templateVersionId, active: true },
        include: { permissions: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
      this.prisma.permissionResource.findMany({
        where: { active: true },
        select: { id: true, code: true },
      }),
    ]);

    const resourceIdByCode = new Map(resources.map(r => [r.code, r.id]));

    let profilesAdded = 0;
    let permissionsAdded = 0;

    for (const tp of templateProfiles) {
      let profile = await this.prisma.roleProfile.findFirst({
        where: { companyId, code: tp.code, active: true },
      });

      if (!profile) {
        profile = await this.prisma.roleProfile.create({
          data: {
            companyId,
            code: tp.code,
            label: tp.label,
            description: tp.description,
            isStandard: true,
            active: tp.active,
            sourceProfileId: tp.id,
          },
        });
        profilesAdded += 1;
      }

      for (const perm of tp.permissions) {
        const resourceId = resourceIdByCode.get(perm.resourceCode);
        if (!resourceId) continue;

        const existing = await this.prisma.rolePermission.findFirst({
          where: { profileId: profile.id, resourceId },
          select: { id: true },
        });

        if (existing) continue;

        await this.prisma.rolePermission.create({
          data: {
            profileId: profile.id,
            resourceId,
            canView: perm.canView,
            canAdd: perm.canAdd,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            canViewAll: perm.canViewAll,
            canApprove: perm.canApprove,
            canManageSettings: perm.canManageSettings,
          },
        });
        permissionsAdded += 1;
      }
    }

    return { profilesAdded, permissionsAdded };
  }

  async provisionCompanyFromTemplate(
    actor: AuthenticatedUser,
    params: { name: string; templateId: string }
  ) {
    const name = (params.name || "").trim();
    if (!name) throw new Error("Company name is required");

    const template = await this.prisma.organizationTemplate.findUnique({
      where: { id: params.templateId },
      select: { id: true, currentVersionId: true },
    });
    if (!template) throw new Error("Template not found");
    if (!template.currentVersionId) {
      throw new Error("Template has no current version. Run sync-from-system first.");
    }

    const created = await this.prisma.company.create({
      data: {
        name,
        kind: CompanyKind.ORGANIZATION,
        templateId: template.id,
        templateVersionId: template.currentVersionId,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        templateId: true,
        templateVersionId: true,
      },
    });

    await this.ensureSuperAdminsHaveMembership(created.id);

    const seed = await this.mergeTemplateRolesIntoCompany(
      created.id,
      template.currentVersionId,
    );

    await this.audit(actor, "ADMIN_PROVISION_COMPANY_FROM_TEMPLATE", { companyId: created.id });

    return {
      company: created,
      seeded: seed,
    };
  }

  async provisionTrialCompanyFromTemplate(
    actor: AuthenticatedUser,
    params: { name: string; templateId: string; trialDays?: number }
  ) {
    const name = (params.name || "").trim();
    if (!name) throw new Error("Company name is required");

    const template = await this.prisma.organizationTemplate.findUnique({
      where: { id: params.templateId },
      select: { id: true, currentVersionId: true },
    });
    if (!template) throw new Error("Template not found");
    if (!template.currentVersionId) {
      throw new Error("Template has no current version. Run sync-from-system first.");
    }

    const trialDays = params.trialDays && params.trialDays > 0 ? params.trialDays : 30;
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const created = await this.prisma.company.create({
      data: {
        name,
        kind: CompanyKind.ORGANIZATION,
        isTrial: true,
        trialEndsAt,
        trialStatus: "ACTIVE" as any,
        templateId: template.id,
        templateVersionId: template.currentVersionId,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        isTrial: true,
        trialEndsAt: true,
        trialStatus: true,
        templateId: true,
        templateVersionId: true,
      },
    });

    await this.ensureSuperAdminsHaveMembership(created.id);

    const seed = await this.mergeTemplateRolesIntoCompany(
      created.id,
      template.currentVersionId,
    );

    await this.audit(actor, "ADMIN_PROVISION_TRIAL_COMPANY_FROM_TEMPLATE", {
      companyId: created.id,
    });

    return {
      company: created,
      seeded: seed,
    };
  }

  async reconcileCompanyToLatestTemplate(actor: AuthenticatedUser, companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, templateId: true, templateVersionId: true },
    });
    if (!company) throw new Error("Company not found");
    if (!company.templateId) throw new Error("Company is not attached to a template");

    const template = await this.prisma.organizationTemplate.findUnique({
      where: { id: company.templateId },
      select: { id: true, currentVersionId: true },
    });
    if (!template || !template.currentVersionId) {
      throw new Error("Template has no current version");
    }

    const prevVersionId = company.templateVersionId;

    // modulesChanged summary (based on template versions)
    let modulesChanged = 0;
    if (prevVersionId && prevVersionId !== template.currentVersionId) {
      const [prev, next] = await Promise.all([
        this.prisma.organizationTemplateModule.findMany({
          where: { templateVersionId: prevVersionId },
          select: { moduleCode: true, enabled: true },
        }),
        this.prisma.organizationTemplateModule.findMany({
          where: { templateVersionId: template.currentVersionId },
          select: { moduleCode: true, enabled: true },
        }),
      ]);

      const prevMap = new Map(prev.map(m => [m.moduleCode, m.enabled]));
      for (const m of next) {
        if (!prevMap.has(m.moduleCode)) {
          modulesChanged += 1;
          continue;
        }
        if (prevMap.get(m.moduleCode) !== m.enabled) modulesChanged += 1;
      }
    }

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        templateVersionId: template.currentVersionId,
      },
    });

    const seed = await this.mergeTemplateRolesIntoCompany(companyId, template.currentVersionId);

    await this.audit(actor, "ADMIN_RECONCILE_COMPANY_TEMPLATE", { companyId });

    return {
      companyId,
      previousVersionId: prevVersionId,
      currentVersionId: template.currentVersionId,
      modulesChanged,
      profilesAdded: seed.profilesAdded,
      permissionsAdded: seed.permissionsAdded,
    };
  }

  async backfillSuperAdminMemberships(actor: AuthenticatedUser) {
    await this.audit(actor, "ADMIN_BACKFILL_SUPERADMIN_MEMBERSHIPS");

    const [companies, superAdmins] = await Promise.all([
      this.prisma.company.findMany({ select: { id: true } }),
      this.prisma.user.findMany({
        where: { globalRole: GlobalRole.SUPER_ADMIN },
        select: { id: true, email: true },
      }),
    ]);

    if (!companies.length || !superAdmins.length) {
      return {
        companies: companies.length,
        superAdmins: superAdmins.length,
        createdMemberships: 0,
      };
    }

    const rows = superAdmins.flatMap(u =>
      companies.map(c => ({
        userId: u.id,
        companyId: c.id,
        role: Role.OWNER,
      }))
    );

    const result = await this.prisma.companyMembership.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return {
      companies: companies.length,
      superAdmins: superAdmins.length,
      createdMemberships: result.count,
    };
  }

  async listCompanyUsers(companyId: string, actor: AuthenticatedUser) {
    await this.audit(actor, "ADMIN_LIST_COMPANY_USERS", { companyId });

    return this.prisma.companyMembership.findMany({
      where: { companyId },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            id: true,
            email: true,
            globalRole: true
          }
        }
      }
    });
  }

  async listCompanyProjects(companyId: string, actor: AuthenticatedUser) {
    await this.audit(actor, "ADMIN_LIST_COMPANY_PROJECTS", { companyId });

    return this.prisma.project.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        status: true,
        city: true,
        state: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async listAuditLogs(limit = 100) {
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  async listPendingReputation(limit = 100) {
    return this.prisma.reputationRating.findMany({
      where: { moderationStatus: "PENDING" as any },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  private async recomputeCompanyReputation(companyId: string) {
    const agg = await this.prisma.reputationRating.aggregate({
      where: {
        subjectType: "COMPANY" as any,
        subjectCompanyId: companyId,
        moderationStatus: "APPROVED" as any,
        isActive: true,
        dimension: "OVERALL" as any
      },
      _avg: { score: true },
      _count: { score: true }
    });

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        reputationOverallAvg: (agg._avg.score as number | null) ?? 2.0,
        reputationOverallCount: agg._count.score ?? 0
      }
    });
  }

  private async recomputeUserReputation(userId: string) {
    const agg = await this.prisma.reputationRating.aggregate({
      where: {
        subjectType: "USER" as any,
        subjectUserId: userId,
        moderationStatus: "APPROVED" as any,
        isActive: true,
        dimension: "OVERALL" as any
      },
      _avg: { score: true },
      _count: { score: true }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        reputationOverallAvg: (agg._avg.score as number | null) ?? 2.0,
        reputationOverallCount: agg._count.score ?? 0
      }
    });
  }

  async moderateReputation(
    actor: AuthenticatedUser,
    id: string,
    status: "APPROVED" | "REJECTED"
  ) {
    const rating = await this.prisma.reputationRating.findUnique({
      where: { id },
    });

    if (!rating) {
      throw new Error("Reputation rating not found");
    }

    const updated = await this.prisma.reputationRating.update({
      where: { id },
      data: {
        moderationStatus: status as any,
        moderatedByUserId: actor.userId,
        moderatedAt: new Date(),
      },
    });

    if (updated.subjectType === "COMPANY") {
      await this.recomputeCompanyReputation(updated.subjectCompanyId as string);
    }
    if (updated.subjectType === "USER") {
      await this.recomputeUserReputation(updated.subjectUserId as string);
    }

    await this.audit(actor, "ADMIN_MODERATE_REPUTATION", {
      companyId: updated.subjectCompanyId ?? undefined,
      userId: updated.subjectUserId ?? undefined,
    });

    return updated;
  }

  /**
   * Seed one test user per company Role (OWNER, ADMIN, MEMBER, CLIENT)
   * in the actor's current company. User emails are role-based for easy testing,
   * e.g. owner+<companyId>@ncc.local.
   */
  async seedRoleUsersForCompany(actor: AuthenticatedUser) {
    const companyId = actor.companyId;
    if (!companyId) {
      throw new Error("Actor has no current companyId");
    }

    const roles: Role[] = [
      Role.OWNER,
      Role.ADMIN,
      Role.MEMBER,
      Role.CLIENT,
    ];

    const created: any[] = [];

    for (const role of roles) {
      const email = `${role.toLowerCase()}+${companyId}@ncc.local`;

      // Skip if a user with this email already exists
      let user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email,
            passwordHash: "dev-placeholder", // in dev you can reset via auth flows
            globalRole: "NONE"
          }
        });
      }

      // Ensure membership in this company with the given Role
      await this.prisma.companyMembership.upsert({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId,
          },
        },
        update: {
          role,
        },
        create: {
          userId: user.id,
          companyId,
          role,
        },
      });

      created.push({ email, role, userId: user.id });
    }

    await this.audit(actor, "ADMIN_SEED_ROLE_USERS", { companyId });

    return { companyId, users: created };
  }

  /**
   * Add an existing user (by email) to a target company with the given Role.
   * Used by SUPER_ADMIN to attach accounts (e.g. superadmin) to an existing tenant.
   */
  async addUserToCompanyByEmail(
    actor: AuthenticatedUser,
    params: { email: string; companyId: string; role: string }
  ) {
    const { email, companyId, role } = params;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    const membership = await this.prisma.companyMembership.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId
        }
      },
      update: {
        role: role as any,
      },
      create: {
        userId: user.id,
        companyId,
        role: role as any,
      }
    });

    await this.audit(actor, "ADMIN_ADD_USER_TO_COMPANY", {
      companyId,
      userId: user.id
    });

    return {
      user: { id: user.id, email: user.email },
      membership
    };
  }

  /**
   * Create or update a user with a specific password and attach them to a company
   * with the given role. This is used by trusted admins (Paul / superadmin) when
   * they have a known email address and want to hand a password directly to the user.
   */
  async createUserWithPassword(
    actor: AuthenticatedUser,
    params: { email: string; password: string; companyId: string; role: string; userType?: string }
  ) {
    const { email, password, companyId, role, userType } = params;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new Error("Company not found");
    }

    const allowedRoles: Role[] = [
      Role.OWNER,
      Role.ADMIN,
      Role.MEMBER,
      Role.CLIENT,
    ];
    if (!allowedRoles.includes(role as Role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    const passwordHash = await argon2.hash(password);

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      const resolvedUserType: UserType =
        (userType as UserType) || (role === "CLIENT" ? "CLIENT" : "INTERNAL");

      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          userType: resolvedUserType,
          globalRole: "NONE"
        }
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash }
      });
    }

    const membership = await this.prisma.companyMembership.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId
        }
      },
      update: {
        role: role as Role
      },
      create: {
        userId: user.id,
        companyId,
        role: role as Role
      }
    });

    await this.audit(actor, "ADMIN_CREATE_USER_WITH_PASSWORD", {
      companyId,
      userId: user.id
    });

    return {
      user: { id: user.id, email: user.email },
      membership
    };
  }
}
