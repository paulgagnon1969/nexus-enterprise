import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  JwtAuthGuard,
  GlobalRoles,
  GlobalRole,
  GlobalRolesGuard,
} from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  CamDashboardService,
  type SendInviteDto,
  type CreateTopicDto,
  type CreateThreadDto,
  type PostMessageDto,
  type PatchThreadDto,
} from "./cam-dashboard.service";

/**
 * CAM Dashboard — SUPER_ADMIN only.
 * Analytics, invite management, and discussion board for the CAM sharing program.
 */
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
@Controller("cam-dashboard")
export class CamDashboardController {
  constructor(private readonly svc: CamDashboardService) {}

  /* ── Analytics ──────────────────────────────────────────────────── */

  @Get("analytics")
  getAnalytics() {
    return this.svc.getAnalytics();
  }

  @Get("referral-tree")
  getReferralTree() {
    return this.svc.getReferralTree();
  }

  /* ── Handbook content ──────────────────────────────────────────── */

  @Get("handbook")
  getHandbook() {
    return this.svc.getHandbookContent();
  }

  /* ── Invites ───────────────────────────────────────────────────── */

  @Get("invites")
  listInvites() {
    return this.svc.listInvites();
  }

  @Post("invite")
  sendInvite(@Req() req: any, @Body() dto: SendInviteDto) {
    return this.svc.sendInvite(req.user as AuthenticatedUser, dto);
  }

  @Post("invite/:tokenId/resend")
  resendInvite(@Req() req: any, @Param("tokenId") tokenId: string) {
    return this.svc.resendInvite(req.user as AuthenticatedUser, tokenId);
  }

  /* ── Discussion — Topics ───────────────────────────────────────── */

  @Get("topics")
  listTopics() {
    return this.svc.listTopics();
  }

  @Post("topics")
  createTopic(@Req() req: any, @Body() dto: CreateTopicDto) {
    return this.svc.createTopic(req.user as AuthenticatedUser, dto);
  }

  /* ── Discussion — Threads ──────────────────────────────────────── */

  @Get("threads")
  listThreads(
    @Req() req: any,
    @Query("topicId") topicId?: string,
    @Query("camSection") camSection?: string,
  ) {
    return this.svc.listThreads(req.user as AuthenticatedUser, {
      topicId,
      camSection,
    });
  }

  @Post("threads")
  createThread(@Req() req: any, @Body() dto: CreateThreadDto) {
    return this.svc.createThread(req.user as AuthenticatedUser, dto);
  }

  @Get("threads/:id/messages")
  getThreadMessages(@Req() req: any, @Param("id") id: string) {
    return this.svc.getThreadMessages(req.user as AuthenticatedUser, id);
  }

  @Post("threads/:id/messages")
  postMessage(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.svc.postMessage(req.user as AuthenticatedUser, id, dto);
  }

  @Patch("threads/:id")
  patchThread(@Param("id") id: string, @Body() dto: PatchThreadDto) {
    return this.svc.patchThread(id, dto);
  }
}
