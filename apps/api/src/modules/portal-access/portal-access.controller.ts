import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { Public } from "../auth/auth.guards";
import { PortalAccessService } from "./portal-access.service";

/**
 * Portal Access — public endpoints (no auth required).
 * Implements the gated flow for Secure Portal Campaigns:
 * validate token → accept CNDA → questionnaire → identity verify → content.
 */
@Public()
@Controller("portal-access")
export class PortalAccessController {
  constructor(private readonly portalAccess: PortalAccessService) {}

  /** GET /portal-access/:token — Validate token and return gate status + CNDA HTML. */
  @Get(":token")
  async getGateStatus(@Param("token") token: string, @Req() req: any) {
    return this.portalAccess.getGateStatus(token, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /** POST /portal-access/:token/accept-cnda — Record CNDA acceptance. */
  @Post(":token/accept-cnda")
  async acceptCnda(
    @Param("token") token: string,
    @Body() dto: { fullName: string; email: string; company?: string },
    @Req() req: any,
  ) {
    return this.portalAccess.acceptCnda(token, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /** POST /portal-access/:token/questionnaire — Submit questionnaire answers. */
  @Post(":token/questionnaire")
  async submitQuestionnaire(
    @Param("token") token: string,
    @Body() dto: { answers: Record<string, any> },
    @Req() req: any,
  ) {
    return this.portalAccess.submitQuestionnaire(token, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /** GET /portal-access/:token/content?email=... — Serve campaign documents (identity-verified). */
  @Get(":token/content")
  async getContent(
    @Param("token") token: string,
    @Query("email") email: string | undefined,
    @Req() req: any,
  ) {
    return this.portalAccess.getContent(token, email, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }
}
