import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { randomBytes } from "node:crypto";

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private generateToken(): string {
    return randomBytes(24).toString("hex");
  }

  async startSession(companyId: string, email: string, assignedHiringManagerId?: string | null) {
    const token = this.generateToken();

    const session = await this.prisma.onboardingSession.create({
      data: {
        companyId,
        email,
        token,
        status: "NOT_STARTED" as any,
        checklistJson: JSON.stringify({
          profileComplete: false,
          photoUploaded: false,
          govIdUploaded: false
        }),
        assignedHiringManagerId: assignedHiringManagerId ?? null
      }
    });

    return session;
  }

  async getSessionByToken(token: string) {
    const session = await this.prisma.onboardingSession.findUnique({
      where: { token }
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

    return this.prisma.onboardingSession.findMany({
      where: {
        companyId,
        status: statuses && statuses.length ? { in: statuses as any } : undefined
      },
      orderBy: { createdAt: "desc" }
    });
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
