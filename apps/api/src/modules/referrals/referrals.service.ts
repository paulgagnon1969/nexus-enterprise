import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { randomBytes } from "node:crypto";
import { GlobalRole } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  NexNetSource,
  NexNetStatus,
  ReferralStatus,
  CandidateTrainingStatus,
  CandidateCertificationStatus,
} from "@prisma/client";

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

  // --- Certification catalog & templates (admin/system only) ---

  async listCertificationTypes(actor: AuthenticatedUser) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view certification types.");
    }

    return this.prisma.certificationType.findMany({
      orderBy: { code: "asc" },
    });
  }

  async getCertificationType(actor: AuthenticatedUser, id: string) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view certification types.");
    }

    const certType = await this.prisma.certificationType.findUnique({ where: { id } });
    if (!certType) {
      throw new BadRequestException("Certification type not found");
    }
    return certType;
  }

  async updateCertificationTemplateHtml(
    actor: AuthenticatedUser,
    id: string,
    html: string,
  ) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can edit certification templates.");
    }

    // We intentionally do not sanitize here; the admin UI should handle safe editing,
    // and rendering will be done in a controlled context.
    return this.prisma.certificationType.update({
      where: { id },
      data: { certificateTemplateHtml: html },
    });
  }

  // --- Candidate training & certification management (admin/system only) ---

  async getCandidateTraining(actor: AuthenticatedUser, candidateId: string) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view candidate training.");
    }

    return this.prisma.candidateTrainingAssignment.findMany({
      where: { candidateId },
      orderBy: { createdAt: "desc" },
    });
  }

  async assignTrainingToCandidate(
    actor: AuthenticatedUser,
    candidateId: string,
    input: { trainingModuleId: string; isRequired?: boolean | null },
  ) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can assign training.");
    }

    const now = new Date();

    return this.prisma.candidateTrainingAssignment.create({
      data: {
        candidateId,
        trainingModuleId: input.trainingModuleId,
        assignedByUserId: actor.userId ?? null,
        assignedAt: now,
        status: CandidateTrainingStatus.NOT_STARTED,
        isRequired: input.isRequired ?? true,
      },
    });
  }

  async getCandidateCertifications(actor: AuthenticatedUser, candidateId: string) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view candidate certifications.");
    }

    return this.prisma.candidateCertification.findMany({
      where: { candidateId },
      orderBy: { createdAt: "desc" },
    });
  }

  async upsertCandidateCertification(
    actor: AuthenticatedUser,
    candidateId: string,
    input: {
      certificationTypeId: string;
      licenseNumber?: string | null;
      issuedBy?: string | null;
      issuedAt?: Date | null;
      effectiveAt?: Date | null;
      expiresAt?: Date | null;
      status?: CandidateCertificationStatus | null;
      verificationNotes?: string | null;
    },
  ) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can edit candidate certifications.");
    }

    const existing = await this.prisma.candidateCertification.findFirst({
      where: {
        candidateId,
        certificationTypeId: input.certificationTypeId,
      },
    });

    const baseData = {
      candidateId,
      certificationTypeId: input.certificationTypeId,
      licenseNumber: input.licenseNumber ?? null,
      issuedBy: input.issuedBy ?? null,
      issuedAt: input.issuedAt ?? null,
      effectiveAt: input.effectiveAt ?? null,
      expiresAt: input.expiresAt ?? null,
      status: input.status ?? CandidateCertificationStatus.PENDING_VERIFICATION,
      verifiedByUserId: actor.userId ?? null,
      verifiedAt: new Date(),
      verificationNotes: input.verificationNotes ?? null,
    } as const;

    if (!existing) {
      return this.prisma.candidateCertification.create({
        data: baseData,
      });
    }

    return this.prisma.candidateCertification.update({
      where: { id: existing.id },
      data: baseData,
    });
  }

  async getCandidateMarketProfile(actor: AuthenticatedUser, candidateId: string) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view market profiles.");
    }

    return this.prisma.candidateMarketProfile.findUnique({
      where: { candidateId },
    });
  }

  /**
   * Render a certificate's HTML by merging a CertificationType template with
   * a CandidateCertification + NexNetCandidate context. SUPER_ADMIN only.
   */
  async renderCandidateCertificateHtml(actor: AuthenticatedUser, certificationId: string) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can render certificates.");
    }

    const cert = await this.prisma.candidateCertification.findUnique({
      where: { id: certificationId },
    });
    if (!cert) {
      throw new BadRequestException("Candidate certification not found");
    }

    const [certType, candidate] = await Promise.all([
      this.prisma.certificationType.findUnique({ where: { id: cert.certificationTypeId } }),
      this.prisma.nexNetCandidate.findUnique({ where: { id: cert.candidateId } }),
    ]);

    if (!certType) {
      throw new BadRequestException("Certification type not found");
    }
    if (!candidate) {
      throw new BadRequestException("Candidate not found");
    }

    const template = certType.certificateTemplateHtml ||
      "<html><body><h1>{{cert_name}}</h1><p>awarded to {{candidate_name}}</p></body></html>";

    const candidateName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") ||
      candidate.email ||
      candidate.id;

    const issuedAt = cert.issuedAt ? cert.issuedAt.toISOString().slice(0, 10) : "";
    const effectiveAt = cert.effectiveAt ? cert.effectiveAt.toISOString().slice(0, 10) : "";
    const expiresAt = cert.expiresAt ? cert.expiresAt.toISOString().slice(0, 10) : "";

    const context: Record<string, string> = {
      candidate_name: candidateName,
      candidate_first_name: candidate.firstName ?? "",
      candidate_last_name: candidate.lastName ?? "",
      candidate_email: candidate.email ?? "",
      cert_name: certType.name,
      cert_code: certType.code,
      issuing_authority: certType.issuingAuthority ?? "",
      license_number: cert.licenseNumber ?? "",
      issued_at: issuedAt,
      effective_at: effectiveAt,
      expires_at: expiresAt,
    };

    const html = this.applyTemplatePlaceholders(template, context);

    return {
      html,
      context,
    };
  }

  private applyTemplatePlaceholders(template: string, context: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      result = result.replace(pattern, value ?? "");
    }
    return result;
  }

  async upsertCandidateMarketProfile(
    actor: AuthenticatedUser,
    candidateId: string,
    input: {
      publicId?: string | null;
      headline?: string | null;
      skillsSummary?: string | null;
      credentialsSummary?: string | null;
      locationRegion?: string | null;
      ratingNumeric?: number | null;
      ratingLabel?: string | null;
      rateMin?: number | null;
      rateMax?: number | null;
    },
  ) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can edit market profiles.");
    }

    const existing = await this.prisma.candidateMarketProfile.findUnique({
      where: { candidateId },
    });

    if (!existing) {
      const createData: any = {
        candidateId,
        headline: input.headline ?? null,
        skillsSummary: input.skillsSummary ?? null,
        credentialsSummary: input.credentialsSummary ?? null,
        locationRegion: input.locationRegion ?? null,
        ratingNumeric: input.ratingNumeric ?? null,
        ratingLabel: input.ratingLabel ?? null,
        rateMin: input.rateMin ?? null,
        rateMax: input.rateMax ?? null,
      };
      if (input.publicId != null) {
        createData.publicId = input.publicId;
      }

      return this.prisma.candidateMarketProfile.create({
        data: createData,
      });
    }

    return this.prisma.candidateMarketProfile.update({
      where: { candidateId },
      data: {
        publicId: input.publicId ?? existing.publicId,
        headline: input.headline ?? null,
        skillsSummary: input.skillsSummary ?? null,
        credentialsSummary: input.credentialsSummary ?? null,
        locationRegion: input.locationRegion ?? null,
        ratingNumeric: input.ratingNumeric ?? null,
        ratingLabel: input.ratingLabel ?? null,
        rateMin: input.rateMin ?? null,
        rateMax: input.rateMax ?? null,
      },
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
