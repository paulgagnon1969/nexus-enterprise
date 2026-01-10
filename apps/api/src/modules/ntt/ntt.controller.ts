import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { NttService } from "./ntt.service";
import { NttTicketReadGuard, NttTicketManageGuard } from "./ntt.guards";
import { NttStatus, NttSubjectType } from "@prisma/client";

class CreateNttDto {
  subjectType!: NttSubjectType;
  summary!: string;
  description!: string;
  pagePath?: string;
  pageLabel?: string;
  contextJson?: Record<string, any>;
  tagCodes?: string[];
}

@Controller("ntt")
@UseGuards(JwtAuthGuard)
export class NttController {
  constructor(private readonly ntt: NttService) {}

  @Post()
  async createTicket(@Req() req: any, @Body() dto: CreateNttDto) {
    const user = req.user as AuthenticatedUser;
    return this.ntt.createTicket({
      companyId: user.companyId,
      initiatorUserId: user.userId,
      subjectType: dto.subjectType,
      summary: dto.summary,
      description: dto.description,
      pagePath: dto.pagePath,
      pageLabel: dto.pageLabel,
      contextJson: dto.contextJson,
      tagCodes: dto.tagCodes,
    });
  }

  @Get()
  async listTickets(@Req() req: any, @Query("mineOnly") mineOnly?: string) {
    const user = req.user as AuthenticatedUser;
    return this.ntt.listTicketsForUser(user, { mineOnly: mineOnly === "1" });
  }

  @Get(":id")
  @UseGuards(NttTicketReadGuard)
  async getTicket(@Req() req: any, @Param("id") id: string) {
    return req.nttTicket;
  }

  @Post(":id/status")
  @UseGuards(NttTicketReadGuard, NttTicketManageGuard)
  async updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body("status") status: NttStatus,
    @Body("resolutionNote") resolutionNote?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.ntt.updateStatus(id, status, user, resolutionNote);
  }

  @Get(":id/tasks")
  @UseGuards(NttTicketReadGuard)
  async listTasksForTicket(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.ntt.listTasksForTicket(id, user);
  }

  @Post(":id/tasks")
  @UseGuards(NttTicketReadGuard, NttTicketManageGuard)
  async createTaskForTicket(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      title: string;
      description?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      dueDate?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    const dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
    return this.ntt.createTaskForTicket(id, user, {
      title: body.title,
      description: body.description,
      priority: body.priority,
      dueDate,
    });
  }

  @Get(":id/messages")
  @UseGuards(NttTicketReadGuard)
  async listMessagesForTicket(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.ntt.listMessagesForTicket(id, user);
  }

  @Post(":id/notes/:noteId/publish-faq")
  @UseGuards(NttTicketReadGuard, NttTicketManageGuard)
  async publishFaq(
    @Req() req: any,
    @Param("id") id: string,
    @Param("noteId") noteId: string,
    @Body() body: { title: string; category?: string; audience?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.ntt.publishNoteAsFaq({
      ticketId: id,
      noteId,
      actor: user,
      title: body.title,
      category: body.category,
      audience: body.audience,
    });
  }
}
