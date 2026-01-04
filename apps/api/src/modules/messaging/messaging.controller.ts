import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { MessagingService } from "./messaging.service";

@Controller("messages")
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get("threads")
  async listThreads(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.listThreadsForUser(actor);
  }

  @Get("threads/:id")
  async getThread(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.getThread(actor, id);
  }

  @Post("threads")
  async createThread(
    @Req() req: any,
    @Body()
    body: {
      subject?: string | null;
      participantUserIds?: string[];
      externalEmails?: string[];
      body: string;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.createThread(actor, body);
  }

  @Post("threads/:id/messages")
  async addMessage(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { body: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.messaging.addMessage(actor, id, body.body);
  }
}
