import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { SupportTicketStatus, SupportSessionStatus, SupportSessionMode, SupportSessionEventType } from "@prisma/client";
import * as crypto from "node:crypto";

// ── Helpers ──────────────────────────────────────────────────────────

/** Generate a 6-character uppercase alphanumeric session code. */
function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/0/1 to avoid confusion
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Session code TTL: 30 minutes of inactivity. */
const SESSION_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class SupportSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Tickets ──────────────────────────────────────────────────────

  async createTicket(opts: {
    companyId: string;
    createdById: string;
    subject: string;
    description?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  }) {
    return this.prisma.supportTicket.create({
      data: {
        companyId: opts.companyId,
        createdById: opts.createdById,
        subject: opts.subject,
        description: opts.description,
        priority: opts.priority ?? "MEDIUM",
      },
      include: { createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
  }

  async listTickets(opts: {
    companyId: string;
    userId: string;
    role: "client" | "agent";
    status?: SupportTicketStatus;
  }) {
    const where: any = { companyId: opts.companyId };
    if (opts.status) where.status = opts.status;

    if (opts.role === "client") {
      where.createdById = opts.userId;
    } else {
      // Agents see tickets assigned to them or unassigned
      where.OR = [
        { assignedToId: opts.userId },
        { assignedToId: null },
      ];
    }

    return this.prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { sessions: true } },
      },
    });
  }

  async getTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, sessionCode: true, status: true, mode: true, startedAt: true, endedAt: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async updateTicket(ticketId: string, data: {
    status?: SupportTicketStatus;
    assignedToId?: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  }) {
    const update: any = { ...data };
    if (data.status === "RESOLVED") {
      update.resolvedAt = new Date();
    }
    if (data.status === "IN_PROGRESS" && !data.assignedToId) {
      // Auto-assign not handled here; caller should provide assignedToId
    }
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: update,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  // ── Sessions ─────────────────────────────────────────────────────

  async createSession(ticketId: string, clientUserId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status !== "OPEN" && ticket.status !== "IN_PROGRESS") {
      throw new BadRequestException("Cannot create a session for a resolved/closed ticket");
    }

    // Ensure the requesting user is the ticket creator or assigned agent
    if (ticket.createdById !== clientUserId && ticket.assignedToId !== clientUserId) {
      throw new ForbiddenException("You are not a participant of this ticket");
    }

    // End any existing active sessions for this ticket
    await this.prisma.supportSession.updateMany({
      where: { ticketId, status: { in: ["PENDING", "ACTIVE"] } },
      data: { status: "ENDED", endedAt: new Date() },
    });

    // Generate a unique session code
    let sessionCode: string;
    let attempts = 0;
    do {
      sessionCode = generateSessionCode();
      const existing = await this.prisma.supportSession.findUnique({ where: { sessionCode } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      throw new BadRequestException("Failed to generate unique session code");
    }

    const session = await this.prisma.supportSession.create({
      data: {
        ticketId,
        sessionCode,
        clientUserId,
        agentUserId: ticket.assignedToId,
        lastHeartbeat: new Date(),
      },
    });

    // Audit event
    await this.prisma.supportSessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: "CREATED",
        actorUserId: clientUserId,
      },
    });

    return session;
  }

  async getSessionByCode(code: string) {
    const session = await this.prisma.supportSession.findUnique({
      where: { sessionCode: code.toUpperCase() },
      include: {
        ticket: { select: { id: true, subject: true, companyId: true, status: true } },
        clientUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        agentUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!session) throw new NotFoundException("Session not found");

    // Check if expired
    if (session.status !== "ENDED" && session.lastHeartbeat) {
      const age = Date.now() - session.lastHeartbeat.getTime();
      if (age > SESSION_TTL_MS) {
        await this.endSession(session.id, undefined);
        throw new BadRequestException("Session has expired");
      }
    }

    return session;
  }

  async joinSession(sessionId: string, userId: string, role: "client" | "agent", ip?: string) {
    const session = await this.prisma.supportSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (session.status === "ENDED") throw new BadRequestException("Session has ended");

    const update: any = { lastHeartbeat: new Date() };
    if (role === "client") {
      update.clientIp = ip;
    } else {
      update.agentUserId = userId;
      update.agentIp = ip;
    }

    // If both parties present, mark as active
    if (role === "agent" && session.clientUserId && session.status === "PENDING") {
      update.status = "ACTIVE";
      update.startedAt = new Date();
    }

    await this.prisma.supportSession.update({ where: { id: sessionId }, data: update });

    // Audit event
    await this.prisma.supportSessionEvent.create({
      data: {
        sessionId,
        eventType: role === "client" ? "CLIENT_JOINED" : "AGENT_JOINED",
        actorUserId: userId,
        metadata: ip ? { ip } : undefined,
      },
    });
  }

  async updateSessionMode(sessionId: string, mode: SupportSessionMode, actorUserId: string) {
    const session = await this.prisma.supportSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException("Session not found");
    if (session.status !== "ACTIVE") throw new BadRequestException("Session is not active");

    await this.prisma.supportSession.update({
      where: { id: sessionId },
      data: { mode },
    });

    const eventType: SupportSessionEventType =
      mode === "REMOTE_CONTROL" ? "CONTROL_GRANTED" : "CONTROL_REVOKED";

    await this.prisma.supportSessionEvent.create({
      data: { sessionId, eventType, actorUserId },
    });
  }

  async endSession(sessionId: string, actorUserId: string | undefined) {
    await this.prisma.supportSession.update({
      where: { id: sessionId },
      data: { status: "ENDED", endedAt: new Date() },
    });

    await this.prisma.supportSessionEvent.create({
      data: { sessionId, eventType: "ENDED", actorUserId },
    });
  }

  async heartbeat(sessionId: string) {
    await this.prisma.supportSession.update({
      where: { id: sessionId },
      data: { lastHeartbeat: new Date() },
    });
  }

  // ── TURN credentials ─────────────────────────────────────────────

  /**
   * Generate time-limited TURN credentials using the shared-secret mechanism
   * (RFC 5766 long-term credentials). coturn validates these without a DB lookup.
   */
  getTurnCredentials(userId: string) {
    const secret = this.config.get<string>("TURN_SECRET") || "nexus-turn-dev-secret";
    const ttl = 86400; // 24 hours
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:${userId}`;
    const hmac = crypto.createHmac("sha1", secret);
    hmac.update(username);
    const credential = hmac.digest("base64");

    const turnHost = this.config.get<string>("TURN_HOST") || "localhost";
    const turnPort = this.config.get<string>("TURN_PORT") || "3478";

    return {
      iceServers: [
        { urls: `stun:${turnHost}:${turnPort}` },
        {
          urls: [
            `turn:${turnHost}:${turnPort}?transport=udp`,
            `turn:${turnHost}:${turnPort}?transport=tcp`,
          ],
          username,
          credential,
        },
      ],
      ttl,
    };
  }

  // ── Downloads ──────────────────────────────────────────────────────

  /**
   * Return a download URL for the thin "Nexus Support" client.
   * Installers are stored in MinIO under the `nexus-support-installers` bucket.
   */
  getDownloadUrl(platform: string) {
    const platformMap: Record<string, { file: string; label: string }> = {
      macos: { file: "nexus-support.dmg", label: "macOS" },
      windows: { file: "nexus-support.msi", label: "Windows" },
      linux: { file: "nexus-support.AppImage", label: "Linux" },
    };

    const entry = platformMap[platform.toLowerCase()];
    if (!entry) {
      throw new BadRequestException(
        `Unknown platform: ${platform}. Use one of: ${Object.keys(platformMap).join(", ")}`,
      );
    }

    const minioEndpoint = this.config.get<string>("MINIO_ENDPOINT") || "localhost";
    const minioPort = this.config.get<string>("MINIO_PORT") || "9000";
    const useSsl = this.config.get<string>("MINIO_USE_SSL") === "true";
    const protocol = useSsl ? "https" : "http";
    const bucket = "nexus-support-installers";

    return {
      platform: entry.label,
      filename: entry.file,
      url: `${protocol}://${minioEndpoint}:${minioPort}/${bucket}/${entry.file}`,
    };
  }
}
