import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

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
      select: {
        id: true,
        name: true,
        createdAt: true,
        memberships: {
          select: {
            role: true
          }
        }
      }
    });
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

  async listAuditLogs(limit = 100) {
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit
    });
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

    const roles = ["OWNER", "ADMIN", "MEMBER", "CLIENT"] as const;

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
            companyId
          }
        },
        update: {
          role: role as any
        },
        create: {
          userId: user.id,
          companyId,
          role: role as any
        }
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
        role: role as any
      },
      create: {
        userId: user.id,
        companyId,
        role: role as any
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
}
