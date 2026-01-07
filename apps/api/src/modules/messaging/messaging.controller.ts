import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { MessagingService } from "./messaging.service";
import { $Enums } from "@prisma/client";

@Controller("messages")
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get("threads")
  async listThreads(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.listThreadsForUser(actor);
  }

  @Get("board/threads")
  async listBoardThreads(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.listBoardThreads(actor);
  }

  @Get("threads/:id")
  async getThread(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.getThread(actor, id);
  }

  @Get("board/threads/:id")
  async getBoardThread(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.getBoardThread(actor, id);
  }

  @Post("threads")
  async createThread(
    @Req() req: any,
    @Body()
    body: {
      subject?: string | null;
      participantUserIds?: string[];
      toExternalEmails?: string[];
      ccExternalEmails?: string[];
      bccExternalEmails?: string[];
      externalEmails?: string[];
      groupIds?: string[];
      journalSubjectUserIds?: string[];
      attachments?: {
        kind: $Enums.AttachmentKind;
        url: string;
        filename?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
        assetId?: string | null;
      }[];
      body: string;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.createThread(actor, body as any);
  }

  @Post("threads/:id/messages")
  async addMessage(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      body: string;
      attachments?: {
        kind: $Enums.AttachmentKind;
        url: string;
        filename?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
        assetId?: string | null;
      }[];
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.addMessage(actor, id, body.body, body.attachments);
  }

  @Post("board/threads")
  async createBoardThread(
    @Req() req: any,
    @Body()
    body: {
      subject?: string | null;
      body: string;
      attachments?: {
        kind: $Enums.AttachmentKind;
        url: string;
        filename?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
        assetId?: string | null;
      }[];
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.createBoardThread(actor, body);
  }

  @Post("board/threads/:id/messages")
  async addBoardMessage(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      body: string;
      attachments?: {
        kind: $Enums.AttachmentKind;
        url: string;
        filename?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
        assetId?: string | null;
      }[];
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.addBoardMessage(actor, id, body.body, body.attachments);
  }

  @Get("journal/user/:userId")
  async getUserJournal(@Req() req: any, @Param("userId") userId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.getUserJournal(actor, userId);
  }

  @Post("journal/user/:userId/entries")
  async addUserJournalEntry(
    @Req() req: any,
    @Param("userId") userId: string,
    @Body()
    body: {
      body: string;
      attachments?: {
        kind: $Enums.AttachmentKind;
        url: string;
        filename?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
        assetId?: string | null;
      }[];
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.appendUserJournalEntry(
      actor,
      userId,
      body.body,
      body.attachments,
    );
  }
}
