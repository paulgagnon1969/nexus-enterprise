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
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DevSessionService } from "./dev-session.service";
import { DevSessionGateway } from "./dev-session.gateway";
import type { DevSessionStatus, DevSessionEventType, DevApprovalRequestType } from "@prisma/client";

// ── DTOs ─────────────────────────────────────────────────────────────

interface CreateSessionDto {
  title: string;
  description?: string;
}

interface UpdateStatusDto {
  status: DevSessionStatus;
}

interface PostEventDto {
  eventType: DevSessionEventType;
  summary: string;
  detail?: any;
}

interface PostCommentDto {
  text: string;
}

interface CreateApprovalDto {
  requestType: DevApprovalRequestType;
  title: string;
  description?: string;
  detail?: any;
}

interface ResolveApprovalDto {
  status: "APPROVED" | "REJECTED";
  comment?: string;
}

@Controller("dev-session")
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
export class DevSessionController {
  constructor(
    private readonly service: DevSessionService,
    private readonly gateway: DevSessionGateway,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() body: CreateSessionDto) {
    const user = req.user as AuthenticatedUser;
    return this.service.createSession({
      companyId: user.companyId,
      createdById: user.userId,
      title: body.title,
      description: body.description,
    });
  }

  @Get()
  async list(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.service.listSessions(user.companyId);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.service.getSession(id);
  }

  @Patch(":id")
  async updateStatus(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: UpdateStatusDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const session = await this.service.updateStatus(
      id,
      body.status,
      user.userId,
    );
    // Broadcast status change via WebSocket
    this.gateway.emitSessionEvent(id, {
      type: "status-change",
      status: body.status,
    });
    return session;
  }

  @Post(":id/events")
  async postEvent(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: PostEventDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const event = await this.service.postEvent({
      sessionId: id,
      eventType: body.eventType,
      summary: body.summary,
      detail: body.detail,
      actorUserId: user.userId,
    });
    // Broadcast event via WebSocket
    this.gateway.emitSessionEvent(id, {
      type: "session-event",
      event,
    });
    return event;
  }

  @Get(":id/events")
  async getEvents(
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.service.getEvents(id, cursor, take ? parseInt(take, 10) : 50);
  }

  @Post(":id/comment")
  async postComment(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: PostCommentDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const event = await this.service.postComment(id, user.userId, body.text);
    this.gateway.emitSessionEvent(id, {
      type: "session-event",
      event,
    });
    return event;
  }

  @Post(":id/approval-requests")
  async createApproval(
    @Param("id") id: string,
    @Body() body: CreateApprovalDto,
  ) {
    const result = await this.service.createApprovalRequest({
      sessionId: id,
      requestType: body.requestType,
      title: body.title,
      description: body.description,
      detail: body.detail,
    });
    // Broadcast approval request via WebSocket
    this.gateway.emitSessionEvent(id, {
      type: "approval-request",
      approval: result.approval,
      event: result.event,
    });
    return result;
  }

  @Get("approval-requests/:requestId")
  async getApproval(@Param("requestId") requestId: string) {
    return this.service.getApproval(requestId);
  }

  @Patch("approval-requests/:requestId")
  async resolveApproval(
    @Param("requestId") requestId: string,
    @Req() req: any,
    @Body() body: ResolveApprovalDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const result = await this.service.resolveApproval(
      requestId,
      user.userId,
      body.status,
      body.comment,
    );
    // Broadcast resolution via WebSocket
    this.gateway.emitSessionEvent(result.sessionId, {
      type: "approval-response",
      approvalId: requestId,
      status: body.status,
      comment: body.comment,
    });
    return result;
  }
}
