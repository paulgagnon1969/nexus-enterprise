import {
  Body,
  Controller,
  Delete,
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
  type BulkInviteDto,
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

  @Post("invite/bulk")
  sendBulkInvites(@Req() req: any, @Body() dto: BulkInviteDto) {
    return this.svc.sendBulkInvites(req.user as AuthenticatedUser, dto);
  }

  @Post("invite/:tokenId/resend")
  resendInvite(@Req() req: any, @Param("tokenId") tokenId: string) {
    return this.svc.resendInvite(req.user as AuthenticatedUser, tokenId);
  }

  @Delete("invite/:tokenId")
  rescindInvite(@Req() req: any, @Param("tokenId") tokenId: string) {
    return this.svc.rescindInvite(req.user as AuthenticatedUser, tokenId);
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

  /* ── Invite Picker ───────────────────────────────────────────── */

  @Get("invite-picker")
  getInvitePickerData(
    @Req() req: any,
    @Query("cursor") cursor?: string,
    @Query("search") search?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) || 200 : 200;
    return this.svc.getInvitePickerData(
      req.user as AuthenticatedUser,
      cursor,
      search,
      Math.min(limit, 500),
    );
  }

  @Get("invite-picker/invitees")
  getInvitePickerInvitees() {
    return this.svc.getInvitePickerInvitees();
  }

  @Get("invite-picker/excluded")
  getExcludedContacts(
    @Req() req: any,
    @Query("search") search?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.svc.getExcludedContacts(
      req.user as AuthenticatedUser,
      search,
      cursor,
    );
  }

  @Post("invite-picker/exclude")
  bulkExcludeContacts(
    @Req() req: any,
    @Body() body: { contactIds: string[]; exclude: boolean },
  ) {
    return this.svc.bulkExcludeContacts(
      req.user as AuthenticatedUser,
      body.contactIds,
      body.exclude,
    );
  }

  /* ── Group Invite ────────────────────────────────────────────── */

  @Post("invite/group")
  sendGroupInvite(
    @Req() req: any,
    @Body()
    body: {
      contactIds: string[];
      message: string;
      groupName?: string;
      deliveryMethods: Array<"email" | "sms">;
    },
  ) {
    return this.svc.sendGroupInvite(req.user as AuthenticatedUser, body);
  }

  /* ── Invite Groups ───────────────────────────────────────────── */

  @Get("invite-groups")
  listInviteGroups(@Req() req: any) {
    return this.svc.listInviteGroups(req.user as AuthenticatedUser);
  }

  @Patch("invite-groups/:id")
  renameInviteGroup(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { name: string },
  ) {
    return this.svc.renameInviteGroup(
      req.user as AuthenticatedUser,
      id,
      body.name,
    );
  }

  /* ── Canned Messages ────────────────────────────────────────── */

  @Get("canned-messages")
  listCannedMessages() {
    return this.svc.listCannedMessages();
  }

  @Post("canned-messages")
  createCannedMessage(
    @Req() req: any,
    @Body() body: { title: string; body: string; isDefault?: boolean },
  ) {
    return this.svc.createCannedMessage(req.user as AuthenticatedUser, body);
  }

  @Patch("canned-messages/:id")
  updateCannedMessage(
    @Param("id") id: string,
    @Body() body: { title?: string; body?: string; isDefault?: boolean },
  ) {
    return this.svc.updateCannedMessage(id, body);
  }

  @Delete("canned-messages/:id")
  deleteCannedMessage(@Param("id") id: string) {
    return this.svc.deleteCannedMessage(id);
  }
}
