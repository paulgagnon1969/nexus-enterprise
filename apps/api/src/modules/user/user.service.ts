import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        memberships: {
          select: {
            companyId: true,
            role: true,
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });
  }

  async getProfile(targetUserId: string, actor: AuthenticatedUser) {
    // Ensure target user is a member of the actor's company
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId: targetUserId, companyId: actor.companyId },
      select: {
        role: true,
        company: {
          select: { id: true, name: true },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException("User is not a member of your company");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        globalRole: true,
        userType: true,
        reputationOverallAvg: true,
        reputationOverallCount: true,
        reputationOverallOverride: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Load per-skill ratings (self + aggregates)
    const userSkillRatings = await this.prisma.userSkillRating.findMany({
      where: { userId: targetUserId },
    });

    // Load the full active skill catalog so the UI can show the complete matrix
    // (including unrated skills with empty stars).
    const skillDefs = await this.prisma.skillDefinition.findMany({
      where: { active: true },
      select: {
        id: true,
        code: true,
        label: true,
        tradeLabel: true,
        categoryId: true,
        sortOrder: true,
      },
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });

    const categories = await this.prisma.skillCategory.findMany({
      where: { active: true },
      select: { id: true, label: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });

    const ratingBySkillId = new Map(userSkillRatings.map(r => [r.skillId, r]));
    const catById = new Map(categories.map(c => [c.id, c]));

    const skills = skillDefs.map(def => {
      const r = ratingBySkillId.get(def.id);
      const cat = catById.get(def.categoryId) ?? null;

      const selfLevel = r?.selfLevel != null && r.selfLevel > 0 ? r.selfLevel : null;

      return {
        id: def.id,
        code: def.code,
        label: def.label,
        tradeLabel: def.tradeLabel ?? null,
        categoryLabel: cat?.label ?? null,
        selfLevel,
        employerAvgLevel: r?.employerAvgLevel ?? null,
        employerRatingCount: r?.employerRatingCount ?? null,
        clientAvgLevel: r?.clientAvgLevel ?? null,
        clientRatingCount: r?.clientRatingCount ?? null,
      };
    });

    return {
      id: user.id,
      email: user.email,
      globalRole: user.globalRole,
      userType: user.userType,
      company: membership.company,
      companyRole: membership.role,
      reputation: {
        avg: user.reputationOverallAvg,
        count: user.reputationOverallCount,
        override: user.reputationOverallOverride,
      },
      skills,
    };
  }
}
