import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Public } from "../auth/auth.guards";
import {
  JwtAuthGuard,
  GlobalRoles,
  GlobalRole,
  GlobalRolesGuard,
} from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  CamDiscussionService,
  type CreateThreadDto,
  type PostMessageDto,
  type MoveThreadDto,
} from "./cam-discussion.service";

/* ================================================================== */
/*  PUBLIC routes — PIP viewer access, validated by share token        */
/* ================================================================== */

@Public()
@Controller("cam-access/:token/discussions")
export class CamDiscussionPublicController {
  constructor(private readonly svc: CamDiscussionService) {}

  /** List threads for a CAM section (or general/manual-level if no camSection). */
  @Get()
  listThreads(
    @Param("token") token: string,
    @Query("camSection") camSection?: string,
  ) {
    return this.svc.listThreads(token, camSection);
  }

  /** Get full thread detail with all messages. */
  @Get(":threadId")
  getThread(
    @Param("token") token: string,
    @Param("threadId") threadId: string,
  ) {
    return this.svc.getThread(token, threadId);
  }

  /** Create a new discussion thread. */
  @Post()
  createThread(
    @Param("token") token: string,
    @Body() dto: CreateThreadDto,
  ) {
    return this.svc.createThread(token, dto);
  }

  /** Post a reply to a thread. */
  @Post(":threadId/messages")
  postMessage(
    @Param("token") token: string,
    @Param("threadId") threadId: string,
    @Body() dto: PostMessageDto,
  ) {
    return this.svc.postMessage(token, threadId, dto);
  }

  /** Toggle notification mute for the current viewer on a thread. */
  @Post(":threadId/mute")
  toggleMute(
    @Param("token") token: string,
    @Param("threadId") threadId: string,
  ) {
    return this.svc.toggleMute(token, threadId);
  }

  /** Get unread message counts per CAM section for badge display. */
  @Get("unread-counts")
  getUnreadCounts(@Param("token") token: string) {
    return this.svc.getUnreadCounts(token);
  }

  /** Get all CAM read statuses + favorites for badge coloring. */
  @Get("cam-statuses")
  getCamStatuses(@Param("token") token: string) {
    return this.svc.getCamStatuses(token);
  }

  /** Mark a CAM as read (user viewed it). */
  @Post("cam-read")
  markCamRead(
    @Param("token") token: string,
    @Body() body: { camId: string },
  ) {
    return this.svc.markCamRead(token, body.camId);
  }

  /** Toggle favorite status for a CAM. */
  @Post("cam-favorite")
  toggleCamFavorite(
    @Param("token") token: string,
    @Body() body: { camId: string },
  ) {
    return this.svc.toggleCamFavorite(token, body.camId);
  }

  /** List global announcements (last 30 days). */
  @Get("announcements")
  listAnnouncements(@Param("token") token: string) {
    return this.svc.listAnnouncements(token);
  }

  /** Register a mobile device push token for this PIP viewer. */
  @Post("register-device")
  registerDevice(
    @Param("token") token: string,
    @Body() body: { expoPushToken: string },
  ) {
    return this.svc.registerDevice(token, body.expoPushToken);
  }
}

/* ================================================================== */
/*  SUBSCRIPTION routes — PIP viewer CAM-level subscriptions           */
/* ================================================================== */

@Public()
@Controller("cam-access/:token/subscriptions")
export class CamSubscriptionPublicController {
  constructor(private readonly svc: CamDiscussionService) {}

  /** List all CAM sections this viewer is subscribed to. */
  @Get()
  getSubscriptions(@Param("token") token: string) {
    return this.svc.getSubscriptions(token);
  }

  /** Toggle subscription for a CAM section. */
  @Post()
  toggleSubscription(
    @Param("token") token: string,
    @Body() body: { camSection: string; enabled: boolean },
  ) {
    return this.svc.toggleSubscription(token, body.camSection, body.enabled);
  }
}

/* ================================================================== */
/*  ADMIN routes — requires JWT + SUPER_ADMIN                         */
/* ================================================================== */

@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
@Controller("cam-access/admin/discussions")
export class CamDiscussionAdminController {
  constructor(private readonly svc: CamDiscussionService) {}

  /** Move a thread from one CAM section to another. */
  @Post(":threadId/move")
  moveThread(
    @Param("threadId") threadId: string,
    @Body() dto: MoveThreadDto,
    @Req() req: any,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.svc.moveThread(threadId, actor.userId, dto);
  }

  /** Pin / unpin a thread. */
  @Post(":threadId/pin")
  async togglePin(
    @Param("threadId") threadId: string,
    @Req() req: any,
  ) {
    const prisma = (this.svc as any).prisma;
    const thread = await prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) return { error: "Thread not found" };
    const updated = await prisma.camDiscussionThread.update({
      where: { id: threadId },
      data: { isPinned: !thread.isPinned },
    });
    return { isPinned: updated.isPinned };
  }

  /** Mark / unmark a thread as FAQ. */
  @Post(":threadId/faq")
  async toggleFaq(
    @Param("threadId") threadId: string,
    @Req() req: any,
  ) {
    const prisma = (this.svc as any).prisma;
    const thread = await prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) return { error: "Thread not found" };
    const updated = await prisma.camDiscussionThread.update({
      where: { id: threadId },
      data: { isFaq: !thread.isFaq },
    });
    return { isFaq: updated.isFaq };
  }

  /** Delete a thread and all messages. */
  @Delete(":threadId")
  deleteThread(@Param("threadId") threadId: string) {
    return this.svc.deleteThread(threadId);
  }

  /** Create a global PIP announcement (push to all active viewers). */
  @Post("announcements")
  createAnnouncement(
    @Req() req: any,
    @Body() dto: { title: string; body: string; priority?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.svc.createAnnouncement(actor.userId, dto as any);
  }
}
