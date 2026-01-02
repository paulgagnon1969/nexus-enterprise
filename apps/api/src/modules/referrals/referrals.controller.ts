import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { JwtAuthGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("referrals")
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  // Create a referral from the current authenticated user (candidate or member).
  @UseGuards(JwtAuthGuard)
  @Post()
  async createForCurrentUser(
    @Req() req: any,
    @Body()
    body: {
      prospectName?: string | null;
      prospectEmail?: string | null;
      prospectPhone?: string | null;
    },
  ) {
    const actor = req.user as AuthenticatedUser;

    if (!body) {
      throw new BadRequestException("Missing referral payload");
    }

    const result = await this.referrals.createReferralForUser(actor, {
      prospectName: body.prospectName ?? null,
      prospectEmail: body.prospectEmail ?? null,
      prospectPhone: body.prospectPhone ?? null,
    });

    return result;
  }

  // Current user's referrals (who I have referred).
  @UseGuards(JwtAuthGuard)
  @Get("me")
  async listForMe(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listReferralsForUser(actor);
  }

  // Summary of current user's referrals + earnings (referral bank).
  @UseGuards(JwtAuthGuard)
  @Get("me/summary")
  async summaryForMe(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.getReferralSummaryForUser(actor);
  }

  // System-wide list of referrals (SUPER_ADMIN only).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system")
  async listForSystem(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listReferralsForSystem(actor);
  }

  // System-wide list of Nex-Net candidates (SUPER_ADMIN only).
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/candidates")
  async listCandidatesForSystem(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listCandidatesForSystem(actor);
  }

  // System-wide gaming alerts: aggregate referee rejections per referrer.
  @UseGuards(JwtAuthGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Get("system/gaming-alerts")
  async listGamingAlerts(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.referrals.listGamingAlertsForSystem(actor);
  }
 
  // Public referral lookup for /apply?referralToken=...
  @Get("lookup/:token")
  async lookupPublic(@Param("token") token: string) {
    const result = await this.referrals.lookupByToken(token);
    if (!result) {
      throw new NotFoundException("Referral not found");
    }
    return result;
  }
}
