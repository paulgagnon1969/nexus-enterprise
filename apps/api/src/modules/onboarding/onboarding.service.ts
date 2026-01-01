import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { Role, UserType } from "@prisma/client";

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private generateToken(): string {
    return randomBytes(24).toString("hex");
  }

  private normalizeEmail(email: string): string {
    return (email || "").trim().toLowerCase();
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

  async startPublicSession(email: string, password: string) {
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

    return this.prisma.onboardingSession.update({
      where: { id: session.id },
      data: {
        status: "SUBMITTED" as any
      }
    });
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

  async listSessionsForCompany(companyId: string, actor: AuthenticatedUser, statuses?: string[]) {
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
