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
  // Optional backref when a referral is initiated from a personal contact.
  personalContactId?: string | null;
}

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly fortifiedCompanyId = "cmjr9okjz000401s6rdkbatvr";

  private async ensureFortifiedVisibilityForCandidate(
    prisma: any,
    candidateId: string,
    createdByUserId: string | null,
  ) {
    if (!candidateId) return;

    const existing = await prisma.candidatePoolVisibility.findFirst({
      where: {
        candidateId,
        visibleToCompanyId: this.fortifiedCompanyId,
      },
    });

    if (existing) return;

    const createdBy = createdByUserId ?? "system-fortified-visibility";

    await prisma.candidatePoolVisibility.create({
      data: {
        candidateId,
        visibleToCompanyId: this.fortifiedCompanyId,
        isAllowed: true,
        createdByUserId: createdBy,
      },
    });
  }

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

      await this.ensureFortifiedVisibilityForCandidate(tx, candidate.id, actor.userId ?? null);

      const referral = await tx.referral.create({
        data: {
          referrerUserId: actor.userId,
          prospectName: dto.prospectName ?? null,
          prospectEmail: email,
          prospectPhone: phone,
          token,
          candidateId: candidate.id,
          status: ReferralStatus.INVITED,
          personalContactId: dto.personalContactId ?? null,
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

  /**
   * Bulk-create referrals from a caller's personal contact book.
   */
  async inviteFromPersonalContacts(actor: AuthenticatedUser, personalContactIds: string[]) {
    if (!actor.userId) {
      throw new ForbiddenException("Missing user id for referrer.");
    }
    if (!personalContactIds?.length) {
      throw new BadRequestException("personalContactIds is required.");
    }

    const ownerUserId = actor.userId;

    const contacts = await this.prisma.personalContact.findMany({
      where: {
        ownerUserId,
        id: { in: personalContactIds },
      },
    });

    if (!contacts.length) {
      throw new BadRequestException("No matching personal contacts found for this user.");
    }

    const results = [] as Array<{
      personalContactId: string;
      referralId: string;
      referralToken: string;
      applyPath: string;
    }>;

    for (const contact of contacts) {
      const prospectName =
        contact.displayName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
        contact.email ||
        contact.phone ||
        null;

      const { referral, applyPath } = await this.createReferralForUser(actor, {
        prospectName,
        prospectEmail: contact.email,
        prospectPhone: contact.phone,
        personalContactId: contact.id,
      });

      results.push({
        personalContactId: contact.id,
        referralId: referral.id,
        referralToken: referral.token,
        applyPath,
      });
    }

    return { invitations: results };
  }

  async listCandidatesForSystem(actor: AuthenticatedUser) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view Nex-Net candidates.");
    }

    const candidates = await this.prisma.nexNetCandidate.findMany({
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
          take: 1,
        },
      },
      take: 200,
    });

    if (!candidates.length) {
      return [];
    }

    const userIds = Array.from(
      new Set(
        candidates
          .map(c => c.userId as string | null)
          .filter((id): id is string => !!id && typeof id === "string"),
      ),
    );
    const candidateIds = candidates.map(c => c.id);

    const memberships = userIds.length
      ? await this.prisma.companyMembership.findMany({
          where: { userId: { in: userIds } },
          select: {
            userId: true,
            companyId: true,
            role: true,
            company: {
              select: { id: true, name: true },
            },
          },
        })
      : [];

    const membershipsByUserId = new Map<string, typeof memberships>();
    for (const m of memberships) {
      const list = membershipsByUserId.get(m.userId) ?? [];
      list.push(m);
      membershipsByUserId.set(m.userId, list);
    }

    const interests = await this.prisma.candidateInterest.findMany({
      where: {
        candidateId: { in: candidateIds },
      },
    });
    const interestByCandidateAndCompany = new Map<string, string>();
    for (const ci of interests) {
      const key = `${ci.candidateId}|${ci.requestingCompanyId}`;
      if (!interestByCandidateAndCompany.has(key)) {
        interestByCandidateAndCompany.set(key, ci.status as string);
      }
    }

    // Aggregate how many distinct users have this candidate in their personal
    // contact book (by email/phone match). This is system-level only and does
    // not expose which users own the contacts.
    const emailKeyByCandidateId = new Map<string, Set<string>>();
    const phoneKeyByCandidateId = new Map<string, Set<string>>();

    const normalizeEmail = (value: string | null | undefined) => {
      const trimmed = (value ?? "").trim();
      return trimmed ? trimmed.toLowerCase() : null;
    };
    const normalizePhone = (value: string | null | undefined) => {
      const trimmed = (value ?? "").trim();
      return trimmed || null;
    };

    for (const c of candidates) {
      const emailSet = new Set<string>();
      const phoneSet = new Set<string>();

      const candEmail = normalizeEmail(c.email);
      if (candEmail) emailSet.add(candEmail);
      const userEmail = normalizeEmail((c.user as any)?.email ?? null);
      if (userEmail) emailSet.add(userEmail);

      const candPhone = normalizePhone(c.phone);
      if (candPhone) phoneSet.add(candPhone);

      if (emailSet.size) emailKeyByCandidateId.set(c.id, emailSet);
      if (phoneSet.size) phoneKeyByCandidateId.set(c.id, phoneSet);
    }

    const allEmailKeys = Array.from(
      new Set(
        Array.from(emailKeyByCandidateId.values()).flatMap(set => Array.from(set)),
      ),
    );
    const allPhoneKeys = Array.from(
      new Set(
        Array.from(phoneKeyByCandidateId.values()).flatMap(set => Array.from(set)),
      ),
    );

    const contactWhereOr: any[] = [];
    if (allEmailKeys.length) {
      contactWhereOr.push({ email: { in: allEmailKeys } });
    }
    if (allPhoneKeys.length) {
      contactWhereOr.push({ phone: { in: allPhoneKeys } });
    }

    const candidateContactOwnerIdsByCandidate = new Map<string, Set<string>>();

    if (contactWhereOr.length) {
      const contacts = await this.prisma.personalContact.findMany({
        where: { OR: contactWhereOr },
        select: { ownerUserId: true, email: true, phone: true },
      });

      for (const pc of contacts) {
        const ownersToMark = new Set<string>();
        const ownerId = pc.ownerUserId;
        if (!ownerId) continue;

        const emailKey = normalizeEmail(pc.email);
        const phoneKey = normalizePhone(pc.phone);

        if (emailKey) {
          for (const [candId, keys] of emailKeyByCandidateId.entries()) {
            if (keys.has(emailKey)) {
              let ownerSet = candidateContactOwnerIdsByCandidate.get(candId);
              if (!ownerSet) {
                ownerSet = new Set<string>();
                candidateContactOwnerIdsByCandidate.set(candId, ownerSet);
              }
              ownerSet.add(ownerId);
            }
          }
        }

        if (phoneKey) {
          for (const [candId, keys] of phoneKeyByCandidateId.entries()) {
            if (keys.has(phoneKey)) {
              let ownerSet = candidateContactOwnerIdsByCandidate.get(candId);
              if (!ownerSet) {
                ownerSet = new Set<string>();
                candidateContactOwnerIdsByCandidate.set(candId, ownerSet);
              }
              ownerSet.add(ownerId);
            }
          }
        }
      }
    }

    return candidates.map(c => {
      const userId = (c.userId as string | null) ?? null;
      const mems = userId ? membershipsByUserId.get(userId) ?? [] : [];

      const assignedTenants = mems.map(m => {
        const cid = m.companyId;
        const key = `${c.id}|${cid}`;
        const interestStatusRaw = interestByCandidateAndCompany.get(key) ?? null;

        return {
          companyId: cid,
          companyName: m.company?.name ?? cid,
          companyRole: m.role as string,
          interestStatus: interestStatusRaw ?? "NONE",
          isCurrentTenant: false,
        };
      });

      const assignedTenantCount = assignedTenants.length;

      const latestReferral = (c as any).referralsAsReferee?.[0] ?? null;
      const email = c.email ?? c.user?.email ?? null;
      const ownerSet = candidateContactOwnerIdsByCandidate.get(c.id) ?? new Set<string>();
      const personalContactMatchCount = ownerSet.size;

      return {
        candidateId: c.id,
        userId,
        email,
        firstName: c.firstName ?? c.user?.firstName ?? null,
        lastName: c.lastName ?? c.user?.lastName ?? null,
        phone: c.phone ?? null,
        source: c.source ?? null,
        status: c.status ?? null,
        createdAt: c.createdAt ?? null,
        primaryReferrerEmail: latestReferral?.referrer?.email ?? null,
        assignedTenantCount,
        assignedTenants,
        personalContactMatchCount,
      };
    });
  }

  /**
   * Tenant-facing view: Nex-Net candidates that are explicitly visible to
   * Nexus Fortified Structures via CandidatePoolVisibility.
   */
  async listCandidatesForFortified(actor: AuthenticatedUser) {
    if (actor.companyId !== this.fortifiedCompanyId) {
      throw new ForbiddenException("Only Nexus Fortified Structures can access this view.");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ForbiddenException("Only Nexus Fortified admins can access this view.");
    }

    const visRows = await this.prisma.candidatePoolVisibility.findMany({
      where: {
        visibleToCompanyId: this.fortifiedCompanyId,
        isAllowed: true,
      },
      select: {
        candidateId: true,
      },
      take: 500,
    });

    const candidateIds = Array.from(
      new Set(
        visRows
          .map(v => v.candidateId)
          .filter((id): id is string => !!id && typeof id === "string"),
      ),
    );

    if (!candidateIds.length) {
      return [];
    }

    const candidates = await this.prisma.nexNetCandidate.findMany({
      where: {
        id: { in: candidateIds },
        isDeletedSoft: false,
        // Hide private test candidates from Fortified by default.
        visibilityScope: { not: "PRIVATE_TEST" as any },
      },
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
          take: 1,
        },
      },
      take: 500,
    });

    if (!candidates.length) {
      return [];
    }

    const userIds = Array.from(
      new Set(
        candidates
          .map(c => c.userId as string | null)
          .filter((id): id is string => !!id && typeof id === "string"),
      ),
    );

    const memberships = userIds.length
      ? await this.prisma.companyMembership.findMany({
          where: { userId: { in: userIds } },
          select: {
            userId: true,
            companyId: true,
            role: true,
            company: {
              select: { id: true, name: true },
            },
          },
        })
      : [];

    const membershipsByUserId = new Map<string, typeof memberships>();
    for (const m of memberships) {
      const list = membershipsByUserId.get(m.userId) ?? [];
      list.push(m);
      membershipsByUserId.set(m.userId, list);
    }

    const interests = await this.prisma.candidateInterest.findMany({
      where: {
        candidateId: { in: candidateIds },
      },
    });
    const interestByCandidateAndCompany = new Map<string, string>();
    for (const ci of interests) {
      const key = `${ci.candidateId}|${ci.requestingCompanyId}`;
      if (!interestByCandidateAndCompany.has(key)) {
        interestByCandidateAndCompany.set(key, ci.status as string);
      }
    }

    return candidates.map(c => {
      const userId = (c.userId as string | null) ?? null;
      const mems = userId ? membershipsByUserId.get(userId) ?? [] : [];

      const assignedTenants = mems.map(m => {
        const cid = m.companyId;
        const key = `${c.id}|${cid}`;
        const interestStatusRaw = interestByCandidateAndCompany.get(key) ?? null;

        return {
          companyId: cid,
          companyName: m.company?.name ?? cid,
          companyRole: m.role as string,
          interestStatus: interestStatusRaw ?? "NONE",
          isCurrentTenant: cid === this.fortifiedCompanyId,
        };
      });

      const assignedTenantCount = assignedTenants.length;
      const latestReferral = (c as any).referralsAsReferee?.[0] ?? null;
      const email = c.email ?? c.user?.email ?? null;

      return {
        candidateId: c.id,
        userId,
        email,
        firstName: c.firstName ?? c.user?.firstName ?? null,
        lastName: c.lastName ?? c.user?.lastName ?? null,
        phone: c.phone ?? null,
        source: c.source ?? null,
        status: c.status ?? null,
        createdAt: c.createdAt ?? null,
        primaryReferrerEmail: latestReferral?.referrer?.email ?? null,
        assignedTenantCount,
        assignedTenants,
      };
    });
  }

  // System-wide candidate assignment history (employment + pay snapshots).
  // SUPER_ADMIN only. This returns a summary of CandidateInterest rows for the
  // given candidate, enriched with company names so NCC can render employment
  // timelines.
  async listCandidateAssignments(actor: AuthenticatedUser, candidateId: string) {
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Nexus System admins can view candidate assignments.");
    }

    const candidate = await this.prisma.nexNetCandidate.findUnique({
      where: { id: candidateId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!candidate) {
      throw new BadRequestException("Candidate not found");
    }

    const interests = await this.prisma.candidateInterest.findMany({
      where: { candidateId },
      orderBy: [
        { employmentStartDate: "asc" },
        { createdAt: "asc" },
      ],
    });

    if (!interests.length) {
      return {
        candidate: {
          id: candidate.id,
          userId: candidate.userId,
          email: candidate.email ?? candidate.user?.email ?? null,
          firstName: candidate.firstName ?? candidate.user?.firstName ?? null,
          lastName: candidate.lastName ?? candidate.user?.lastName ?? null,
        },
        assignments: [],
      };
    }

    const companyIds = Array.from(
      new Set(interests.map(ci => ci.requestingCompanyId).filter(Boolean)),
    );

    const companies = companyIds.length
      ? await this.prisma.company.findMany({
          where: { id: { in: companyIds as string[] } },
          select: { id: true, name: true },
        })
      : [];
    const companyNameById = new Map(companies.map(c => [c.id, c.name]));

    const assignments = interests.map(ci => ({
      id: ci.id,
      companyId: ci.requestingCompanyId,
      companyName: companyNameById.get(ci.requestingCompanyId) ?? ci.requestingCompanyId,
      status: ci.status,
      employmentStartDate: ci.employmentStartDate,
      employmentEndDate: ci.employmentEndDate,
      baseHourlyRate: ci.baseHourlyRate,
      dayRate: ci.dayRate,
      cpHourlyRate: ci.cpHourlyRate,
      cpFringeHourlyRate: ci.cpFringeHourlyRate,
      createdAt: ci.createdAt,
      updatedAt: ci.updatedAt,
    }));

    return {
      candidate: {
        id: candidate.id,
        userId: candidate.userId,
        email: candidate.email ?? candidate.user?.email ?? null,
        firstName: candidate.firstName ?? candidate.user?.firstName ?? null,
        lastName: candidate.lastName ?? candidate.user?.lastName ?? null,
      },
      assignments,
    };
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
