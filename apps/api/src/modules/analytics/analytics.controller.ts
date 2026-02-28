import { Controller, Get, Post, Query, Param, Body, Req, UseGuards, ForbiddenException } from "@nestjs/common";
import { JwtAuthGuard, getEffectiveRoleLevel, PROFILE_LEVELS } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AnalyticsService } from "./analytics.service";

const PM_LEVEL = PROFILE_LEVELS.PM; // 60

@UseGuards(JwtAuthGuard)
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Personal KPI dashboard — any authenticated user */
  @Get("me")
  getMyKpis(@Req() req: any, @Query("period") period?: string) {
    const user = req.user as AuthenticatedUser;
    return this.analytics.getPersonalKpis(
      user.userId,
      user.companyId,
      period || "30d",
    );
  }

  // ── Gaming Review Queue (PM+ only) ──────────────────────────────────

  private assertPmPlus(user: AuthenticatedUser): void {
    const level = getEffectiveRoleLevel({
      globalRole: user.globalRole,
      role: user.role,
      profileCode: user.profileCode,
    });
    if (level < PM_LEVEL) throw new ForbiddenException("PM+ role required");
  }

  /** Pending gaming flags for reviewer — PM+ */
  @Get("gaming-review")
  getGamingReviewQueue(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    this.assertPmPlus(user);
    return this.analytics.getGamingReviewQueue(user.companyId);
  }

  /** Review a gaming flag: dismiss, confirm, or coach */
  @Post("gaming-review/:id/action")
  reviewGamingFlag(
    @Req() req: any,
    @Param("id") flagId: string,
    @Body("action") action: string,
    @Body("notes") notes?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertPmPlus(user);
    const validActions = ["DISMISSED", "CONFIRMED", "COACHED"] as const;
    if (!validActions.includes(action as any)) {
      throw new ForbiddenException("Invalid action. Use DISMISSED, CONFIRMED, or COACHED.");
    }
    return this.analytics.reviewGamingFlag(
      flagId,
      user.userId,
      action as "DISMISSED" | "CONFIRMED" | "COACHED",
      notes,
    );
  }
}
