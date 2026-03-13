import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { PushService } from "../notifications/push.service";
import {
  DevSessionStatus,
  DevSessionEventType,
  DevApprovalStatus,
  type DevApprovalRequestType,
} from "@prisma/client";
import * as crypto from "node:crypto";

// ── Helpers ──────────────────────────────────────────────────────────

/** Generate a 6-character uppercase alphanumeric session code. */
function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Approval request TTL: 30 minutes. */
const APPROVAL_TTL_MS = 30 * 60 * 1000;

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

@Injectable()
export class DevSessionService {
  private readonly logger = new Logger(DevSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  // ── Sessions ──────────────────────────────────────────────────────

  async createSession(opts: {
    companyId: string;
    createdById: string;
    title: string;
    description?: string;
  }) {
    // Generate unique session code
    let sessionCode: string;
    let attempts = 0;
    do {
      sessionCode = generateSessionCode();
      const existing = await this.prisma.devSession.findUnique({
        where: { sessionCode },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new BadRequestException("Failed to generate unique session code");
    }

    const session = await this.prisma.devSession.create({
      data: {
        companyId: opts.companyId,
        createdById: opts.createdById,
        title: opts.title,
        description: opts.description,
        sessionCode,
        lastHeartbeat: new Date(),
      },
      include: { createdBy: { select: USER_SELECT } },
    });

    // Create initial STATUS_CHANGE event
    await this.prisma.devSessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: "STATUS_CHANGE",
        summary: `Session started: ${opts.title}`,
        detail: { from: null, to: "ACTIVE" },
      },
    });

    return session;
  }

  async listSessions(companyId: string) {
    return this.prisma.devSession.findMany({
      where: { companyId },
      orderBy: [
        { status: "asc" }, // ACTIVE first
        { createdAt: "desc" },
      ],
      take: 50,
      include: {
        createdBy: { select: USER_SELECT },
        _count: { select: { events: true, approvals: true } },
      },
    });
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.devSession.findUnique({
      where: { id: sessionId },
      include: {
        createdBy: { select: USER_SELECT },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            actorUser: { select: USER_SELECT },
            approval: {
              select: {
                id: true,
                status: true,
                requestType: true,
                title: true,
                resolverComment: true,
                resolvedAt: true,
              },
            },
          },
        },
        approvals: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!session) throw new NotFoundException("Session not found");
    return session;
  }

  async getSessionByCode(code: string) {
    const session = await this.prisma.devSession.findUnique({
      where: { sessionCode: code.toUpperCase() },
    });
    if (!session) throw new NotFoundException("Session not found");
    return session;
  }

  async updateStatus(
    sessionId: string,
    status: DevSessionStatus,
    actorUserId?: string,
  ) {
    const session = await this.prisma.devSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException("Session not found");

    const oldStatus = session.status;
    const data: any = { status };
    if (
      status === "COMPLETED" ||
      status === "CANCELLED"
    ) {
      data.endedAt = new Date();
    }

    const updated = await this.prisma.devSession.update({
      where: { id: sessionId },
      data,
      include: { createdBy: { select: USER_SELECT } },
    });

    await this.prisma.devSessionEvent.create({
      data: {
        sessionId,
        eventType: "STATUS_CHANGE",
        summary: `Status changed: ${oldStatus} → ${status}`,
        detail: { from: oldStatus, to: status },
        actorUserId,
      },
    });

    // Push notification for AWAITING_REVIEW
    if (status === "AWAITING_REVIEW") {
      await this.pushToSuperAdmins(session.companyId, {
        title: "Session Ready for Review",
        body: session.title,
        data: { type: "dev_session", sessionId },
        categoryId: "dev_session",
      });
    }

    return updated;
  }

  async heartbeat(sessionId: string) {
    return this.prisma.devSession.update({
      where: { id: sessionId },
      data: { lastHeartbeat: new Date() },
    });
  }

  // ── Events ────────────────────────────────────────────────────────

  async postEvent(opts: {
    sessionId: string;
    eventType: DevSessionEventType;
    summary: string;
    detail?: any;
    actorUserId?: string;
  }) {
    const session = await this.prisma.devSession.findUnique({
      where: { id: opts.sessionId },
    });
    if (!session) throw new NotFoundException("Session not found");

    const event = await this.prisma.devSessionEvent.create({
      data: {
        sessionId: opts.sessionId,
        eventType: opts.eventType,
        summary: opts.summary,
        detail: opts.detail ?? undefined,
        actorUserId: opts.actorUserId,
      },
      include: { actorUser: { select: USER_SELECT } },
    });

    // Push for milestones
    if (opts.eventType === "MILESTONE") {
      await this.pushToSuperAdmins(session.companyId, {
        title: `Milestone: ${session.title}`,
        body: opts.summary,
        data: { type: "dev_session", sessionId: opts.sessionId },
        categoryId: "dev_session",
      });
    }

    return event;
  }

