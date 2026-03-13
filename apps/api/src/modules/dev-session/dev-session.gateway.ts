import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import * as jwt from "jsonwebtoken";
import { DevSessionService } from "./dev-session.service";

/**
 * Real-time gateway for Session Mirror (dev oversight from mobile).
 *
 * Namespace: /dev-session
 * Transport: WebSocket (Socket.IO)
 *
 * SECURITY: Only SUPER_ADMIN users can connect. JWT is validated on
 * connection and the globalRole is checked. Non-SUPER_ADMIN sockets
 * are immediately disconnected.
 */
@WebSocketGateway({
  namespace: "/dev-session",
  cors: { origin: true, credentials: true },
})
export class DevSessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DevSessionGateway.name);

  /** socket.id → { userId, sessionId } */
  private connections = new Map<
    string,
    { userId: string; sessionId?: string }
  >();

  constructor(private readonly service: DevSessionService) {}

  // ── Lifecycle ─────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    // Validate JWT from auth query param or Authorization header
    const token =
      (client.handshake.query?.token as string) ||
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      this.logger.warn(`Connection rejected: no token (socket=${client.id})`);
      client.disconnect(true);
      return;
    }

    try {
      const secret = process.env.JWT_ACCESS_SECRET || "change-me-access";
      const payload = jwt.verify(token, secret) as any;

      // SUPER_ADMIN check
      if (payload.globalRole !== "SUPER_ADMIN") {
        this.logger.warn(
          `Connection rejected: not SUPER_ADMIN (socket=${client.id}, role=${payload.globalRole})`,
        );
        client.disconnect(true);
        return;
      }

      this.connections.set(client.id, { userId: payload.sub });
      this.logger.debug(
        `SUPER_ADMIN connected: ${payload.sub} (socket=${client.id})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `Connection rejected: invalid JWT (socket=${client.id}): ${err.message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const info = this.connections.get(client.id);
    if (info?.sessionId) {
      client.leave(info.sessionId);
    }
    this.connections.delete(client.id);
  }

  // ── Events ────────────────────────────────────────────────────────

  @SubscribeMessage("join-session")
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId?: string; code?: string },
  ) {
    const info = this.connections.get(client.id);
    if (!info) return { error: "Not authenticated" };

    try {
      let sessionId = payload.sessionId;

      if (!sessionId && payload.code) {
        const session = await this.service.getSessionByCode(payload.code);
        sessionId = session.id;
      }

      if (!sessionId) return { error: "Session ID or code required" };

      // Leave previous session room if any
      if (info.sessionId) {
        client.leave(info.sessionId);
      }

      // Join new session room
      client.join(sessionId);
      info.sessionId = sessionId;

      return { ok: true, sessionId };
    } catch (err: any) {
      return { error: err.message || "Failed to join session" };
    }
  }

  @SubscribeMessage("comment")
  async handleComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { text: string },
  ) {
    const info = this.connections.get(client.id);
    if (!info || !info.sessionId) return { error: "Not in a session" };

    const event = await this.service.postComment(
      info.sessionId,
      info.userId,
      payload.text,
    );

    // Broadcast to all in the session room
    client.to(info.sessionId).emit("session-event", event);

    return { ok: true, event };
  }

  @SubscribeMessage("approval-response")
  async handleApprovalResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      approvalId: string;
      status: "APPROVED" | "REJECTED";
      comment?: string;
    },
  ) {
    const info = this.connections.get(client.id);
    if (!info) return { error: "Not authenticated" };

    const result = await this.service.resolveApproval(
      payload.approvalId,
      info.userId,
      payload.status,
      payload.comment,
    );

    // Broadcast to session room
    if (info.sessionId) {
      this.server.to(info.sessionId).emit("approval-response", {
        approvalId: payload.approvalId,
        status: payload.status,
        comment: payload.comment,
      });
    }

    return { ok: true, result };
  }

  @SubscribeMessage("heartbeat")
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const info = this.connections.get(client.id);
    if (!info?.sessionId) return;
    await this.service.heartbeat(info.sessionId);
  }

  // ── Server-side emit helpers (called by controller) ───────────────

  /**
   * Emit an event to all clients watching a specific session.
   * Called by the controller after REST mutations to push real-time updates.
   */
  emitSessionEvent(sessionId: string, data: any) {
    if (!this.server) return;
    this.server.to(sessionId).emit(data.type || "session-event", data);
  }
}
