import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { GlobalRole, Role } from "@prisma/client";
import { AuditService } from "../../common/audit.service";
import { EmailService } from "../../common/email.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { randomUUID } from "crypto";

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
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
          name
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

    return invite;
  }

  async listMembers(companyId: string, actor: AuthenticatedUser) {
    if (actor.companyId !== companyId) {
      throw new Error("Cannot list members for a different company context");
    }

    return this.prisma.companyMembership.findMany({
      where: { companyId },
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
}
