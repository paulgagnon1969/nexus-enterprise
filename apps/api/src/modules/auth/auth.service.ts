import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import { RegisterDto, LoginDto, ChangePasswordDto } from "./dto/auth.dto";
import { Role, GlobalRole, UserType } from "@prisma/client";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "./jwt.strategy";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService
  ) {}

  private getDefaultProfileCodeForRole(role: Role): string | null {
    switch (role) {
      case Role.OWNER:
      case Role.ADMIN:
        return "PM_OWNER"; // project manager / owner level
      case Role.MEMBER:
        return "FIELD_CREW"; // most restrictive internal role by default
      case Role.CLIENT:
        return "CLIENT";
      default:
        return null;
    }
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });
    if (existing) {
      throw new BadRequestException("Email already in use");
    }

    const passwordHash = await argon2.hash(dto.password);

    const [user, company] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          userType: UserType.INTERNAL
        }
      }),
      this.prisma.company.create({
        data: {
          name: dto.companyName
        }
      })
    ]);

    await this.prisma.companyMembership.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: Role.OWNER
      }
    });

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      company.id,
      Role.OWNER,
      user.email,
      user.globalRole,
      this.getDefaultProfileCodeForRole(Role.OWNER)
    );

    return {
      user: { id: user.id, email: user.email },
      company: { id: company.id, name: company.name },
      accessToken,
      refreshToken
    };
  }

  async bootstrapSuperAdmin(email: string, password: string) {
    // Allow bootstrap only if there is no SUPER_ADMIN yet, or the only
    // SUPER_ADMIN is this same email (idempotent repair).
    const existingSuperAdmins = await this.prisma.user.findMany({
      where: { globalRole: GlobalRole.SUPER_ADMIN }
    });
    if (
      existingSuperAdmins.length > 0 &&
      !existingSuperAdmins.some(u => u.email === email)
    ) {
      throw new BadRequestException("SUPER_ADMIN already exists");
    }

    const passwordHash = await argon2.hash(password);

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          userType: UserType.INTERNAL,
          globalRole: GlobalRole.SUPER_ADMIN
        }
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          globalRole: GlobalRole.SUPER_ADMIN
        }
      });
    }

    // Ensure the superadmin has at least one company membership so login works.
    const existingMemberships = await this.prisma.companyMembership.findMany({
      where: { userId: user.id }
    });
    if (existingMemberships.length === 0) {
      const company = await this.prisma.company.create({
        data: { name: "Nexus System" }
      });
      await this.prisma.companyMembership.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: Role.OWNER
        }
      });
    }

    return { userId: user.id, email: user.email, globalRole: user.globalRole };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          include: { company: true }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const membership = user.memberships[0];
    if (!membership) {
      throw new UnauthorizedException("User is not a member of any company");
    }

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      membership.companyId,
      membership.role,
      user.email,
      user.globalRole,
      this.getDefaultProfileCodeForRole(membership.role)
    );

    return {
      user: { id: user.id, email: user.email },
      company: { id: membership.company.id, name: membership.company.name },
      accessToken,
      refreshToken
    };
  }

  async refresh(refreshToken: string) {
    const redisClient = this.redis.getClient();
    const key = `refresh:${refreshToken}`;
    const stored = await redisClient.get(key);

    if (!stored) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const payload = JSON.parse(stored) as {
      userId: string;
      companyId: string;
      role: Role;
      email: string;
      globalRole: GlobalRole;
      profileCode?: string | null;
    };

    // Rotate refresh token
    await redisClient.del(key);

    const { accessToken, refreshToken: newRefresh } = await this.issueTokens(
      payload.userId,
      payload.companyId,
      payload.role,
      payload.email,
      payload.globalRole,
      payload.profileCode ?? this.getDefaultProfileCodeForRole(payload.role)
    );

    return {
      accessToken,
      refreshToken: newRefresh
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const newHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash }
    });

    return { success: true };
  }

  async acceptInvite(token: string, password: string) {
    const invite = await this.prisma.companyInvite.findFirst({
      where: {
        token,
        acceptedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        company: true
      }
    });

    if (!invite) {
      throw new BadRequestException("Invite is invalid or expired");
    }

    let user = await this.prisma.user.findUnique({
      where: { email: invite.email }
    });

    const passwordHash = await argon2.hash(password);

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: invite.email,
          passwordHash,
          userType:
            invite.role === Role.CLIENT ? UserType.CLIENT : UserType.INTERNAL
        }
      });
    } else if (!user.passwordHash) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash }
      });
    }

    const membership = await this.prisma.companyMembership.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: invite.companyId
        }
      },
      update: {
        role: invite.role
      },
      create: {
        userId: user.id,
        companyId: invite.companyId,
        role: invite.role
      }
    });

    await this.prisma.companyInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedUserId: user.id
      }
    });

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      invite.companyId,
      membership.role,
      user.email,
      user.globalRole,
      this.getDefaultProfileCodeForRole(membership.role)
    );

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        actorGlobalRole: user.globalRole,
        action: "INVITE_ACCEPTED",
        targetCompanyId: invite.companyId,
        targetUserId: user.id,
        metadata: {
          inviteId: invite.id,
          email: invite.email
        } as any
      }
    });

    return {
      user: { id: user.id, email: user.email },
      company: { id: invite.company.id, name: invite.company.name },
      accessToken,
      refreshToken
    };
  }

  async adminImpersonate(
    actor: AuthenticatedUser,
    targetUserId: string,
    companyId?: string
  ) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new UnauthorizedException("Only SUPER_ADMIN can impersonate users");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        memberships: {
          include: {
            company: true
          }
        }
      }
    });

    if (!target) {
      throw new UnauthorizedException("Target user not found");
    }

    const membership = companyId
      ? target.memberships.find(m => m.companyId === companyId)
      : target.memberships[0];

    if (!membership) {
      throw new UnauthorizedException(
        "Target user has no membership for the requested company"
      );
    }

    const { accessToken, refreshToken } = await this.issueTokens(
      target.id,
      membership.companyId,
      membership.role,
      target.email,
      target.globalRole,
      this.getDefaultProfileCodeForRole(membership.role)
    );

    await this.prisma.adminAuditLog.create({
      data: {
        actorId: actor.userId,
        actorEmail: actor.email,
        actorGlobalRole: actor.globalRole,
        action: "ADMIN_IMPERSONATE",
        targetCompanyId: membership.companyId,
        targetUserId: target.id,
        metadata: {
          actorCompanyId: actor.companyId,
          targetCompanyId: membership.companyId,
          targetUserId: target.id
        } as any
      }
    });

    return {
      user: { id: target.id, email: target.email },
      company: { id: membership.company.id, name: membership.company.name },
      accessToken,
      refreshToken
    };
  }

  async switchCompany(userId: string, companyId: string) {
    const membership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    });

    if (!membership) {
      throw new UnauthorizedException("No access to this company");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, globalRole: true }
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true }
    });

    if (!company) {
      throw new UnauthorizedException("Company not found");
    }

    const { accessToken, refreshToken } = await this.issueTokens(
      membership.userId,
      membership.companyId,
      membership.role,
      user.email,
      user.globalRole,
      this.getDefaultProfileCodeForRole(membership.role)
    );

    // Audit user-initiated company context switches
    await this.prisma.adminAuditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        actorGlobalRole: user.globalRole,
        action: "AUTH_SWITCH_COMPANY",
        targetCompanyId: company.id,
        targetUserId: user.id,
        metadata: {
          companyId: company.id,
          userId: user.id
        } as any
      }
    });

    return {
      user,
      company,
      accessToken,
      refreshToken
    };
  }

  private async issueTokens(
    userId: string,
    companyId: string,
    role: Role,
    email: string,
    globalRole: GlobalRole,
    profileCode?: string | null
  ) {
    const payload = { sub: userId, companyId, role, email, globalRole, profileCode };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || "change-me-access",
      expiresIn: Number(process.env.JWT_ACCESS_TTL) || 900
    });

    const refreshToken = randomUUID();
    const redisClient = this.redis.getClient();
    await redisClient.setex(
      `refresh:${refreshToken}`,
      REFRESH_TTL_SECONDS,
      JSON.stringify(payload)
    );

    return { accessToken, refreshToken };
  }
}
