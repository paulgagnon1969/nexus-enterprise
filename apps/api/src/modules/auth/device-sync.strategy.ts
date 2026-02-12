import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-custom";
import { Request } from "express";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "./jwt.strategy";
import { Role, GlobalRole } from "./auth.guards";

/**
 * DeviceSync authentication strategy.
 * 
 * Accepts permanent Person + Company tokens for mobile sync operations.
 * Header format: Authorization: DeviceSync <userSyncToken>:<companyWorkerInviteToken>
 * 
 * This provides a fallback when JWT and refresh tokens expire, enabling
 * reliable offline-first sync without requiring user re-authentication.
 */
@Injectable()
export class DeviceSyncStrategy extends PassportStrategy(Strategy, "device-sync") {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async validate(req: Request): Promise<AuthenticatedUser> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("DeviceSync ")) {
      throw new UnauthorizedException("Missing DeviceSync authorization header");
    }

    const tokenPart = authHeader.slice("DeviceSync ".length).trim();
    const [userSyncToken, companyToken] = tokenPart.split(":");

    if (!userSyncToken || !companyToken) {
      throw new UnauthorizedException("Invalid DeviceSync token format");
    }

    // Look up user by syncToken
    const user = await this.prisma.user.findUnique({
      where: { syncToken: userSyncToken },
      select: {
        id: true,
        email: true,
        globalRole: true,
        userType: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid sync token");
    }

    // Look up company by workerInviteToken
    const company = await this.prisma.company.findUnique({
      where: { workerInviteToken: companyToken },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (!company || company.deletedAt) {
      throw new UnauthorizedException("Invalid company token");
    }

    // Verify user has active membership in this company
    const membership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: company.id,
        },
      },
      select: {
        role: true,
        isActive: true,
        profile: { select: { code: true } },
      },
    });

    if (!membership || !membership.isActive) {
      throw new UnauthorizedException("User does not have active membership in this company");
    }

    // Return the authenticated user context (same shape as JWT strategy)
    return {
      userId: user.id,
      companyId: company.id,
      role: membership.role as Role,
      email: user.email,
      globalRole: (user.globalRole as GlobalRole) ?? GlobalRole.NONE,
      userType: user.userType ?? null,
      profileCode: membership.profile?.code ?? null,
    };
  }
}
