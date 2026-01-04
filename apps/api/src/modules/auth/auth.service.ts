import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import { RegisterDto, LoginDto, ChangePasswordDto } from "./dto/auth.dto";
import { Role, GlobalRole, UserType, CompanyTrialStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "./jwt.strategy";
import { EmailService } from "../../common/email.service";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PASSWORD_RESET_TTL_SECONDS = 60 * 15; // 15 minutes

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly email: EmailService
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isBcryptHash(hash: string | null | undefined): boolean {
    if (!hash) return false;
    return (
      hash.startsWith("$2a$") ||
      hash.startsWith("$2b$") ||
      hash.startsWith("$2y$") ||
      hash.startsWith("$2x$")
    );
  }

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
    const email = this.normalizeEmail(dto.email);

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } }
    });
    if (existing) {
      throw new BadRequestException("Email already in use");
    }

    const passwordHash = await argon2.hash(dto.password);

    const [user, company] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          email,
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

  private async ensureSuperAdminMemberships(userId: string) {
    const companies = await this.prisma.company.findMany({ select: { id: true } });
    if (!companies.length) return;

    // NOTE: We intentionally do NOT set isHidden here because some Prisma
    // clients in dev may be out of sync with the schema and not recognize
    // that field yet. The default is false, which is fine for login flows.
    await this.prisma.companyMembership.createMany({
      data: companies.map(c => ({
        userId,
        companyId: c.id,
        role: Role.OWNER,
        // isHidden: true,
      })),
      skipDuplicates: true,
    });
  }

  async bootstrapSuperAdmin(email: string, password: string) {
    const normalizedEmail = this.normalizeEmail(email);

    // Allow bootstrap only if there is no SUPER_ADMIN yet, or the only
    // SUPER_ADMIN is this same email (idempotent repair).
    const existingSuperAdmins = await this.prisma.user.findMany({
      where: { globalRole: GlobalRole.SUPER_ADMIN }
    });
    if (
      existingSuperAdmins.length > 0 &&
      !existingSuperAdmins.some(u => this.normalizeEmail(u.email) === normalizedEmail)
    ) {
      throw new BadRequestException("SUPER_ADMIN already exists");
    }

    const passwordHash = await argon2.hash(password);

    let user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } }
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
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

    // Ensure the superadmin can access every company.
    // Also ensure they have at least one company membership so login works.
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
          role: Role.OWNER,
        }
      });
    }

    await this.ensureSuperAdminMemberships(user.id);

    return { userId: user.id, email: user.email, globalRole: user.globalRole };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: {
        memberships: {
          // NOTE: Once the Prisma client has been regenerated with
          // Company.deletedAt, we can filter memberships here by
          // `company.deletedAt: null` to exclude deactivated orgs from login.
          include: {
            company: true,
            profile: { select: { code: true } },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Support legacy bcrypt hashes from older systems and avoid 500s on bad placeholders.
    let valid = false;

    if (this.isBcryptHash(user.passwordHash)) {
      // Legacy bcrypt hash (e.g. from Laravel).
      valid = await bcrypt.compare(dto.password, user.passwordHash);

      if (valid) {
        // On successful login, transparently upgrade to argon2.
        const newHash = await argon2.hash(dto.password);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        });
      }
    } else {
      // Normal path: argon2 hash stored by this API.
      try {
        valid = await argon2.verify(user.passwordHash, dto.password);
      } catch {
        // Hash is not a valid argon2 string (e.g. dev/onboarding placeholders or corrupt data).
        throw new UnauthorizedException("Invalid credentials");
      }
    }

    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      // Best-effort: ensure SUPER_ADMIN is silently attached to every company.
      // This avoids admin accounts getting "stuck" without access after data imports.
      await this.ensureSuperAdminMemberships(user.id);
    }

    const membership = (user as any).memberships[0];
    if (!membership) {
      throw new UnauthorizedException("User is not a member of any company");
    }

    const profileCode =
      (membership as any).profile?.code ?? this.getDefaultProfileCodeForRole(membership.role);

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      membership.companyId,
      membership.role,
      user.email,
      user.globalRole,
      profileCode
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

    let payload: {
      userId: string;
      companyId: string;
      role: Role;
      email: string;
      globalRole: GlobalRole;
      profileCode?: string | null;
    };

    try {
      payload = JSON.parse(stored);
    } catch {
      await redisClient.del(key);
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Validate required fields so we never mint tokens from malformed payloads.
    if (!payload.userId || !payload.companyId || !payload.role || !payload.email) {
      await redisClient.del(key);
      throw new UnauthorizedException("Invalid refresh token");
    }

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

    const inviteEmail = this.normalizeEmail(invite.email);

    let user = await this.prisma.user.findFirst({
      where: { email: { equals: inviteEmail, mode: "insensitive" } }
    });

    const passwordHash = await argon2.hash(password);

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: inviteEmail,
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
          companyId: invite.companyId,
        },
      },
      update: {
        role: invite.role,
      },
      create: {
        userId: user.id,
        companyId: invite.companyId,
        role: invite.role,
      },
      include: {
        profile: { select: { code: true } },
      },
    });

    await this.prisma.companyInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: new Date(),
        acceptedUserId: user.id
      }
    });

    const profileCode =
      (membership as any).profile?.code ?? this.getDefaultProfileCodeForRole(membership.role);

    const { accessToken, refreshToken } = await this.issueTokens(
      user.id,
      invite.companyId,
      membership.role,
      user.email,
      user.globalRole,
      profileCode
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
            company: true,
            profile: { select: { code: true } },
          },
        },
      },
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

    const profileCode =
      (membership as any).profile?.code ?? this.getDefaultProfileCodeForRole(membership.role);

    const { accessToken, refreshToken } = await this.issueTokens(
      target.id,
      membership.companyId,
      membership.role,
      target.email,
      target.globalRole,
      profileCode
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, globalRole: true }
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        isTrial: true,
        trialEndsAt: true,
        trialStatus: true,
        // When the Prisma client has been regenerated, we will also project
        // deletedAt here to block switching into deactivated orgs.
        deletedAt: true,
      },
    });

    if (!company) {
      throw new UnauthorizedException("Company not found");
    }

    // Once deletedAt is available on the client type, enforce that the target
    // organization is still active.
    if ((company as any).deletedAt) {
      throw new UnauthorizedException("Company not found or inactive");
    }

    // Block switching into expired trial organizations unless they have been
    // converted. This is a soft guard around trial lifecycle: ACTIVE trials are
    // usable; EXPIRED trials (or past-due ACTIVE) are read-only/blocked until
    // converted by Nexus Systems.
    if (
      company.isTrial &&
      company.trialStatus !== CompanyTrialStatus.CONVERTED &&
      company.trialEndsAt &&
      company.trialEndsAt.getTime() < Date.now()
    ) {
      // Best-effort: mark as EXPIRED so future checks are cheap.
      await this.prisma.company.update({
        where: { id: company.id },
        data: { trialStatus: CompanyTrialStatus.EXPIRED },
      });
      throw new UnauthorizedException(
        "This organization's trial has expired. Contact Nexus Systems to upgrade.",
      );
    }

    let membership = await this.prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId,
        },
      },
      include: {
        profile: { select: { code: true } },
      },
    });

    // SUPER_ADMIN should always be able to switch into any company.
    if (!membership && user.globalRole === GlobalRole.SUPER_ADMIN) {
      membership = await this.prisma.companyMembership.create({
        data: {
          userId,
          companyId,
          role: Role.OWNER,
        },
        include: {
          profile: { select: { code: true } },
        },
      });
    }

    if (!membership) {
      throw new UnauthorizedException("No access to this company");
    }

    const profileCode =
      (membership as any).profile?.code ?? this.getDefaultProfileCodeForRole(membership.role);

    const { accessToken, refreshToken } = await this.issueTokens(
      membership.userId,
      membership.companyId,
      membership.role,
      user.email,
      user.globalRole,
      profileCode
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

  async requestPasswordReset(email: string) {
    const normalizedEmail = this.normalizeEmail(email || "");

    // Always succeed (avoid user enumeration)
    if (!normalizedEmail) {
      return { ok: true };
    }

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true, email: true }
    });

    if (!user) {
      return { ok: true };
    }

    const resetToken = randomUUID();
    const redisClient = this.redis.getClient();
    await redisClient.setex(
      `pwdreset:${resetToken}`,
      PASSWORD_RESET_TTL_SECONDS,
      JSON.stringify({ userId: user.id })
    );

    const webBase = process.env.WEB_BASE_URL || "http://localhost:3000";
    const resetUrl = `${webBase.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;

    await this.email.sendMail({
      to: user.email,
      subject: "Reset your Nexus password",
      html: `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.4;">
          <h2 style="margin: 0 0 12px;">Password reset requested</h2>
          <p style="margin: 0 0 12px;">Click below to reset your password. This link expires in 15 minutes.</p>
          <p style="margin: 0 0 18px;">
            <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 14px; border-radius: 6px; text-decoration: none;">
              Reset password
            </a>
          </p>
          <p style="margin: 0; color: #6b7280; font-size: 12px;">If you didnt request this, you can ignore this email.</p>
        </div>
      `.trim(),
      text: `Reset your password: ${resetUrl} (expires in 15 minutes)`
    });

    return { ok: true };
  }

  async resetPasswordWithToken(token: string, password: string) {
    if (!token) {
      throw new BadRequestException("Reset token is required");
    }
    if (!password || password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    const redisClient = this.redis.getClient();
    const raw = await redisClient.get(`pwdreset:${token}`);
    if (!raw) {
      throw new BadRequestException("Reset token is invalid or expired");
    }

    let payload: { userId: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new BadRequestException("Reset token is invalid");
    }

    const passwordHash = await argon2.hash(password);

    await this.prisma.user.update({
      where: { id: payload.userId },
      data: { passwordHash }
    });

    await redisClient.del(`pwdreset:${token}`);

    return { ok: true };
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
