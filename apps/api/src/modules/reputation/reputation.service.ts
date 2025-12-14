import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Injectable()
export class ReputationService {
  constructor(private readonly prisma: PrismaService) {}

  async rateCompanyOverall(
    actor: AuthenticatedUser,
    companyId: string,
    score: number,
    comment?: string
  ) {
    if (score < 1 || score > 5) {
      throw new ForbiddenException("Score must be between 1 and 5");
    }

    // For now, require that the actor belongs to the same company they are rating.
    // Later we can relax this for clients or cross-org work history.
    if (actor.companyId !== companyId) {
      throw new ForbiddenException("You can only rate your own company for now");
    }

    const sourceType = actor.role === "CLIENT"
      ? "CLIENT_ON_COMPANY"
      : "WORKER_ON_EMPLOYER";

    const rating = await this.prisma.reputationRating.create({
      data: {
        subjectType: "COMPANY" as any,
        subjectCompanyId: companyId,
        raterUserId: actor.userId,
        raterCompanyId: actor.companyId,
        sourceType: sourceType as any,
        dimension: "OVERALL" as any,
        score,
        comment,
        moderationStatus: "PENDING" as any,
      },
    });

    // Aggregates are recomputed when an admin approves this rating.
    return rating;
  }

  async rateUserOverall(
    actor: AuthenticatedUser,
    targetUserId: string,
    score: number,
    comment?: string
  ) {
    if (score < 1 || score > 5) {
      throw new ForbiddenException("Score must be between 1 and 5");
    }

    // Ensure target user is in the same company as actor (employer-on-worker for now)
    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId: targetUserId, companyId: actor.companyId },
    });
    if (!membership) {
      throw new NotFoundException("Target user is not a member of your company");
    }

    const rating = await this.prisma.reputationRating.create({
      data: {
        subjectType: "USER" as any,
        subjectUserId: targetUserId,
        subjectCompanyId: actor.companyId,
        raterUserId: actor.userId,
        raterCompanyId: actor.companyId,
        sourceType: "EMPLOYER_ON_WORKER" as any,
        dimension: "OVERALL" as any,
        score,
        comment,
        moderationStatus: "PENDING" as any,
      },
    });

    return rating;
  }
}
