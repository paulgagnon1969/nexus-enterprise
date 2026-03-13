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
}