  async postComment(sessionId: string, userId: string, text: string) {
    return this.postEvent({
      sessionId,
      eventType: "COMMENT",
      summary: text,
      actorUserId: userId,
    });
  }

  async getEvents(sessionId: string, cursor?: string, take = 50) {
    return this.prisma.devSessionEvent.findMany({
      where: {
        sessionId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        actorUser: { select: USER_SELECT },
        approval: {
          select: {
            id: true,
            status: true,
            requestType: true,
            title: true,
            resolverComment: true,
            resolvedAt: true,
          },
        },
      },
    });
  }

  // ── Approval Requests ─────────────────────────────────────────────

  async createApprovalRequest(opts: {
    sessionId: string;
    requestType: DevApprovalRequestType;
    title: string;
    description?: string;
    detail?: any;
  }) {
    const session = await this.prisma.devSession.findUnique({
      where: { id: opts.sessionId },
    });
    if (!session) throw new NotFoundException("Session not found");

    // Create the event first
    const event = await this.prisma.devSessionEvent.create({
      data: {
        sessionId: opts.sessionId,
        eventType: "APPROVAL_REQUESTED",
        summary: `Approval needed: ${opts.title}`,
        detail: opts.detail ?? undefined,
      },
    });

    // Create the approval request linked to the event
    const approval = await this.prisma.devApprovalRequest.create({
      data: {
        sessionId: opts.sessionId,
        eventId: event.id,
        requestType: opts.requestType,
        title: opts.title,
        description: opts.description,
        detail: opts.detail ?? undefined,
      },
    });

    // Push notification with approve/reject actions
    await this.pushToSuperAdmins(session.companyId, {
      title: `Approval Required: ${opts.requestType.replace(/_/g, " ")}`,
      body: opts.title,
      data: {
        type: "dev_approval",
        sessionId: opts.sessionId,
        approvalId: approval.id,
      },
      categoryId: "dev_approval",
      sound: "default",
    });

    return { event, approval };
  }

  async resolveApproval(
    approvalId: string,
    userId: string,
    status: "APPROVED" | "REJECTED",
    comment?: string,
  ) {
    const approval = await this.prisma.devApprovalRequest.findUnique({
      where: { id: approvalId },
      include: { session: true },
    });
    if (!approval) throw new NotFoundException("Approval request not found");
    if (approval.status !== "PENDING") {
      throw new BadRequestException(
        `Approval already ${approval.status.toLowerCase()}`,
      );
    }

    // Check expiry
    const age = Date.now() - approval.createdAt.getTime();
    if (age > APPROVAL_TTL_MS) {
      await this.prisma.devApprovalRequest.update({
        where: { id: approvalId },
        data: { status: "EXPIRED" },
      });
      throw new BadRequestException("Approval request has expired");
    }

    const updated = await this.prisma.devApprovalRequest.update({
      where: { id: approvalId },
      data: {
        status,
        resolvedById: userId,
        resolvedAt: new Date(),
        resolverComment: comment,
      },
    });

    // Create resolution event
    await this.prisma.devSessionEvent.create({
      data: {
        sessionId: approval.sessionId,
        eventType: "APPROVAL_RESOLVED",
        summary: `${status === "APPROVED" ? "Approved" : "Rejected"}: ${approval.title}${comment ? ` — "${comment}"` : ""}`,
        detail: { approvalId, status, comment },
        actorUserId: userId,
      },
    });

    return updated;
  }

  async getApproval(approvalId: string) {
    const approval = await this.prisma.devApprovalRequest.findUnique({
      where: { id: approvalId },
      include: {
        session: { select: { id: true, title: true, sessionCode: true } },
        event: true,
        resolvedBy: { select: USER_SELECT },
      },
    });
    if (!approval) throw new NotFoundException("Approval not found");
    return approval;
  }

  // ── Push helper ───────────────────────────────────────────────────

  /**
   * Send a push notification to all SUPER_ADMIN users.
   * Finds users with globalRole=SUPER_ADMIN and sends to their devices.
   */
  private async pushToSuperAdmins(
    companyId: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      categoryId?: string;
      sound?: string;
    },
  ) {
    try {
      // Find all SUPER_ADMIN users
      const superAdmins = await this.prisma.user.findMany({
        where: { globalRole: "SUPER_ADMIN" },
        select: { id: true },
      });

      if (superAdmins.length === 0) return;

      await this.push.sendToUsers(
        superAdmins.map((u) => u.id),
        {
          title: payload.title,
          body: payload.body,
          data: payload.data,
          categoryId: payload.categoryId,
          sound: payload.sound ?? "default",
        },
      );
    } catch (err) {
      this.logger.warn("Failed to send push to SUPER_ADMINs", err);
    }
  }
}
