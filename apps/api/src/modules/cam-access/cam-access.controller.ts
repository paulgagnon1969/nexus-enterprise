import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { Public } from "../auth/auth.guards";
import {
  CamAccessService,
  type AcceptCndaDto,
  type SubmitQuestionnaireDto,
  type SubmitReferralDto,
} from "./cam-access.service";

/**
 * CAM Access — public endpoints (no auth required).
 * Implements the referral-gated flow: validate token → accept CNDA → questionnaire → content.
 */
@Public()
@Controller("cam-access")
export class CamAccessController {
  constructor(private readonly camAccess: CamAccessService) {}

  /**
   * POST /cam-access/recover
   * Re-send the access link to a previously invited email.
   * Always returns success (prevents email enumeration).
   */
  @Post("recover")
  async recoverLink(@Body() body: { email: string }) {
    return this.camAccess.recoverLink(body.email);
  }

  /**
   * GET /cam-access/:token
   * Validate a share token and return the current gate status.
   */
  @Get(":token")
  async getGateStatus(@Param("token") token: string, @Req() req: any) {
    return this.camAccess.getGateStatus(token, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /**
   * POST /cam-access/:token/accept-cnda
   * Record CNDA+ acceptance with IP/UA forensic data.
   */
  @Post(":token/accept-cnda")
  async acceptCnda(
    @Param("token") token: string,
    @Body() dto: AcceptCndaDto,
    @Req() req: any,
  ) {
    return this.camAccess.acceptCnda(token, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /**
   * POST /cam-access/:token/questionnaire
   * Submit questionnaire answers (brief NexFIT subset).
   */
  @Post(":token/questionnaire")
  async submitQuestionnaire(
    @Param("token") token: string,
    @Body() dto: SubmitQuestionnaireDto,
    @Req() req: any,
  ) {
    return this.camAccess.submitQuestionnaire(token, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /**
   * GET /cam-access/:token/content?email=...
   * Returns CAM Manual content. Requires both CNDA + questionnaire gates passed,
   * plus identity verification: the email must match the CNDA signer.
   */
  @Get(":token/content")
  async getContent(
    @Param("token") token: string,
    @Query("email") email: string | undefined,
    @Req() req: any,
  ) {
    return this.camAccess.getContent(token, email, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /**
   * POST /cam-access/:token/withdraw
   * Self-withdrawal — an invitee revokes their own access.
   * Requires email verification (must match the CNDA signer).
   */
  @Post(":token/withdraw")
  async withdraw(
    @Param("token") token: string,
    @Body() body: { email: string },
    @Req() req: any,
  ) {
    return this.camAccess.withdraw(token, body.email, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }

  /**
   * POST /cam-access/:token/refer
   * Viral referral — an invitee who has completed CNDA + questionnaire
   * can refer someone else. Creates a child token and sends an invite.
   */
  @Post(":token/refer")
  async submitReferral(
    @Param("token") token: string,
    @Body() dto: SubmitReferralDto,
    @Req() req: any,
  ) {
    return this.camAccess.submitReferral(token, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }
}
