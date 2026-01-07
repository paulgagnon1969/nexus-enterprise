import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { Role, UserType, NexNetStatus, ReferralStatus, $Enums } from "@prisma/client";
import { encryptPortfolioHrJson } from "../../common/crypto/portfolio-hr.crypto";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../../common/email.service";

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

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
    input: { detailStatusCode: string | null }
  ) {
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
      throw new ForbiddenException("Not allowed to update candidate status for this company");
    }

    const code = (input.detailStatusCode || "").trim();

    if (code) {
      // Ensure the code exists for this company (or globally) and is active.
      const exists = await this.prisma.candidateStatusDefinition.findFirst({
        where: {
          isActive: true,
          code: code.toUpperCase(),
          OR: [
            { companyId: null },
            { companyId: actor.companyId },
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

    await this.prisma.onboardingProfile.upsert({
      where: { sessionId: session.id },
      update: profile,
      create: {
        sessionId: session.id,
        ...profile
      }
    });

    const checklist = (session.checklistJson && JSON.parse(session.checklistJson)) || {};
    checklist.profileComplete = true;

    return this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS" as any,
        checklistJson: JSON.stringify(checklist)
      }
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
        sizeBytes: params.sizeBytes ?? null
      }
    });

    const checklist = (session.checklistJson && JSON.parse(session.checklistJson)) || {};
    if (params.type === "PHOTO") checklist.photoUploaded = true;
    if (params.type === "GOV_ID") checklist.govIdUploaded = true;

    return this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "IN_PROGRESS" as any,
        checklistJson: JSON.stringify(checklist)
      }
    });
  }

  async submitByToken(token: string) {
    const session = await this.getSessionByToken(token);

    const updated = await this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "SUBMITTED" as any,
      },
    });

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

    return this.getSkillsForSessionByToken(token);
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
    if (
      actor.companyId !== companyId ||
      (actor.role !== "OWNER" && actor.role !== "ADMIN" && actor.profileCode !== "HIRING_MANAGER")
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
    const session = await this.prisma.onboardingSession.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        profile: true,
        documents: true,
        bankInfo: true
      }
    });

    if (!session) {
      throw new NotFoundException("Onboarding session not found");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN" && actor.profileCode !== "HIRING_MANAGER") {
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

    // Migrate onboarding skill ratings into UserSkillRating as self-levels
    const onboardingSkills = await this.prisma.onboardingSkillRating.findMany({
      where: { sessionId: session.id }
    });

    const now = new Date();
    for (const s of onboardingSkills) {
      await this.prisma.userSkillRating.upsert({
        where: {
          UserSkillRating_user_skill_key: {
            userId: user.id,
            skillId: s.skillId,
          },
        },
        update: {
          selfLevel: s.level,
          updatedAt: now
        },
        create: {
          userId: user.id,
          skillId: s.skillId,
          selfLevel: s.level,
          updatedAt: now
        }
      });
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
