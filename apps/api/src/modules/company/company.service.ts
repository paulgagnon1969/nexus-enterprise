import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { Role } from "@prisma/client";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { randomUUID } from "crypto";

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
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
              }
            }
          }
        }
      }
    });
  }

  async createCompany(name: string, userId: string, actor: AuthenticatedUser) {
    const company = await this.prisma.company.create({
      data: {
        name
      }
    });

    await this.prisma.companyMembership.create({
      data: {
        userId,
        companyId: company.id,
        role: Role.OWNER
      }
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
            userType: true
          }
        }
      }
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
}
