import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { Role, UserType, NexNetStatus, NexNetSource, ReferralStatus, $Enums } from "@prisma/client";
import { encryptPortfolioHrJson, decryptPortfolioHrJson } from "../../common/crypto/portfolio-hr.crypto";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../../common/email.service";

function calculateProfileCompletionPercent(user: {
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): number {
  const hasName = !!(user.firstName && user.firstName.trim()) && !!(user.lastName && user.lastName.trim());
  const hasEmail = !!(user.email && user.email.trim());

  let score = 0;
  if (hasName && hasEmail) {
    score = 10;
  }

  return Math.max(10, Math.min(score, 100));
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private readonly fortifiedCompanyId = "cmjr9okjz000401s6rdkbatvr";
  // Canonical Nexus System company id used for the recruiting pool.
  private readonly nexusSystemCompanyId = "cmjr7o4zs000101s6z1rt1ssz";

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

  private normalizeEmail(email: string): string {
    return (email || "").trim().toLowerCase();
  }

  private normalizeProfileField(value?: string | null): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  // Best-effort normalization of US state values to two-letter abbreviations.
  // Accepts inputs like "Arizona", "az", "AZ" and returns "AZ". If the
  // value cannot be mapped, we return a trimmed version unchanged.
  private normalizeUsState(value?: string | null): string | null {
    const base = this.normalizeProfileField(value);
    if (!base) return null;

    const upper = base.toUpperCase();
    // Already looks like a 2-letter code.
    if (/^[A-Z]{2}$/.test(upper)) {
      return upper;
    }

    const map: Record<string, string> = {
      ALABAMA: "AL",
      ALASKA: "AK",
      ARIZONA: "AZ",
      ARKANSAS: "AR",
      CALIFORNIA: "CA",
      COLORADO: "CO",
      CONNECTICUT: "CT",
      DELAWARE: "DE",
      "DISTRICT OF COLUMBIA": "DC",
      "WASHINGTON DC": "DC",
      FLORIDA: "FL",
      GEORGIA: "GA",
      HAWAII: "HI",
      IDAHO: "ID",
      ILLINOIS: "IL",
      INDIANA: "IN",
      IOWA: "IA",
      KANSAS: "KS",
      KENTUCKY: "KY",
      LOUISIANA: "LA",
      MAINE: "ME",
      MARYLAND: "MD",
      MASSACHUSETTS: "MA",
      MICHIGAN: "MI",
      MINNESOTA: "MN",
      MISSISSIPPI: "MS",
      MISSOURI: "MO",
      MONTANA: "MT",
      NEBRASKA: "NE",
      NEVADA: "NV",
      "NEW HAMPSHIRE": "NH",
      "NEW JERSEY": "NJ",
      "NEW MEXICO": "NM",
      "NEW YORK": "NY",
      "NORTH CAROLINA": "NC",
      "NORTH DAKOTA": "ND",
      OHIO: "OH",
      OKLAHOMA: "OK",
      OREGON: "OR",
      PENNSYLVANIA: "PA",
      "RHODE ISLAND": "RI",
      "SOUTH CAROLINA": "SC",
      "SOUTH DAKOTA": "SD",
      TENNESSEE: "TN",
      TEXAS: "TX",
      UTAH: "UT",
      VERMONT: "VT",
      VIRGINIA: "VA",
      WASHINGTON: "WA",
      "WEST VIRGINIA": "WV",
      WISCONSIN: "WI",
      WYOMING: "WY",
    };

    const key = upper.replace(/\./g, "").trim();
    const mapped = map[key];
    return mapped || upper;
  }

  // --- Candidate status definitions (Prospective Candidates pipeline) ---

  async listStatusDefinitions(companyId: string, actor: AuthenticatedUser) {
    if (
      actor.companyId !== companyId ||
      (actor.role !== "OWNER" && actor.role !== "ADMIN" && actor.profileCode !== "HIRING_MANAGER")
    ) {
      throw new ForbiddenException("Not allowed to view candidate statuses for this company");
    }

    return this.prisma.candidateStatusDefinition.findMany({
      where: {
        OR: [
          { companyId: null },
          { companyId },
        ],
        isActive: true,
      },
      orderBy: [
        { companyId: "asc" }, // global first, then tenant-specific
        { sortOrder: "asc" },
        { label: "asc" },
      ],
    });
  }

  async upsertStatusDefinition(
    actor: AuthenticatedUser,
    input: { companyId?: string | null; code: string; label: string; color?: string | null; sortOrder?: number | null }
  ) {
    const companyId = input.companyId ?? actor.companyId;
    if (
      !companyId ||
      actor.companyId !== companyId ||
      (actor.role !== "OWNER" && actor.role !== "ADMIN")
    ) {
      throw new ForbiddenException("Only company admins can manage candidate statuses");
    }

    const code = (input.code || "").trim().toUpperCase();
    const label = (input.label || "").trim();
    if (!code) {
      throw new BadRequestException("Status code is required");
    }
    if (!label) {
      throw new BadRequestException("Status label is required");
    }

    const existing = await this.prisma.candidateStatusDefinition.findUnique({
      where: {
        CandidateStatusDefinition_company_code_key: {
          companyId,
          code,
        },
      },
    });

    const data = {
      companyId,
      code,
      label,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
      isActive: true,
    };

    if (!existing) {
      return this.prisma.candidateStatusDefinition.create({ data });
    }

    return this.prisma.candidateStatusDefinition.update({
      where: { id: existing.id },
      data,
    });
  }

  async deactivateStatusDefinition(actor: AuthenticatedUser, id: string) {
    const def = await this.prisma.candidateStatusDefinition.findUnique({
      where: { id },
    });
    if (!def) {
      throw new NotFoundException("Candidate status not found");
    }

    if (
      def.companyId &&
      (actor.companyId !== def.companyId || (actor.role !== "OWNER" && actor.role !== "ADMIN"))
    ) {
      throw new ForbiddenException("Only company admins can manage candidate statuses");
    }

    return this.prisma.candidateStatusDefinition.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async setSessionDetailStatus(
    id: string,
    actor: AuthenticatedUser,
    input: { detailStatusCode: string | null },
  ) {
    const session = await this.prisma.onboardingSession.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    const sameCompany = session.companyId === actor.companyId;

    if (sameCompany) {
      if (
        actor.role !== "OWNER" &&
        actor.role !== "ADMIN" &&
        actor.profileCode !== "HIRING_MANAGER"
      ) {
        throw new ForbiddenException("Not allowed to update candidate status for this company");
      }
    } else {
      // Cross-tenant path: allow Nexus Fortified Structures admins to update
      // candidate status for shared pool candidates. We rely on
      // listProspectsForCompany to decide which sessions they can see; once they
      // have a session id, we treat Fortified OWNER/ADMIN as allowed editors.
      const isFortifiedTenant = actor.companyId === this.fortifiedCompanyId;
      const isFortifiedAdmin = actor.role === "OWNER" || actor.role === "ADMIN";
      if (!isFortifiedTenant || !isFortifiedAdmin) {
        throw new ForbiddenException("Not allowed to update candidate status for this company");
      }
    }

    const code = (input.detailStatusCode || "").trim();

    // Determine which company owns the candidate status definitions we should
    // validate against: the owning company for the session.
    const statusCompanyId = session.companyId;

    if (code) {
      // Ensure the code exists for this company (or globally) and is active.
      const exists = await this.prisma.candidateStatusDefinition.findFirst({
        where: {
          isActive: true,
          code: code.toUpperCase(),
          OR: [
            { companyId: null },
            { companyId: statusCompanyId },
          ],
        },
      });
      if (!exists) {
        throw new BadRequestException("Unknown candidate status code");
      }

      return this.prisma.onboardingSession.update({
        where: { id: session.id },
        data: {
          detailStatusCode: exists.code,
        },
      });
    }

    // Clearing detail status
    return this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        detailStatusCode: null,
      },
    });
  }

  async updateSessionProfile(
    id: string,
    actor: AuthenticatedUser,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      dob?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
    },
  ) {
    const session = await this.prisma.onboardingSession.findUnique({
      where: { id },
      include: { profile: true },
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    const sameCompany = session.companyId === actor.companyId;

    if (!sameCompany && actor.globalRole !== ("SUPER_ADMIN" as any)) {
      throw new ForbiddenException("Not allowed to edit onboarding profile for this company");
    }

    // HR and above within the owning company (or SUPER_ADMIN for Nexus System).
    const isAdminOrOwner = actor.role === Role.OWNER || actor.role === Role.ADMIN;
    const isHiringManager = actor.profileCode === "HIRING_MANAGER";
    const isHrProfile = actor.profileCode === "HR";
    const isSuperAdmin = actor.globalRole === ("SUPER_ADMIN" as any);

    if (!isSuperAdmin && !isAdminOrOwner && !isHiringManager && !isHrProfile) {
      throw new ForbiddenException("Not allowed to edit onboarding profile for this company");
    }

    const next = {
      firstName: this.normalizeProfileField(input.firstName ?? session.profile?.firstName ?? null),
      lastName: this.normalizeProfileField(input.lastName ?? session.profile?.lastName ?? null),
      phone: this.normalizeProfileField(input.phone ?? session.profile?.phone ?? null),
      dob: input.dob ? new Date(input.dob) : (session.profile?.dob as any) ?? null,
      addressLine1: this.normalizeProfileField(
        input.addressLine1 ?? session.profile?.addressLine1 ?? null,
      ),
      addressLine2: this.normalizeProfileField(
        input.addressLine2 ?? session.profile?.addressLine2 ?? null,
      ),
      city: this.normalizeProfileField(input.city ?? session.profile?.city ?? null),
      state: this.normalizeUsState(input.state ?? session.profile?.state ?? null),
      postalCode: this.normalizeProfileField(
        input.postalCode ?? session.profile?.postalCode ?? null,
      ),
      country: this.normalizeProfileField(input.country ?? session.profile?.country ?? null),
    };

    const updatedProfile = await this.prisma.onboardingProfile.upsert({
      where: { sessionId: session.id },
      update: next,
      create: {
        sessionId: session.id,
        ...next,
      },
    });

    return {
      id: session.id,
      profile: updatedProfile,
    };
  }

  async startSession(
    companyId: string,
    email: string,
    assignedHiringManagerId?: string | null,
    userId?: string | null
  ) {
    const token = this.generateToken();

    const session = await this.prisma.onboardingSession.create({
      data: {
        companyId,
        email: this.normalizeEmail(email),
        token,
        status: "NOT_STARTED" as any,
        checklistJson: JSON.stringify({
          profileComplete: false,
          photoUploaded: false,
          govIdUploaded: false,
          skillsComplete: false
        }),
        assignedHiringManagerId: assignedHiringManagerId ?? null,
        userId: userId ?? null
      }
    });

    return session;
  }

  async startPublicSession(email: string, password: string, referralToken?: string) {
    // Recruiting pool must attach to the canonical Nexus System tenant so
    // applicants never get mixed into normal organizations. Rather than
    // relying on an env var or a specific `kind`, we always resolve the
    // company row named "Nexus System".
    const recruitingCompany = await this.prisma.company.findFirst({
      where: {
        name: {
          equals: "Nexus System",
          mode: "insensitive",
        } as any,
      },
      select: { id: true, kind: true },
    });

    if (!recruitingCompany) {
      throw new BadRequestException(
        "Recruiting pool company (Nexus System) not found. Ensure a company named 'Nexus System' exists."
      );
    }

    const companyId = recruitingCompany.id;

    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new BadRequestException("Email is required");
    }
    if (!password || password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    // Prevent account takeovers: if the email already exists, do not reset/overwrite.
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } }
    });
    if (existing) {
      throw new ConflictException("Account already exists. Please log in instead.");
    }

    // Create pool user + membership + onboarding session.
    const passwordHash = await argon2.hash(password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          userType: UserType.APPLICANT,
          // Seed profile completion + reminder anchor for new public signups.
          profileCompletionPercent: 10,
          profileCompletionUpdatedAt: new Date(),
          profileReminderStartAt: new Date(),
        }
      });

      await tx.companyMembership.create({
        data: {
          userId: user.id,
          companyId,
          role: Role.MEMBER,
        }
      });

      const session = await tx.onboardingSession.create({
        data: {
          companyId,
          email: normalizedEmail,
          token: this.generateToken(),
          status: "NOT_STARTED" as any,
          checklistJson: JSON.stringify({
            profileComplete: false,
            photoUploaded: false,
            govIdUploaded: false,
            skillsComplete: false
          }),
          userId: user.id,
        }
      });

      // If this signup came from a referral token, attach user/candidate to that referral.
      if (referralToken) {
        const referral = await tx.referral.findUnique({ where: { token: referralToken } });
        if (referral) {
          // Find or create a NexNetCandidate for this referee.
          let candidate = null as any;

          if (referral.candidateId) {
            candidate = await tx.nexNetCandidate.findUnique({ where: { id: referral.candidateId } });
          }

          if (!candidate) {
            candidate = await tx.nexNetCandidate.findFirst({
              where: {
                OR: [
                  { email: normalizedEmail },
                  referral.prospectPhone
                    ? { phone: referral.prospectPhone }
                    : undefined,
                ].filter(Boolean) as any,
              },
            });
          }

          if (!candidate) {
            candidate = await tx.nexNetCandidate.create({
              data: {
                userId: user.id,
                firstName: referral.prospectName ?? null,
                lastName: null,
                email: normalizedEmail,
                phone: referral.prospectPhone ?? null,
                source: "REFERRAL" as any,
                status: NexNetStatus.IN_PROGRESS,
              },
            });
          } else {
            candidate = await tx.nexNetCandidate.update({
              where: { id: candidate.id },
              data: {
                userId: candidate.userId ?? user.id,
                email: candidate.email ?? normalizedEmail,
                status: NexNetStatus.IN_PROGRESS,
              },
            });
          }

          await this.ensureFortifiedVisibilityForCandidate(tx, candidate.id, user.id);

          await tx.referral.update({
            where: { id: referral.id },
            data: {
              candidateId: candidate.id,
              refereeUserId: user.id,
              status: ReferralStatus.CONFIRMED,
            },
          });
        }
      }

      return { user, session };
    });

    return result.session;
  }

  async getSessionByToken(token: string) {
    const session = await this.prisma.onboardingSession.findUnique({
      where: { token },
      include: {
        profile: true,
        documents: true,
      },
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    return session;
  }

  // --- Referral linkage helpers for Nex-Net ---

  async getReferrerForSessionByToken(token: string) {
    const session = await this.getSessionByToken(token);
    const normalizedEmail = this.normalizeEmail(session.email);

    const referrals = await this.prisma.referral.findMany({
      where: {
        OR: [
          session.userId ? { refereeUserId: session.userId } : undefined,
          { prospectEmail: normalizedEmail },
          {
            candidate: {
              email: normalizedEmail,
            },
          },
        ].filter(Boolean) as any,
      },
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
    });

    const referral = referrals[0];
    if (!referral) return null;

    const ref = referral.referrer;
    const name = [ref.firstName, ref.lastName].filter(Boolean).join(" ");

    return {
      id: referral.id,
      token: referral.token,
      status: referral.status,
      referralConfirmedByReferee: referral.referralConfirmedByReferee,
      referralRejectedByReferee: referral.referralRejectedByReferee,
      referrer: {
        id: ref.id,
        email: ref.email,
        name: name || null,
        firstName: ref.firstName,
        lastName: ref.lastName,
      },
    };
  }

  async confirmReferrerForSession(token: string, accepted: boolean) {
    const session = await this.getSessionByToken(token);
    const normalizedEmail = this.normalizeEmail(session.email);

    const referrals = await this.prisma.referral.findMany({
      where: {
        OR: [
          session.userId ? { refereeUserId: session.userId } : undefined,
          { prospectEmail: normalizedEmail },
          {
            candidate: {
              email: normalizedEmail,
            },
          },
        ].filter(Boolean) as any,
      },
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
    });

    const referral = referrals[0];
    if (!referral) {
      throw new NotFoundException("Referral not found for this session");
    }

    const updated = await this.prisma.referral.update({
      where: { id: referral.id },
      data: accepted
        ? {
            referralConfirmedByReferee: true,
            referralRejectedByReferee: false,
            status:
              referral.status === ReferralStatus.INVITED
                ? ReferralStatus.CONFIRMED
                : referral.status,
          }
        : {
            referralConfirmedByReferee: false,
            referralRejectedByReferee: true,
            status: ReferralStatus.REJECTED,
          },
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

    const ref = updated.referrer;
    const name = [ref.firstName, ref.lastName].filter(Boolean).join(" ");

    // Best-effort: notify the referrer that their referral confirmed or rejected them.
    if (ref?.id && ref.email) {
      const title = accepted
        ? "Your referral confirmed you as their referrer"
        : "Your referral status was updated";
      const body = accepted
        ? `A candidate using ${normalizedEmail} confirmed you as their referrer on Nex-Net.`
        : `A candidate using ${normalizedEmail} indicated they were not referred by you. This may reflect a mis-click or an incorrect email.`;

      try {
        await this.notifications.createNotification({
          userId: ref.id,
          kind: $Enums.NotificationKind.REFERRAL,
          channel: $Enums.NotificationChannel.EMAIL,
          title,
          body,
          metadata: {
            type: "referral_confirmation_decision",
            accepted,
            referralId: updated.id,
            candidateEmail: normalizedEmail,
          },
        });
      } catch {
        // non-fatal
      }

      try {
        const subject = accepted
          ? "Your Nex-Net referral confirmed you"
          : "Your Nex-Net referral status was updated";

        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5;">
            <h2 style="margin: 0 0 12px;">${title}</h2>
            <p style="margin: 0 0 8px;">${body}</p>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              You can view the status of all your referrals in the Referrals section of Nexus.
            </p>
          </div>
        `;

        await this.email.sendMail({ to: ref.email, subject, html });
      } catch {
        // non-fatal
      }
    }

    return {
      id: updated.id,
      token: updated.token,
      status: updated.status,
      referralConfirmedByReferee: updated.referralConfirmedByReferee,
      referralRejectedByReferee: updated.referralRejectedByReferee,
      referrer: {
        id: ref.id,
        email: ref.email,
        name: name || null,
        firstName: ref.firstName,
        lastName: ref.lastName,
      },
    };
  }

  async upsertProfileByToken(token: string, profile: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    dob?: Date;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }) {
    const session = await this.getSessionByToken(token);

    const normalizedProfile = {
      ...profile,
      state: this.normalizeUsState(profile.state ?? null) ?? undefined,
    };

    await this.prisma.onboardingProfile.upsert({
      where: { sessionId: session.id },
      update: normalizedProfile,
      create: {
        sessionId: session.id,
        ...normalizedProfile,
      },
    });

    const checklist = (session.checklistJson && JSON.parse(session.checklistJson)) || {};
    checklist.profileComplete = true;

    // Best-effort: if this session is linked to a user, bump their profile
    // completion percent and reminder anchor.
    if (session.userId) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            profileCompletionPercent: true,
            profileReminderStartAt: true,
          },
        });

        if (user) {
          const nextFirst = user.firstName ?? profile.firstName ?? null;
          const nextLast = user.lastName ?? profile.lastName ?? null;
          const nextPercent = calculateProfileCompletionPercent({
            email: user.email,
            firstName: nextFirst,
            lastName: nextLast,
          });
          const now = new Date();

          await this.prisma.user.update({
            where: { id: session.userId },
            data: {
              firstName: nextFirst,
              lastName: nextLast,
              profileCompletionPercent: nextPercent,
              profileCompletionUpdatedAt: now,
              profileReminderStartAt: user.profileReminderStartAt ?? now,
            },
          });
        }
      } catch {
        // non-fatal: never block candidate profile updates on this.
      }
    }

    return this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS" as any,
        checklistJson: JSON.stringify(checklist),
      },
    });
  }

  async addDocumentByToken(token: string, params: {
    type: "PHOTO" | "GOV_ID" | "OTHER";
    fileUrl: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
  }) {
    const session = await this.getSessionByToken(token);

    await this.prisma.onboardingDocument.create({
      data: {
        sessionId: session.id,
        type: params.type as any,
        fileUrl: params.fileUrl,
        fileName: params.fileName,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes ?? null,
      },
    });

    const checklist = (session.checklistJson && JSON.parse(session.checklistJson)) || {};
    if (params.type === "PHOTO") checklist.photoUploaded = true;
    if (params.type === "GOV_ID") checklist.govIdUploaded = true;
    if (params.type === "OTHER") checklist.attachmentsUploaded = true;

    const updated = await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS" as any,
        checklistJson: JSON.stringify(checklist),
      },
    });

    // Best-effort: keep the candidate's portfolio photo in sync with the latest
    // onboarding PHOTO document so their profile header matches what they
    // uploaded during Nexis onboarding.
    if (params.type === "PHOTO" && session.userId) {
      try {
        await this.syncOnboardingDocumentsToUserPortfolio(session);
      } catch {
        // Non-fatal: do not block document upload if portfolio sync fails.
      }
    }

    // Best-effort: mirror onboarding documents into the encrypted HR portfolio
    // so HR has a canonical view of PHOTO / GOV_ID / OTHER attachments for the
    // worker in this company.
    if (session.userId) {
      try {
        await this.syncOnboardingDocumentsToHrPortfolio(session);
      } catch {
        // Non-fatal: never block document uploads if HR sync fails.
      }
    }

    return updated;
  }

  async submitByToken(token: string) {
    const session = await this.getSessionByToken(token);

    const updated = await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "SUBMITTED" as any,
      },
    });

    // Best-effort: mirror onboarding skill ratings into the canonical
    // UserSkillRating table so that /settings/skills and other views can screen
    // based on the same self-assessment used during public onboarding.
    if (session.userId) {
      try {
        await this.syncOnboardingSkillsToUserSkills(session.id, session.userId);
      } catch {
        // Non-fatal: never block candidate submission if skill sync fails.
      }
    }

    // Best-effort: hydrate the user's portfolio + HR contact info from the
    // onboarding profile so that /settings/profile is pre-populated on first
    // visit after submitting a Nexis profile.
    try {
      await this.syncProfileIntoUserPortfolio(session);
    } catch {
      // Non-fatal: never block candidate submission if profile sync fails.
    }

    // Best-effort: advance any linked Nex-Net candidate + referral statuses.
    try {
      const normalizedEmail = this.normalizeEmail(session.email);

      const candidates = await this.prisma.nexNetCandidate.findMany({
        where: {
          OR: [
            { email: normalizedEmail },
            session.userId ? { userId: session.userId } : undefined,
          ].filter(Boolean) as any,
        },
      });

      for (const c of candidates) {
        await this.prisma.nexNetCandidate.update({
          where: { id: c.id },
          data: { status: NexNetStatus.SUBMITTED },
        });

        // Ensure Nexus Fortified Structures has visibility into all submitted
        // prospective candidates in the Nexus System pool.
        await this.ensureFortifiedVisibilityForCandidate(this.prisma, c.id, session.userId ?? null);

        await this.prisma.referral.updateMany({
          where: {
            candidateId: c.id,
            status: { in: [ReferralStatus.INVITED, ReferralStatus.CONFIRMED] as any },
          },
          data: { status: ReferralStatus.APPLIED },
        });

        // Notify referrers that their candidate has submitted a profile.
        const appliedReferrals = await this.prisma.referral.findMany({
          where: {
            candidateId: c.id,
            status: ReferralStatus.APPLIED,
          },
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

        for (const r of appliedReferrals) {
          const ref = r.referrer;
          if (!ref?.id || !ref.email) continue;
          const refName = [ref.firstName, ref.lastName].filter(Boolean).join(" ");

          const title = "Your referral submitted their Nexis profile";
          const body = `A candidate using ${normalizedEmail} has submitted their Nexis profile. Once they are matched to a tenant, any referral incentives will follow your normal program rules.`;

          try {
            await this.notifications.createNotification({
              userId: ref.id,
              kind: $Enums.NotificationKind.REFERRAL,
              channel: $Enums.NotificationChannel.EMAIL,
              title,
              body,
              metadata: {
                type: "referral_submission",
                referralId: r.id,
                candidateEmail: normalizedEmail,
                candidateId: c.id,
              },
            });
          } catch {
            // ignore
          }

          try {
            const subject = "Your Nex-Net referral submitted their profile";
            const html = `
              <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5;">
                <h2 style="margin: 0 0 12px;">Your referral submitted their Nexis profile</h2>
                <p style="margin: 0 0 8px;">${body}</p>
                <p style="margin: 0; font-size: 12px; color: #6b7280;">
                  You can review all of your referrals and their statuses from the Referrals page in Nexus.
                </p>
              </div>
            `;

            await this.email.sendMail({ to: ref.email, subject, html });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // Do not block candidate submission if Nex-Net linkage fails.
    }

    return updated;
  }

  async getSkillsForSessionByToken(token: string) {
    const session = await this.getSessionByToken(token);

    const [definitions, categories, ratings] = await Promise.all([
      this.prisma.skillDefinition.findMany({
        where: { active: true },
        orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { label: "asc" }]
      }),
      this.prisma.skillCategory.findMany({ where: { active: true } }),
      this.prisma.onboardingSkillRating.findMany({ where: { sessionId: session.id } })
    ]);

    const categoryById = new Map(categories.map(c => [c.id, c]));
    const ratingBySkillId = new Map(ratings.map(r => [r.skillId, r]));

    return definitions.map(def => {
      const cat = categoryById.get(def.categoryId as any);
      const rating = ratingBySkillId.get(def.id as any);
      return {
        id: def.id,
        code: def.code,
        label: def.label,
        tradeLabel: def.tradeLabel ?? null,
        categoryId: def.categoryId,
        categoryCode: cat?.code ?? null,
        categoryLabel: cat?.label ?? null,
        level: rating?.level ?? null
      };
    });
  }

  async upsertSkillsByToken(
    token: string,
    ratings: { skillId: string; level: number }[]
  ) {
    const session = await this.getSessionByToken(token);

    // Basic validation: levels 1-5 only
    for (const r of ratings) {
      if (r.level < 1 || r.level > 5) {
        throw new ForbiddenException("Skill level must be between 1 and 5");
      }
    }

    // Replace all ratings for this session (simple and safe for now)
    await this.prisma.onboardingSkillRating.deleteMany({ where: { sessionId: session.id } });

    if (ratings.length > 0) {
      const now = new Date();
      await this.prisma.onboardingSkillRating.createMany({
        data: ratings.map(r => ({
          sessionId: session.id,
          skillId: r.skillId,
          level: r.level,
          updatedAt: now
        }))
      });
    }

    const checklist = (session.checklistJson && JSON.parse(session.checklistJson)) || {};
    checklist.skillsComplete = ratings.length > 0;

    await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS" as any,
        checklistJson: JSON.stringify(checklist)
      }
    });

    // Best-effort: whenever a session has a linked user, keep that user's
    // UserSkillRating rows in sync with the latest onboarding skill ratings so
    // screening and portfolio views always see the same self-assessment.
    if (session.userId) {
      try {
        await this.syncOnboardingSkillsToUserSkills(session.id, session.userId);
      } catch {
        // Non-fatal: never block candidate skill edits on sync failures.
      }
    }

    return this.getSkillsForSessionByToken(token);
  }

  private async syncOnboardingSkillsToUserSkills(sessionId: string, userId: string) {
    const onboardingSkills = await this.prisma.onboardingSkillRating.findMany({
      where: { sessionId },
    });

    if (!onboardingSkills.length) {
      return;
    }

    const now = new Date();
    for (const s of onboardingSkills) {
      await this.prisma.userSkillRating.upsert({
        where: {
          UserSkillRating_user_skill_key: {
            userId,
            skillId: s.skillId,
          },
        },
        update: {
          selfLevel: s.level,
          updatedAt: now,
        },
        create: {
          userId,
          skillId: s.skillId,
          selfLevel: s.level,
          updatedAt: now,
        },
      });
    }
  }

  private async syncOnboardingDocumentsToUserPortfolio(session: any) {
    if (!session.userId) return;

    // Use the most recent PHOTO document for this session, if any.
    const photoDoc = await this.prisma.onboardingDocument.findFirst({
      where: {
        sessionId: session.id,
        type: "PHOTO" as any,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!photoDoc) return;

    const existing = await this.prisma.userPortfolio.findUnique({
      where: {
        UserPortfolio_company_user_key: {
          companyId: session.companyId,
          userId: session.userId,
        },
      },
      select: { id: true, photoUrl: true },
    });

    if (!existing) {
      await this.prisma.userPortfolio.create({
        data: {
          companyId: session.companyId,
          userId: session.userId,
          photoUrl: photoDoc.fileUrl,
        },
      });
      return;
    }

    if (!existing.photoUrl) {
      await this.prisma.userPortfolio.update({
        where: { id: existing.id },
        data: { photoUrl: photoDoc.fileUrl },
      });
    }
  }

  // Mirror all onboarding documents for this session into the encrypted HR
  // portfolio payload so HR can see PHOTO / GOV_ID / OTHER attachments for the
  // worker in this company.
  private async syncOnboardingDocumentsToHrPortfolio(session: any) {
    if (!session.userId) return;

    const docs = await this.prisma.onboardingDocument.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });

    if (!docs.length) return;

    // Ensure there is a portfolio row for this (company, user).
    const portfolio = await this.prisma.userPortfolio.upsert({
      where: {
        UserPortfolio_company_user_key: {
          companyId: session.companyId,
          userId: session.userId,
        },
      },
      update: {},
      create: {
        companyId: session.companyId,
        userId: session.userId,
      },
      select: { id: true },
    });

    const existingHr = await this.prisma.userPortfolioHr.findUnique({
      where: { portfolioId: portfolio.id },
      select: {
        encryptedJson: true,
      },
    });

    let payload: any = {};
    if (existingHr) {
      try {
        payload = decryptPortfolioHrJson(Buffer.from(existingHr.encryptedJson));
      } catch {
        // If decryption fails, fall back to an empty payload and overwrite.
        payload = {};
      }
    }

    payload.documents = docs.map(d => ({
      id: d.id,
      type: d.type,
      fileUrl: d.fileUrl,
      fileName: d.fileName ?? null,
      mimeType: d.mimeType ?? null,
    }));

    const encryptedJson = encryptPortfolioHrJson(payload);
    const encryptedBytes = Uint8Array.from(encryptedJson);

    if (existingHr) {
      await this.prisma.userPortfolioHr.update({
        where: { portfolioId: portfolio.id },
        data: {
          encryptedJson: encryptedBytes,
        },
      });
    } else {
      await this.prisma.userPortfolioHr.create({
        data: {
          portfolioId: portfolio.id,
          encryptedJson: encryptedBytes,
          ssnLast4: null,
          itinLast4: null,
          bankAccountLast4: null,
          bankRoutingLast4: null,
        },
      });
    }
  }

  // Copy basic identity + contact fields from an onboarding profile into the
  // canonical User + UserPortfolioHr records. This is designed to run once
  // when a candidate submits their Nexis profile. It is intentionally
  // conservative: we only fill fields that are currently null / missing so we
  // never overwrite data a user has already curated in /settings/profile.
  private async syncProfileIntoUserPortfolio(session: any) {
    if (!session.userId) return;
    if (!session.profile) return;

    const profile = session.profile as {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      country?: string | null;
    };

    await this.prisma.$transaction(async (tx) => {
      // 1) Hydrate User first/last name if not already set.
      const user = await tx.user.findUnique({
        where: { id: session.userId },
        select: { firstName: true, lastName: true },
      });

      if (user) {
        const nextFirst = user.firstName ?? this.normalizeProfileField(profile.firstName ?? null);
        const nextLast = user.lastName ?? this.normalizeProfileField(profile.lastName ?? null);

        if (nextFirst !== user.firstName || nextLast !== user.lastName) {
          await tx.user.update({
            where: { id: session.userId },
            data: {
              firstName: nextFirst,
              lastName: nextLast,
            },
          });
        }
      }

      // 2) Ensure there is a portfolio for this (company, user).
      const portfolio = await tx.userPortfolio.upsert({
        where: {
          UserPortfolio_company_user_key: {
            companyId: session.companyId,
            userId: session.userId,
          },
        },
        update: {},
        create: {
          companyId: session.companyId,
          userId: session.userId,
        },
        select: { id: true },
      });

      // If HR payload already exists, do not overwrite it.
      const existingHr = await tx.userPortfolioHr.findUnique({
        where: { portfolioId: portfolio.id },
        select: { id: true },
      });

      if (existingHr) {
        return;
      }

      const payload: any = {};
      const setField = (key: string, value?: string | null) => {
        const v = this.normalizeProfileField(value ?? null);
        if (v != null) {
          payload[key] = v;
        }
      };

      // Use the onboarding email as the default HR contact email.
      setField("displayEmail", session.email);
      setField("phone", profile.phone ?? null);
      setField("addressLine1", profile.addressLine1 ?? null);
      setField("addressLine2", profile.addressLine2 ?? null);
      setField("city", profile.city ?? null);
      setField("state", profile.state ?? null);
      setField("postalCode", profile.postalCode ?? null);
      setField("country", profile.country ?? null);

      const encryptedJson = encryptPortfolioHrJson(payload);
      const encryptedBytes = Uint8Array.from(encryptedJson);

      await tx.userPortfolioHr.create({
        data: {
          portfolioId: portfolio.id,
          encryptedJson: encryptedBytes,
          ssnLast4: null,
          itinLast4: null,
          bankAccountLast4: null,
          bankRoutingLast4: null,
        },
      });
    });
  }

  async listSessionsForCompany(
    companyId: string,
    actor: AuthenticatedUser,
    statuses?: string[],
    detailStatusCodes?: string[],
  ) {
    const isSameCompany = actor.companyId === companyId;
    const isGlobalAdmin = (actor as any).globalRole === "SUPER_ADMIN";

    // SUPER_ADMINs can read onboarding sessions for any company. For normal
    // users, require that they are acting within their current company
    // context.
    if (!isSameCompany && !isGlobalAdmin) {
      throw new ForbiddenException("Not allowed to view onboarding for this company");
    }

    // Within the active company context, restrict access to OWNER / ADMIN /
    // HIRING_MANAGER unless the caller is SUPER_ADMIN.
    if (
      !isGlobalAdmin &&
      actor.role !== "OWNER" &&
      actor.role !== "ADMIN" &&
      actor.profileCode !== "HIRING_MANAGER"
    ) {
      throw new ForbiddenException("Not allowed to view onboarding for this company");
    }

    // IMPORTANT: for the Nexus System recruiting pool, ensure we list sessions
    // from the same canonical company row that startPublicSession uses. This
    // avoids subtle bugs where multiple "Nexus System" rows exist with
    // different ids. For non-Nexus companies, we keep the companyId filter as
    // is.
    let effectiveCompanyId = companyId;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    if (company && company.name && company.name.toLowerCase() === "nexus system") {
      const recruitingCompany = await this.prisma.company.findFirst({
        where: {
          name: {
            equals: "Nexus System",
            mode: "insensitive",
          } as any,
        },
        select: { id: true },
      });
      if (recruitingCompany) {
        effectiveCompanyId = recruitingCompany.id;
      }
    }

    return this.prisma.onboardingSession.findMany({
      where: {
        companyId: effectiveCompanyId,
        status: statuses && statuses.length ? { in: statuses as any } : undefined,
        detailStatusCode:
          detailStatusCodes && detailStatusCodes.length
            ? { in: detailStatusCodes.map(c => c.toUpperCase()) }
            : undefined,
      },
      include: {
        profile: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Prospective candidates view used by the web app. For most companies this
   * behaves identically to listSessionsForCompany. For Nexus Fortified
   * Structures, this returns a unified view over the Nexus System recruiting
   * pool plus any local Fortified onboarding sessions so admins can see the
   * same prospective list as Nexus System.
   */
  async listProspectsForCompany(
    companyId: string,
    actor: AuthenticatedUser,
    statuses?: string[],
    detailStatusCodes?: string[],
  ) {
    // Determine whether this company is Nexus Fortified Structures based on its
    // name so we don't depend on a specific hard-coded id in the database.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });

    const isFortifiedCompany =
      !!company &&
      typeof company.name === "string" &&
      company.name.toLowerCase().startsWith("nexus fortified structures");

    // First, resolve the underlying sessions using the existing logic (local
    // + shared for non-Fortified, Nexus System + Fortified for Fortified). We
    // then enrich those sessions with assignment metadata so callers can see
    // which tenants already "own" this person as a worker.
    let baseSessions: any[];

    if (!isFortifiedCompany) {
      // Local onboarding sessions for this company (same auth and filtering
      // rules as listSessionsForCompany).
      const localSessions = await this.listSessionsForCompany(
        companyId,
        actor,
        statuses,
        detailStatusCodes,
      );

      // Shared Nex-Net candidates that have been made visible to this tenant.
      const visibilityRows = await this.prisma.candidatePoolVisibility.findMany({
        where: {
          visibleToCompanyId: companyId,
          isAllowed: true,
        },
        select: {
          candidateId: true,
        },
      });

      if (!visibilityRows.length) {
        baseSessions = localSessions;
      } else {
        const candidateIds = Array.from(
          new Set(visibilityRows.map(v => v.candidateId).filter(id => !!id)),
        );

        if (!candidateIds.length) {
          baseSessions = localSessions;
        } else {
          const candidates = await this.prisma.nexNetCandidate.findMany({
            where: {
              id: { in: candidateIds },
              isDeletedSoft: false,
            },
            select: {
              id: true,
              userId: true,
              email: true,
              companyId: true,
            },
          });

          if (!candidates.length) {
            baseSessions = localSessions;
          } else {
            // Resolve the latest onboarding session for each candidate in their
            // owning company (if any), then fetch those sessions with the same
            // filters we apply to local sessions.
            const sharedSessionIdSet = new Set<string>();

            for (const cand of candidates) {
              if (!cand.companyId) continue;

              const normalizedEmail = this.normalizeEmail(cand.email ?? "");
              const or: any[] = [];
              if (cand.userId) {
                or.push({ userId: cand.userId });
              }
              if (normalizedEmail) {
                or.push({
                  email: {
                    equals: normalizedEmail,
                    mode: "insensitive",
                  } as any,
                });
              }
              if (!or.length) continue;

              const session = await this.prisma.onboardingSession.findFirst({
                where: {
                  companyId: cand.companyId,
                  OR: or,
                },
                select: {
                  id: true,
                },
                orderBy: { createdAt: "desc" },
              });

              if (session) {
                sharedSessionIdSet.add(session.id);
              }
            }

            // Exclude any sessions that are already part of the localSessions list to
            // avoid duplicates.
            const existingLocalIds = new Set(localSessions.map(s => s.id));
            const sharedSessionIds = Array.from(sharedSessionIdSet).filter(
              id => !existingLocalIds.has(id),
            );

            if (!sharedSessionIds.length) {
              baseSessions = localSessions;
            } else {
              const sharedSessions = await this.prisma.onboardingSession.findMany({
                where: {
                  id: { in: sharedSessionIds },
                  status: statuses && statuses.length ? { in: statuses as any } : undefined,
                  detailStatusCode:
                    detailStatusCodes && detailStatusCodes.length
                      ? { in: detailStatusCodes.map(c => c.toUpperCase()) }
                      : undefined,
                },
                include: {
                  profile: true,
                },
                orderBy: { createdAt: "desc" },
              });

              baseSessions = [...localSessions, ...sharedSessions];
            }
          }
        }
      }
    } else {
      // Fortified-specific view: only OWNER / ADMIN at the active Fortified
      // company can access the shared Nex-Net prospective candidates pool.
      if (actor.companyId !== companyId) {
        throw new ForbiddenException(
          "Only Nexus Fortified admins can view shared prospects for this company.",
        );
      }
      if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
        throw new ForbiddenException(
          "Only Nexus Fortified admins can view shared prospects.",
        );
      }

      // Resolve the canonical Nexus System recruiting company id so we always
      // read from the same pool that /apply and startPublicSession use.
      let recruitingCompanyId = this.nexusSystemCompanyId;

      if (!recruitingCompanyId) {
        const recruitingCompany = await this.prisma.company.findFirst({
          where: {
            name: {
              equals: "Nexus System",
              mode: "insensitive",
            } as any,
          },
          select: { id: true },
        });

        if (!recruitingCompany) {
          throw new BadRequestException(
            "Recruiting pool company (Nexus System) not found. Ensure a company named 'Nexus System' exists.",
          );
        }

        recruitingCompanyId = recruitingCompany.id;
      }

      const companyIds = [recruitingCompanyId, companyId];

      baseSessions = await this.prisma.onboardingSession.findMany({
        where: {
          companyId: { in: companyIds },
          status: statuses && statuses.length ? { in: statuses as any } : undefined,
          detailStatusCode:
            detailStatusCodes && detailStatusCodes.length
              ? { in: detailStatusCodes.map(c => c.toUpperCase()) }
              : undefined,
        },
        include: {
          profile: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!baseSessions.length) {
      return [];
    }

    // --- Enrich sessions with assignment metadata ---

    // Collect userIds for membership lookups.
    const userIds = Array.from(
      new Set(
        baseSessions
          .map(s => s.userId as string | null)
          .filter((id): id is string => !!id && typeof id === "string"),
      ),
    );

    // Resolve Nex-Net candidates for these users (best-effort; we key by userId).
    const candidates = userIds.length
      ? await this.prisma.nexNetCandidate.findMany({
          where: {
            userId: { in: userIds },
          },
          select: {
            id: true,
            userId: true,
          },
        })
      : [];

    const candidateIdByUserId = new Map<string, string>();
    for (const c of candidates) {
      if (c.userId) {
        candidateIdByUserId.set(c.userId, c.id);
      }
    }

    // Load memberships for all relevant users so we can see which tenants they
    // already work for.
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

    // Best-effort: also load CandidateInterest rows so we can expose an
    // interestStatus per (candidate, company) pair. This is optional and
    // failure-tolerant; the primary signal remains CompanyMembership.
    const candidateIds = Array.from(new Set(Array.from(candidateIdByUserId.values())));
    const interests = candidateIds.length
      ? await this.prisma.candidateInterest.findMany({
          where: {
            candidateId: { in: candidateIds },
          },
        })
      : [];

    const interestByCandidateAndCompany = new Map<string, string>();
    for (const ci of interests) {
      const key = `${ci.candidateId}|${ci.requestingCompanyId}`;
      if (!interestByCandidateAndCompany.has(key)) {
        interestByCandidateAndCompany.set(key, ci.status as string);
      }
    }

    const actorCompanyId = actor.companyId;

    return baseSessions.map(session => {
      const userId = (session.userId as string | null) ?? null;
      const candidateId = userId ? candidateIdByUserId.get(userId) ?? null : null;

      const mems = userId ? membershipsByUserId.get(userId) ?? [] : [];
      const assignedTenants = mems.map(m => {
        const cid = m.companyId;
        const key = candidateId ? `${candidateId}|${cid}` : null;
        const interestStatusRaw = key ? interestByCandidateAndCompany.get(key) : null;

        let interestStatus: string = interestStatusRaw ?? "NONE";
        if (interestStatus === "NONE" && cid === session.companyId) {
          const st = String(session.status || "").toUpperCase();
          if (st === "APPROVED" || st === "HIRED") {
            interestStatus = "HIRED";
          }
        }

        return {
          companyId: cid,
          companyName: m.company?.name ?? cid,
          companyRole: m.role as string,
          interestStatus,
          isCurrentTenant: !!actorCompanyId && cid === actorCompanyId,
        };
      });

      const assignedTenantCount = assignedTenants.length;
      const assignedHere = assignedTenants.some(t => t.companyId === session.companyId);
      const assignedElsewhere = assignedTenantCount > 0 && !assignedHere;

      const checklist = session.checklistJson ? JSON.parse(session.checklistJson) : {};
      const profileCompletionPercent = (() => {
        const keys = ["profileComplete", "photoUploaded", "govIdUploaded", "skillsComplete"];
        const completed = keys.filter(k => checklist[k]).length;
        if (!keys.length) return null;
        const raw = Math.round((completed / keys.length) * 100);
        if (!Number.isFinite(raw)) return null;
        return Math.max(10, raw);
      })();

      return {
        id: session.id,
        companyId: session.companyId,
        candidateId,
        userId,
        email: session.email,
        status: session.status,
        detailStatusCode: session.detailStatusCode ?? null,
        createdAt: session.createdAt,
        updatedAt: (session as any).updatedAt ?? null,
        profile: (session as any).profile ?? null,
        checklist,
        profileCompletionPercent,
        assignedTenantCount,
        assignedHere,
        assignedElsewhere,
        assignedTenants,
      };
    });
  }

  /**
   * Multi-tenant sharing: allow privileged users in a company to share one or
   * more prospective candidates (onboarding sessions) with other tenant
   * companies via CandidatePoolVisibility. This creates or reuses NexNet
   * candidate records keyed by user/email, then upserts visibility rows for
   * the requested target companies.
   */
  async shareProspectsWithCompanies(
    companyId: string,
    actor: AuthenticatedUser,
    input: { sessionIds?: string[]; targetCompanyIds?: string[] },
  ) {
    const rawSessionIds = Array.isArray(input.sessionIds) ? input.sessionIds : [];
    const rawTargetIds = Array.isArray(input.targetCompanyIds)
      ? input.targetCompanyIds
      : [];

    const sessionIds = Array.from(
      new Set(
        rawSessionIds
          .map(id => (typeof id === "string" ? id.trim() : ""))
          .filter(id => !!id),
      ),
    );
    const targetCompanyIds = Array.from(
      new Set(
        rawTargetIds
          .map(id => (typeof id === "string" ? id.trim() : ""))
          .filter(id => !!id),
      ),
    ).filter(id => id !== companyId);

    if (!sessionIds.length) {
      throw new BadRequestException("sessionIds is required and must contain at least one id");
    }
    if (!targetCompanyIds.length) {
      throw new BadRequestException(
        "targetCompanyIds is required and must contain at least one other tenant id",
      );
    }

    if (actor.companyId !== companyId) {
      throw new ForbiddenException("Cannot share prospects for a different company context");
    }

    const isSuperAdmin = (actor as any).globalRole === "SUPER_ADMIN";
    const isOwnerOrAdmin = actor.role === "OWNER" || actor.role === "ADMIN";
    const isHiringManager = actor.profileCode === "HIRING_MANAGER";

    if (!isSuperAdmin && !isOwnerOrAdmin && !isHiringManager) {
      throw new ForbiddenException("Not allowed to share prospects for this company");
    }

    // Ensure all requested sessions belong to this company.
    const sessions = await this.prisma.onboardingSession.findMany({
      where: {
        id: { in: sessionIds },
        companyId,
      },
      include: {
        profile: true,
      },
    });

    if (!sessions.length) {
      throw new NotFoundException("No onboarding sessions found for this company");
    }

    // Validate that target companies exist (best-effort); silently drop any
    // unknown ids to keep the API ergonomic for callers.
    const companies = await this.prisma.company.findMany({
      where: { id: { in: targetCompanyIds } },
      select: { id: true },
    });
    const validTargetIds = companies.map(c => c.id).filter(id => id !== companyId);

    if (!validTargetIds.length) {
      throw new BadRequestException("No valid target companies found for requested ids");
    }

    const result = await this.prisma.$transaction(async tx => {
      const seenCandidateIds = new Set<string>();
      let visibilityRowsCreated = 0;

      for (const session of sessions) {
        const normalizedEmail = this.normalizeEmail(session.email);

        let candidate = await tx.nexNetCandidate.findFirst({
          where: {
            OR: [
              normalizedEmail ? { email: normalizedEmail } : undefined,
              session.userId ? { userId: session.userId } : undefined,
            ].filter(Boolean) as any,
          },
        });

        if (!candidate) {
          // Optionally link to an existing user by email if one exists.
          let linkedUserId: string | null = session.userId ?? null;
          if (!linkedUserId && normalizedEmail) {
            const existingUser = await tx.user.findFirst({
              where: {
                email: {
                  equals: normalizedEmail,
                  mode: "insensitive",
                },
              },
              select: { id: true },
            });
            if (existingUser) {
              linkedUserId = existingUser.id;
            }
          }

          const profile = (session as any).profile as
            | {
                firstName?: string | null;
                lastName?: string | null;
                phone?: string | null;
              }
            | null
            | undefined;

          // Best-effort mapping from onboarding status to Nex-Net status.
          let status: NexNetStatus = NexNetStatus.NOT_STARTED;
          const rawStatus = String(session.status || "").toUpperCase();
          if (rawStatus === "SUBMITTED") {
            status = NexNetStatus.SUBMITTED;
          } else if (rawStatus === "UNDER_REVIEW") {
            status = NexNetStatus.UNDER_REVIEW;
          } else if (rawStatus === "APPROVED" || rawStatus === "HIRED") {
            status = NexNetStatus.HIRED;
          } else if (rawStatus === "REJECTED") {
            status = NexNetStatus.REJECTED;
          } else if (rawStatus === "TEST") {
            status = NexNetStatus.TEST;
          } else if (rawStatus === "IN_PROGRESS") {
            status = NexNetStatus.IN_PROGRESS;
          }

          candidate = await tx.nexNetCandidate.create({
            data: {
              userId: linkedUserId,
              companyId,
              firstName: profile?.firstName ?? null,
              lastName: profile?.lastName ?? null,
              email: normalizedEmail,
              phone: profile?.phone ?? null,
              source: NexNetSource.IMPORTED,
              status,
            },
          });
        }

        seenCandidateIds.add(candidate.id);

        for (const targetId of validTargetIds) {
          if (targetId === companyId) continue;

          const existing = await tx.candidatePoolVisibility.findFirst({
            where: {
              candidateId: candidate.id,
              visibleToCompanyId: targetId,
            },
          });

          if (existing) {
            if (!existing.isAllowed) {
              await tx.candidatePoolVisibility.update({
                where: { id: existing.id },
                data: { isAllowed: true },
              });
            }
            continue;
          }

          await tx.candidatePoolVisibility.create({
            data: {
              candidateId: candidate.id,
              visibleToCompanyId: targetId,
              isAllowed: true,
              createdByUserId: actor.userId ?? "system-candidate-share",
            },
          });
          visibilityRowsCreated += 1;
        }
      }

      return {
        candidateCount: seenCandidateIds.size,
        visibilityRowsCreated,
        targetCompanyCount: validTargetIds.length,
      };
    });

    return result;
  }

  // Candidate self-view: latest onboarding session for the current user in the
  // active company context (typically the Nexus System recruiting pool for
  // public applicants). Includes profile + basic checklist, but omits
  // sensitive bank info.
  async markSessionAsTest(id: string, actor: AuthenticatedUser) {
    const session = await this.prisma.onboardingSession.findFirst({
      where: { id, companyId: actor.companyId },
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    if (
      actor.role !== "OWNER" &&
      actor.role !== "ADMIN" &&
      actor.profileCode !== "HIRING_MANAGER"
    ) {
      throw new ForbiddenException("Not allowed to mark onboarding sessions as TEST for this company");
    }

    const updated = await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "TEST" as any,
      },
    });

    // Best-effort: mirror TEST status into any linked Nex-Net candidate(s) and
    // mark them as PRIVATE_TEST / hidden from default views.
    try {
      const normalizedEmail = this.normalizeEmail(session.email);

      const candidates = await this.prisma.nexNetCandidate.findMany({
        where: {
          OR: [
            { email: normalizedEmail },
            session.userId ? { userId: session.userId } : undefined,
          ].filter(Boolean) as any,
        },
      });

      for (const c of candidates) {
        await this.prisma.nexNetCandidate.update({
          where: { id: c.id },
          data: {
            status: NexNetStatus.TEST,
            visibilityScope: "PRIVATE_TEST" as any,
            isHiddenFromDefaultViews: true,
          },
        });
      }
    } catch {
      // Non-fatal: do not block TEST marking if Nex-Net linkage fails.
    }

    return updated;
  }

  async normalizeProspectiveCandidateStates(actor: AuthenticatedUser) {
    if ((actor as any).globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenException("Only SUPER_ADMIN can normalize candidate states");
    }

    const profiles = await this.prisma.onboardingProfile.findMany({
      where: {
        state: { not: null },
      },
      select: {
        sessionId: true,
        state: true,
      },
    });

    let updated = 0;
    for (const p of profiles) {
      const next = this.normalizeUsState(p.state);
      if (!next || next === p.state) continue;
      await this.prisma.onboardingProfile.update({
        where: { sessionId: p.sessionId },
        data: { state: next },
      });
      updated += 1;
    }

    return { updated };
  }

  async getLatestSessionForUser(actor: AuthenticatedUser) {
    const normalizedEmail = this.normalizeEmail(actor.email);

    const session = await this.prisma.onboardingSession.findFirst({
      where: {
        OR: [
          { userId: actor.userId },
          { email: normalizedEmail },
        ],
      },
      include: {
        profile: true,
        documents: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found for this user");
    }

    const checklist = session.checklistJson ? JSON.parse(session.checklistJson) : {};

    return {
      id: session.id,
      email: session.email,
      status: session.status,
      createdAt: session.createdAt,
      checklist,
      profile: session.profile,
      documents: session.documents,
      token: session.token,
    };
  }

  // Self-bootstrap a Nexis profile for the current user if one does not exist
  // yet. We attach it to the canonical "Nexus System" recruiting company so
  // that pool candidates live in one central tenant. If a session already
  // exists (matched by userId or email), we just return that.
  async startSelfProfile(actor: AuthenticatedUser) {
    const normalizedEmail = this.normalizeEmail(actor.email);

    // If there is already a session for this user/email, return it to keep the
    // flow idempotent.
    const existing = await this.prisma.onboardingSession.findFirst({
      where: {
        OR: [
          { userId: actor.userId },
          { email: normalizedEmail },
        ],
      },
      include: {
        profile: true,
        documents: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      const checklist = existing.checklistJson
        ? JSON.parse(existing.checklistJson)
        : {};
      return {
        id: existing.id,
        email: existing.email,
        status: existing.status,
        createdAt: existing.createdAt,
        checklist,
        profile: existing.profile,
        documents: existing.documents,
        token: existing.token,
      };
    }

    // Resolve the canonical Nexus System recruiting company (same logic as
    // startPublicSession) so that self-started Nexis profiles also land in the
    // central pool.
    const recruitingCompany = await this.prisma.company.findFirst({
      where: {
        name: {
          equals: "Nexus System",
          mode: "insensitive",
        } as any,
      },
      select: { id: true },
    });

    if (!recruitingCompany) {
      throw new BadRequestException(
        "Recruiting pool company (Nexus System) not found. Ensure a company named 'Nexus System' exists.",
      );
    }

    const session = await this.startSession(
      recruitingCompany.id,
      normalizedEmail,
      null,
      actor.userId,
    );

    const checklist = session.checklistJson
      ? JSON.parse(session.checklistJson)
      : {};

    return {
      id: session.id,
      email: session.email,
      status: session.status,
      createdAt: session.createdAt,
      checklist,
      profile: null,
      documents: [],
      token: session.token,
    };
  }

  // People → Trades
  // Return a single list of people, with basic skill + trade rollups.
  async listTradesPeople(companyId: string, actor: AuthenticatedUser) {
    if (
      actor.companyId !== companyId ||
      (actor.role !== "OWNER" && actor.role !== "ADMIN" && actor.profileCode !== "HIRING_MANAGER")
    ) {
      throw new ForbiddenException("Not allowed to view trades for this company");
    }

    const [memberships, sessions, skillDefs] = await Promise.all([
      this.prisma.companyMembership.findMany({
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
      }),
      this.prisma.onboardingSession.findMany({
        where: {
          companyId,
          userId: { not: null },
        },
        include: {
          profile: true,
          documents: true,
          skillRatings: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.skillDefinition.findMany({
        where: { active: true },
        select: {
          id: true,
          label: true,
          tradeLabel: true,
        },
      }),
    ]);

    const defById = new Map(skillDefs.map(d => [d.id, d]));

    const memberByUserId = new Map(memberships.map(m => [m.userId, m]));

    // Pick latest session per user (sessions are already ordered desc by createdAt).
    const sessionByUserId = new Map<string, (typeof sessions)[number]>();
    for (const s of sessions) {
      if (!s.userId) continue;
      if (!sessionByUserId.has(s.userId)) {
        sessionByUserId.set(s.userId, s);
      }
    }

    const userIds = Array.from(new Set([...memberByUserId.keys(), ...sessionByUserId.keys()]));

    const userSkillRatings = await this.prisma.userSkillRating.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        skillId: true,
        selfLevel: true,
      },
    });

    const skillsByUserId = new Map<string, { skillId: string; label: string; tradeLabel: string | null; level: number }[]>();
    for (const r of userSkillRatings) {
      const def = defById.get(r.skillId);
      if (!def) continue;
      const list = skillsByUserId.get(r.userId) ?? [];
      list.push({
        skillId: r.skillId,
        label: def.label,
        tradeLabel: def.tradeLabel ?? null,
        level: r.selfLevel,
      });
      skillsByUserId.set(r.userId, list);
    }

    // If the user doesn't have UserSkillRating rows yet (pre-approval candidates),
    // fall back to onboarding skill ratings for their latest session.
    for (const [uid, s] of sessionByUserId) {
      if (skillsByUserId.has(uid)) continue;
      const list: { skillId: string; label: string; tradeLabel: string | null; level: number }[] = [];
      for (const r of s.skillRatings) {
        const def = defById.get(r.skillId);
        if (!def) continue;
        list.push({
          skillId: r.skillId,
          label: def.label,
          tradeLabel: def.tradeLabel ?? null,
          level: r.level,
        });
      }
      skillsByUserId.set(uid, list);
    }

    function computeStats(skills: { level: number }[]) {
      const rated = skills.filter(s => typeof s.level === "number" && s.level >= 1 && s.level <= 5);
      const ratedCount = rated.length;
      const avgSelf = ratedCount ? rated.reduce((sum, s) => sum + s.level, 0) / ratedCount : null;
      return { ratedCount, avgSelf };
    }

    const rows = userIds
      .map((userId) => {
        const membership = memberByUserId.get(userId) ?? null;
        const session = sessionByUserId.get(userId) ?? null;
        const skills = skillsByUserId.get(userId) ?? [];

        const profile = session?.profile ?? null;
        const displayName =
          (profile?.firstName || profile?.lastName)
            ? `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim()
            : membership?.user?.email ?? session?.email ?? "(unknown)";

        // Designators (MVP)
        const designators: string[] = [];
        if (session) {
          if (session.status === "SUBMITTED" || session.status === "UNDER_REVIEW") {
            designators.push("WANTS_EVALUATION_HERE");
          } else {
            designators.push("UP_FOR_HIRE");
          }
        } else if (membership) {
          designators.push("WORKS_HERE");
        }

        const { ratedCount, avgSelf } = computeStats(skills);

        const hasPhoto = !!session?.documents?.some(d => d.type === "PHOTO");
        const hasGovId = !!session?.documents?.some(d => d.type === "GOV_ID");

        return {
          userId,
          email: membership?.user?.email ?? session?.email,
          displayName,
          companyRole: membership?.role ?? null,
          onboardingStatus: session?.status ?? null,
          designators,
          location: {
            city: profile?.city ?? null,
            state: profile?.state ?? null,
            postalCode: profile?.postalCode ?? null,
          },
          hasPhoto,
          hasGovId,
          stats: { ratedCount, avgSelf },
          skills,
          createdAt: membership?.createdAt ?? session?.createdAt,
        };
      })
      .filter(r => !!r.email)
      .sort((a, b) => {
        const an = (a.displayName || a.email || "").toLowerCase();
        const bn = (b.displayName || b.email || "").toLowerCase();
        return an.localeCompare(bn);
      });

    return rows;
  }

  async getSessionForReview(id: string, actor: AuthenticatedUser) {
    // First, resolve the session by id only so we can support cross-tenant
    // views in tightly controlled cases (e.g. Nexus Fortified viewing Nexus
    // System pool candidates, or tenants viewing shared Nex-Net candidates).
    const session = await this.prisma.onboardingSession.findUnique({
      where: { id },
      include: {
        profile: true,
        documents: true,
        bankInfo: true,
      },
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    const sameCompany = session.companyId === actor.companyId;
    const isSuperAdmin = (actor as any).globalRole === "SUPER_ADMIN";

    // Normal path: actor is in the same company that owns the onboarding
    // session. Enforce the existing OWNER / ADMIN / HIRING_MANAGER check,
    // but always allow SUPER_ADMINs.
    if (sameCompany) {
      if (
        !isSuperAdmin &&
        actor.role !== "OWNER" &&
        actor.role !== "ADMIN" &&
        actor.profileCode !== "HIRING_MANAGER"
      ) {
        throw new ForbiddenException("Not allowed to review onboarding for this company");
      }

      return session;
    }

    // SUPER_ADMINs can review any onboarding session across tenants.
    if (isSuperAdmin) {
      return session;
    }

    // Cross-tenant path A: generic tenants who have been granted explicit
    // visibility to this candidate via CandidatePoolVisibility. This is the
    // same visibility model used by listProspectsForCompany for non-Fortified
    // tenants.
    const normalizedEmail = this.normalizeEmail(session.email ?? "");

    const candidates = await this.prisma.nexNetCandidate.findMany({
      where: {
        OR: [
          session.userId ? { userId: session.userId } : undefined,
          normalizedEmail
            ? {
                email: {
                  equals: normalizedEmail,
                  mode: "insensitive",
                } as any,
              }
            : undefined,
        ].filter(Boolean) as any,
      },
      select: {
        id: true,
      },
    });

    if (candidates.length > 0) {
      const candidateIds = candidates.map(c => c.id);

      const visibility = await this.prisma.candidatePoolVisibility.findFirst({
        where: {
          candidateId: { in: candidateIds },
          visibleToCompanyId: actor.companyId,
          isAllowed: true,
        },
      });

      if (visibility) {
        const isOwnerOrAdmin = actor.role === "OWNER" || actor.role === "ADMIN";
        const isHiringManager = actor.profileCode === "HIRING_MANAGER";

        if (isOwnerOrAdmin || isHiringManager) {
          return session;
        }
      }
    }

    // Cross-tenant path B: Nexus Fortified Structures admins reviewing Nexus
    // System pool candidates. We rely on listProspectsForCompany to decide
    // which sessions they can see; once they have a session id, we do not
    // apply additional candidate visibility gating here.
    const isFortifiedTenant = actor.companyId === this.fortifiedCompanyId;
    const isFortifiedAdmin = actor.role === "OWNER" || actor.role === "ADMIN";

    if (!isFortifiedTenant || !isFortifiedAdmin) {
      // For all other tenants/company combinations we keep the strict
      // per-company isolation.
      throw new ForbiddenException("Not allowed to review onboarding for this company");
    }

    return session;
  }

  async approveSession(id: string, actor: AuthenticatedUser) {
    const session = await this.prisma.onboardingSession.findFirst({
      where: { id, companyId: actor.companyId }
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN" && actor.profileCode !== "HIRING_MANAGER") {
      throw new ForbiddenException("Not allowed to approve onboarding for this company");
    }

    // Create or find user by email
    let user = await this.prisma.user.findUnique({ where: { email: session.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: session.email,
          passwordHash: "onboarding-placeholder", // real password will be set via separate flow
          globalRole: "NONE" as any
        }
      });
    }

    // Ensure company membership exists, but with no profileId and default MEMBER role
    await this.prisma.companyMembership.upsert({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: session.companyId
        }
      },
      update: {},
      create: {
        userId: user.id,
        companyId: session.companyId,
        role: "MEMBER" as any
      }
    });

    // Migrate onboarding skill ratings into UserSkillRating as self-levels so
    // hiring managers and trades views see the same self-assessment used during
    // public onboarding.
    try {
      await this.syncOnboardingSkillsToUserSkills(session.id, user.id);
    } catch {
      // Non-fatal: do not block approval if skill sync fails.
    }

    await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: "APPROVED" as any }
    });

    return { sessionId: session.id, userId: user.id };
  }

  async rejectSession(id: string, actor: AuthenticatedUser) {
    const session = await this.prisma.onboardingSession.findFirst({
      where: { id, companyId: actor.companyId }
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN" && actor.profileCode !== "HIRING_MANAGER") {
      throw new ForbiddenException("Not allowed to reject onboarding for this company");
    }

    await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: "REJECTED" as any }
    });

    return { sessionId: session.id, status: "REJECTED" };
  }
}
