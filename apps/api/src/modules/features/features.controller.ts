import { Controller, Get, Param, Post, Body, Req, UseGuards, ForbiddenException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { FeaturesService } from "./features.service";

@Controller("features")
@UseGuards(JwtAuthGuard)
export class FeaturesController {
  constructor(private readonly features: FeaturesService) {}

  /**
   * GET /features/announcements
   * Returns all active feature announcements with the caller's view status.
   */
  @Get("announcements")
  async getAnnouncements(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.features.getAnnouncementsForUser(user.userId, user.role);
  }

  /**
   * POST /features/:id/acknowledge
   * Marks a feature announcement as "Got it" for the caller.
   */
  @Post(":id/acknowledge")
  async acknowledge(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.features.acknowledge(user.userId, id);
  }

  /**
   * POST /features/record-redirect
   * Called by the web client after a login redirect to /whats-new.
   * Increments redirect count for all unseen announcements.
   */
  @Post("record-redirect")
  async recordRedirect(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    await this.features.recordRedirect(user.userId, user.role);
    return { success: true };
  }

  /**
   * POST /features/broadcast-module
   * SUPER_ADMIN only — broadcasts a new module announcement to all Admin/Owner
   * users via in-app notification + email.
   */
  @Post("broadcast-module")
  async broadcastModule(
    @Req() req: any,
    @Body()
    body: {
      moduleCode?: string;
      camId?: string;
      title: string;
      description: string;
      ctaLabel?: string;
      ctaUrl?: string;
      summaryBullets: string[];
    },
  ) {
    const user = req.user as AuthenticatedUser;
    if (user.globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenException("Only SUPER_ADMIN can broadcast module announcements");
    }
    return this.features.broadcastNewModule(body);
  }
}
