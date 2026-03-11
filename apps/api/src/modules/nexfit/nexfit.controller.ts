import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { NexfitService } from "./nexfit.service";
import type { NexfitAnswers } from "@repo/database";
import type {
  ShareDocumentDto,
  RegisterViewerDto,
} from "./dto/share.dto";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";

interface SubscribeDto {
  email: string;
  name?: string;
  company?: string;
  answers?: Record<string, any>;
  reportSummary?: Record<string, any>;
}

/**
 * NexFIT — public endpoints (no auth).
 * Top-of-funnel conversion tool: questionnaire → personalized module recommendations.
 * Also hosts viral document-sharing endpoints (CLT-COLLAB-0003).
 */
@Controller("nexfit")
export class NexfitController {
  constructor(private readonly nexfit: NexfitService) {}

  /* ------------------------------------------------------------------ */
  /*  Original NexFIT endpoints                                         */
  /* ------------------------------------------------------------------ */

  /** Return the full questionnaire for the wizard UI */
  @Get("questions")
  getQuestions() {
    return this.nexfit.getQuestions();
  }

  /** Accept answers and return personalized recommendations with ROI */
  @Post("analyze")
  analyze(@Body() body: NexfitAnswers) {
    return this.nexfit.analyze(body);
  }

  /** Return module catalog enriched with NexOP data */
  @Get("modules")
  getModules() {
    return this.nexfit.getModuleNexopMap();
  }

  /** Lead capture — "Update me on new features" */
  @Post("subscribe")
  subscribe(@Body() body: SubscribeDto) {
    return this.nexfit.subscribe(body);
  }

  /* ------------------------------------------------------------------ */
  /*  Viral document sharing (CLT-COLLAB-0003)                          */
  /* ------------------------------------------------------------------ */

  /** Generate a share token & URL for a document */
  @Post("share")
  shareDocument(@Body() body: ShareDocumentDto) {
    return this.nexfit.shareDocument(body);
  }

  /** Validate a share token, log the view, return document metadata */
  @Get("view/:token")
  viewByToken(@Param("token") token: string) {
    return this.nexfit.viewByToken(token);
  }

  /** Lightweight VIEWER registration — returns JWT for immediate login */
  @Post("register")
  registerViewer(@Body() body: RegisterViewerDto) {
    return this.nexfit.registerViewer(body);
  }

  /** Return the referral chain for a given share token (analytics) */
  @Get("chain/:token")
  getShareChain(@Param("token") token: string) {
    return this.nexfit.getShareChain(token);
  }

  /* ------------------------------------------------------------------ */
  /*  Authenticated vouch — CAM Manual referral                         */
  /* ------------------------------------------------------------------ */

  /**
   * Generate a CAM_LIBRARY referral token for a recipient.
   * Requires authentication — only logged-in users can vouch.
   */
  @UseGuards(JwtAuthGuard)
  @Post("vouch")
  async vouchForCamAccess(
    @Req() req: any,
    @Body() body: { recipientEmail: string; recipientName?: string; message?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.nexfit.vouchForCamAccess({
      inviterUserId: user.userId,
      inviterEmail: user.email,
      recipientEmail: body.recipientEmail,
      recipientName: body.recipientName,
      message: body.message,
    });
  }
}
