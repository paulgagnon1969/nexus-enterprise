import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { GlobalRole, Role } from "@prisma/client";

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    return this.prisma.skillCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async listDefinitions() {
    return this.prisma.skillDefinition.findMany({
      where: { active: true },
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });
  }

  async getSelfRatings(userId: string) {
    return this.prisma.userSkillRating.findMany({
      where: { userId },
    });
  }

  async upsertSelfRatings(userId: string, payload: { skillId: string; level: number }[]) {
    const now = new Date();

    try {
      for (const { skillId, level } of payload) {
        if (level < 1 || level > 5) {
          throw new ForbiddenException("Skill level must be between 1 and 5");
        }

        await this.prisma.userSkillRating.upsert({
          where: { UserSkillRating_user_skill_key: { userId, skillId } },
          update: {
            selfLevel: level,
            updatedAt: now,
          },
          create: {
            userId,
            skillId,
            selfLevel: level,
            updatedAt: now,
          },
        });
      }

      return this.getSelfRatings(userId);
    } catch (e: any) {
      // Surface underlying DB/Prisma error to the client for easier debugging during dev.
      throw new BadRequestException(e?.message ?? "Failed to save skills");
    }
  }

  async addEmployerRating(
    actor: AuthenticatedUser,
    targetUserId: string,
    skillId: string,
    level: number,
    comment?: string,
  ) {
    if (level < 1 || level > 5) {
      throw new ForbiddenException("Skill level must be between 1 and 5");
    }

    // Only OWNER/ADMIN in this company can currently rate workers; we can relax this later
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ForbiddenException("Only admins can rate worker skills for now");
    }

    // Ensure target user exists and is in the same company
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId: targetUserId, companyId: actor.companyId },
    });

    if (!membership) {
      throw new NotFoundException("Target user is not a member of your company");
    }

    const now = new Date();

    await this.prisma.employerSkillRating.create({
      data: {
        userId: targetUserId,
        skillId,
        companyId: actor.companyId,
        ratedByUserId: actor.userId,
        level,
        comment,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Recompute aggregate employerAvgLevel/employerRatingCount on UserSkillRating
    const agg = await this.prisma.employerSkillRating.aggregate({
      where: { userId: targetUserId, skillId },
      _avg: { level: true },
      _count: { level: true },
    });

    await this.prisma.userSkillRating.upsert({
      where: { UserSkillRating_user_skill_key: { userId: targetUserId, skillId } },
      update: {
        employerAvgLevel: agg._avg.level ?? undefined,
        employerRatingCount: agg._count.level,
        updatedAt: now,
      },
      create: {
        userId: targetUserId,
        skillId,
        selfLevel: 0,
        employerAvgLevel: agg._avg.level ?? undefined,
        employerRatingCount: agg._count.level,
        updatedAt: now,
      },
    });

    return this.prisma.userSkillRating.findUnique({
      where: { UserSkillRating_user_skill_key: { userId: targetUserId, skillId } },
    });
  }

  async addClientRating(
    actor: AuthenticatedUser,
    targetUserId: string,
    skillId: string,
    level: number,
    comment?: string,
  ) {
    if (level < 1 || level > 5) {
      throw new ForbiddenException("Skill level must be between 1 and 5");
    }

    // For now, only CLIENT users can leave client skill ratings.
    if (actor.userType !== "CLIENT") {
      throw new ForbiddenException("Only client users can leave client skill ratings");
    }

    const now = new Date();

    await this.prisma.clientSkillRating.create({
      data: {
        userId: targetUserId,
        skillId,
        clientCompanyId: actor.companyId ?? null,
        ratedByUserId: actor.userId,
        level,
        comment,
        createdAt: now,
        updatedAt: now,
      },
    });

    const agg = await this.prisma.clientSkillRating.aggregate({
      where: { userId: targetUserId, skillId },
      _avg: { level: true },
      _count: { level: true },
    });

    await this.prisma.userSkillRating.upsert({
      where: { UserSkillRating_user_skill_key: { userId: targetUserId, skillId } },
      update: {
        clientAvgLevel: agg._avg.level ?? undefined,
        clientRatingCount: agg._count.level,
        updatedAt: now,
      },
      create: {
        userId: targetUserId,
        skillId,
        selfLevel: 0,
        clientAvgLevel: agg._avg.level ?? undefined,
        clientRatingCount: agg._count.level,
        updatedAt: now,
      },
    });

    return this.prisma.userSkillRating.findUnique({
      where: { UserSkillRating_user_skill_key: { userId: targetUserId, skillId } },
    });
  }

  // NOTE: this returns details for a given user+skill. For suggestions, we call it
  // with the suggesting user and the suggestion.id as the skillId.
  // Authorization helper for skills review endpoints
  ensureCanReviewSkills(actor: AuthenticatedUser) {
    if (actor.globalRole === GlobalRole.SUPER_ADMIN) {
      return;
    }

    // Future: this.profileCode will be populated based on RoleProfile; for now we
    // treat "SKILLS_REVIEWER" as the dedicated skills review role.
    if ((actor as any).profileCode === "SKILLS_REVIEWER") {
      return;
    }

    // Company-level superiors (OWNER/ADMIN) can also review.
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return;
    }

    throw new ForbiddenException("You are not allowed to review skills");
  }

  // NOTE: this returns details for a given user+skill. For suggestions, we call it
  // with the suggesting user and the suggestion.id as the skillId.
  async getSelfSkillDetails(userId: string, skillId: string) {
    const self = await this.prisma.userSkillRating.findUnique({
      where: { UserSkillRating_user_skill_key: { userId, skillId } },
    });

    const peerRatings = await this.prisma.employerSkillRating.findMany({
      where: { userId, skillId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        level: true,
        comment: true,
        createdAt: true,
      },
    });

    const clientRatings = await this.prisma.clientSkillRating.findMany({
      where: { userId, skillId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        level: true,
        comment: true,
        createdAt: true,
      },
    });

    return {
      self: self
        ? {
            level: self.selfLevel,
            notes: self.notes ?? null,
          }
        : null,
      peerRatings,
      clientRatings,
    };
  }

  async updateSelfNotes(userId: string, skillId: string, notes: string) {
    const trimmed = notes.trim();
    const existing = await this.prisma.userSkillRating.findUnique({
      where: { UserSkillRating_user_skill_key: { userId, skillId } },
    });

    const now = new Date();

    if (existing) {
      return this.prisma.userSkillRating.update({
        where: { UserSkillRating_user_skill_key: { userId, skillId } },
        data: {
          notes: trimmed || null,
          updatedAt: now,
        },
      });
    }

    return this.prisma.userSkillRating.create({
      data: {
        userId,
        skillId,
        selfLevel: 0,
        notes: trimmed || null,
        updatedAt: now,
      },
    });
  }

  async listMySuggestions(userId: string) {
    return this.prisma.userSkillSuggestion.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  }

  async listPendingSuggestions() {
    return this.prisma.userSkillSuggestion.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  }

  async updateSuggestionStatus(
    id: string,
    status: "APPROVED" | "REJECTED",
  ) {
    return this.prisma.userSkillSuggestion.update({
      where: { id },
      data: { status },
    });
  }

  async approveSuggestion(id: string) {
    const suggestion = await this.prisma.userSkillSuggestion.findUnique({
      where: { id },
    });

    if (!suggestion) {
      throw new NotFoundException("Skill suggestion not found");
    }

    if (suggestion.status === "APPROVED") {
      return suggestion;
    }

    // Choose / create category
    let categoryId: string;
    if (suggestion.categoryLabel) {
      const existing = await this.prisma.skillCategory.findFirst({
        where: { label: suggestion.categoryLabel },
      });
      if (existing) {
        categoryId = existing.id;
      } else {
        const created = await this.prisma.skillCategory.create({
          data: {
            code: `user-cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            label: suggestion.categoryLabel,
          },
        });
        categoryId = created.id;
      }
    } else {
      let cat = await this.prisma.skillCategory.findFirst({
        where: { OR: [{ code: "user-submitted" }, { label: "User submitted" }] },
      });
      if (!cat) {
        cat = await this.prisma.skillCategory.create({
          data: {
            code: "user-submitted",
            label: "User submitted",
          },
        });
      }
      categoryId = cat.id;
    }

    // Promote to SkillDefinition, reusing suggestion.id as the skill id
    const definition = await this.prisma.skillDefinition.create({
      data: {
        id: suggestion.id,
        categoryId,
        code: `user-skill-${suggestion.id}`,
        label: suggestion.label,
        description: suggestion.description ?? null,
        active: true,
      },
    });

    const updatedSuggestion = await this.prisma.userSkillSuggestion.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    return { suggestion: updatedSuggestion, definition };
  }

  async getSuggestionReview(id: string) {
    const suggestion = await this.prisma.userSkillSuggestion.findUnique({ where: { id } });
    if (!suggestion) {
      throw new NotFoundException("Skill suggestion not found");
    }

    const ratingRow = await this.prisma.userSkillRating.findUnique({
      where: {
        UserSkillRating_user_skill_key: {
          userId: suggestion.userId,
          skillId: suggestion.id,
        },
      },
    });

    const details = await this.getSelfSkillDetails(suggestion.userId, suggestion.id);

    return {
      suggestion,
      summary: {
        selfLevel: ratingRow?.selfLevel ?? null,
        employerAvgLevel: ratingRow?.employerAvgLevel ?? null,
        employerRatingCount: ratingRow?.employerRatingCount ?? null,
        clientAvgLevel: ratingRow?.clientAvgLevel ?? null,
        clientRatingCount: ratingRow?.clientRatingCount ?? null,
      },
      details,
    };
  }

  async createSuggestion(
    userId: string,
    payload: { label: string; categoryLabel?: string; description?: string },
  ) {
    const label = payload.label?.trim();
    if (!label) {
      throw new BadRequestException("Skill label is required");
    }

    return this.prisma.userSkillSuggestion.create({
      data: {
        userId,
        label,
        categoryLabel: payload.categoryLabel?.trim() || null,
        description: payload.description?.trim() || null,
      },
    });
  }
}
