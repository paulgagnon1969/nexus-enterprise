import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../modules/auth/jwt.strategy";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    actor: AuthenticatedUser,
    action: string,
    details: {
      companyId?: string;
      userId?: string;
      projectId?: string;
      metadata?: Record<string, any>;
    } = {}
  ) {
    const { companyId, userId, projectId, metadata } = details;

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.userId,
        actorEmail: actor.email,
        actorGlobalRole: actor.globalRole,
        action,
        targetCompanyId: companyId ?? null,
        targetUserId: userId ?? null,
        metadata: metadata
          ? (metadata as any)
          : companyId || userId || projectId
          ? ({ companyId, userId, projectId } as any)
          : null
      }
    });
  }
}
