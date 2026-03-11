import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { Public } from "../auth/auth.guards";
import {
  CamAccessService,
  type AcceptCndaDto,
  type SubmitQuestionnaireDto,
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
   * GET /cam-access/:token/content
   * Returns CAM Manual content. Requires both CNDA + questionnaire gates passed.
   */
  @Get(":token/content")
  async getContent(@Param("token") token: string, @Req() req: any) {
    return this.camAccess.getContent(token, {
      ipAddress: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
  }
}
