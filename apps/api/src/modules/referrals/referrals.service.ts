import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { randomBytes } from "node:crypto";
import { GlobalRole } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { NexNetSource, NexNetStatus, ReferralStatus } from "@prisma/client";

interface CreateReferralDto {
  prospectName?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
}

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateToken(): string {
    return randomBytes(24).toString("hex");
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    const trimmed = (email ?? "").trim();
    return trimmed ? trimmed.toLowerCase() : null;
  }

  private normalizePhone(phone: string | null | undefined): string | null {
    const trimmed = (phone ?? "").trim();
    return trimmed || null;
  }

  async createReferralForUser(actor: AuthenticatedUser, dto: CreateReferralDto) {
    const email = this.normalizeEmail(dto.prospectEmail);
    const phone = this.normalizePhone(dto.prospectPhone);

    if (!email && !phone) {
      throw new BadRequestException("A prospect email or phone number is required for a referral.");
    }

    if (!actor.userId) {
      throw new ForbiddenException("Missing user id for referrer.");
    }

    const token = this.generateToken();

    const result = await this.prisma.$transaction(async (tx) => {
      // Try to find or create a NexNetCandidate based on email (preferred) or phone.
      let candidate = null as any;

      if (email) {
        candidate = await tx.nexNetCandidate.findFirst({
          where: { email },
        });
      }

      if (!candidate && phone) {
        candidate = await tx.nexNetCandidate.findFirst({
          where: {
            phone,
          },
        });
      }

      if (!candidate) {
        // Optionally link to an existing user by email if one exists.
        let linkedUserId: string | null = null;
        if (email) {
          const existingUser = await tx.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true },
          });
          if (existingUser) {
            linkedUserId = existingUser.id;
          }
        }

        candidate = await tx.nexNetCandidate.create({
          data: {
            userId: linkedUserId,
            firstName: dto.prospectName ?? null,
            lastName: null,
            email,
            phone,
            source: NexNetSource.REFERRAL,
            status: NexNetStatus.NOT_STARTED,
          },
        });
      }

      const referral = await tx.referral.create({
        data: {
          referrerUserId: actor.userId,
          prospectName: dto.prospectName ?? null,
          prospectEmail: email,
          prospectPhone: phone,
          token,
          candidateId: candidate.id,
          status: ReferralStatus.INVITED,
        },
      });

      return { referral, candidate };
    });

    return {
      ...result,
      applyPath: `/apply?referralToken=${token}`,
    };
  }

  async listReferralsForUser(actor: AuthenticatedUser) {
    if (!actor.userId) {
      throw new ForbiddenException("Missing user id for referrer.");
    }

    return this.prisma.referral.findMany({
      where: { referrerUserId: actor.userId },
      orderBy: { createdAt: "desc" },
      include: {
        candidate: true,
        referee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      take: 200,
    });
  }

  async getReferralSummaryForUser(actor: AuthenticatedUser) {
    if (!actor.userId) {
      throw new ForbiddenException("Missing user id for referrer.");
    }

    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: actor.userId },
    });

    const totalInvited = referrals.length;
    const totalConfirmedByReferee = referrals.filter(r => r.referralConfirmedByReferee).length;
    const totalRejectedByReferee = referrals.filter(r => r.referralRejectedByReferee).length;

    // NOTE: Earnings are currently stubbed to zero. Payroll will write concrete
    // ReferralEarning rows in a future iteration; this summary shape is ready
    // for that integration.
    return {
      totals: {
        totalInvited,
        totalConfirmedByReferee,
        totalRejectedByReferee,
        totalWithEarnings: 0,
      },
      earnings: {
        totalEarnedCents: 0,
        trailing30DaysEarnedCents: 0,
        currency: "USD",
      },
      perReferee: [] as any[],
    };
  }

  async listReferralsForSystem(actor: AuthenticatedUser) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view all referrals.");
    }

    return this.prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        referee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        candidate: true,
      },
      take: 200,
    });
  }

  async listCandidatesForSystem(actor: AuthenticatedUser) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view Nex-Net candidates.");
    }

    return this.prisma.nexNetCandidate.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        referralsAsReferee: {
          include: {
            referrer: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      take: 200,
    });
  }

  // Aggregate view for "gaming" detection: summarize referee rejections per referrer.
  async listGamingAlertsForSystem(actor: AuthenticatedUser) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view gaming alerts.");
    }

    const referrals = await this.prisma.referral.findMany({
      include: {
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const byReferrer = new Map<string, {
      referrerId: string;
      email: string | null;
      name: string | null;
      total: number;
      rejected: number;
      confirmed: number;
      pending: number;
      lastReferralAt: Date | null;
      lastRejectedAt: Date | null;
    }>();

    for (const r of referrals) {
      if (!r.referrerUserId || !r.referrer) continue;
      const key = r.referrerUserId;
      const existing = byReferrer.get(key) ?? {
        referrerId: r.referrer.id,
        email: r.referrer.email ?? null,
        name: [r.referrer.firstName, r.referrer.lastName].filter(Boolean).join(" ") || null,
        total: 0,
        rejected: 0,
        confirmed: 0,
        pending: 0,
        lastReferralAt: null,
        lastRejectedAt: null,
      };

      existing.total += 1;

      if (r.referralRejectedByReferee) {
        existing.rejected += 1;
        if (!existing.lastRejectedAt || r.createdAt > existing.lastRejectedAt) {
          existing.lastRejectedAt = r.createdAt;
        }
      } else if (r.referralConfirmedByReferee) {
        existing.confirmed += 1;
      } else {
        existing.pending += 1;
      }

      if (!existing.lastReferralAt || r.createdAt > existing.lastReferralAt) {
        existing.lastReferralAt = r.createdAt;
      }

      byReferrer.set(key, existing);
    }

    const rows = Array.from(byReferrer.values()).map(row => {
      const rejectionRate = row.total > 0 ? row.rejected / row.total : 0;
      return {
        referrerId: row.referrerId,
        referrerEmail: row.email,
        referrerName: row.name,
        totalReferrals: row.total,
        rejectedByReferee: row.rejected,
        confirmedByReferee: row.confirmed,
        pending: row.pending,
        rejectionRate,
        lastReferralAt: row.lastReferralAt,
        lastRejectedAt: row.lastRejectedAt,
      };
    });

    // Sort most suspicious first: by rejected count desc, then rejection rate desc.
    rows.sort((a, b) => {
      if (b.rejectedByReferee !== a.rejectedByReferee) {
        return b.rejectedByReferee - a.rejectedByReferee;
      }
      return b.rejectionRate - a.rejectionRate;
    });

    return rows;
  }

  // Public lookup: minimal referral + referrer info by token for /apply?referralToken=...
  async lookupByToken(token: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { token },
      include: {
        referrer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!referral) {
      return null;
    }

    return {
      id: referral.id,
      token: referral.token,
      prospectEmail: referral.prospectEmail,
      prospectPhone: referral.prospectPhone,
      status: referral.status,
      referrer: referral.referrer,
    };
  }
}
