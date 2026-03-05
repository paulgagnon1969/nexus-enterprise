import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { SupportSessionService } from "./support-session.service";

/**
 * Real-time signaling gateway for WebRTC support sessions.
 *
 * Namespace: /support
 * Transport: WebSocket (Socket.IO)
 *
 * Flow:
 *  1. Client or agent connects and emits `join-session` with { code, role }.
 *  2. Gateway validates the session code, puts the socket in a room keyed by sessionId.
 *  3. Both sides exchange SDP offers/answers via `signal` events.
 *  4. ICE candidates are relayed via `ice-candidate`.
 *  5. Either side can emit `end-session` to tear down the connection.
 */
@WebSocketGateway({
  namespace: "/support",
  cors: { origin: true, credentials: true },
})
export class SupportSessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  /** socket.id → { sessionId, userId, role } */
  private connections = new Map<string, { sessionId: string; userId: string; role: "client" | "agent" }>();

  constructor(private readonly supportService: SupportSessionService) {}

  // ── Lifecycle ─────────────────────────────────────────────────────

  handleConnection(client: Socket) {
    // No-op: authentication and room join happen on `join-session`
  }

  handleDisconnect(client: Socket) {
    const info = this.connections.get(client.id);
    if (info) {
      // Notify the other party
      client.to(info.sessionId).emit("peer-disconnected", { role: info.role });
      this.connections.delete(client.id);
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  @SubscribeMessage("join-session")
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { code: string; userId: string; role: "client" | "agent" },
  ) {
    try {
      const session = await this.supportService.getSessionByCode(payload.code);

      // Basic authorization: client must match clientUserId, agent must match agentUserId
      if (payload.role === "client" && session.clientUser?.id !== payload.userId) {
        return { error: "Unauthorized: not the session client" };
      }
      if (payload.role === "agent" && session.agentUser?.id !== payload.userId) {
        // Allow agent to join even if not pre-assigned (self-assign)
        if (session.agentUser) {
          return { error: "Unauthorized: not the assigned agent" };
        }
      }

      // Track this connection
      this.connections.set(client.id, {
        sessionId: session.id,
        userId: payload.userId,
        role: payload.role,
      });

      // Join the Socket.IO room for this session
      client.join(session.id);

      // If agent is joining, mark session as ACTIVE
      if (payload.role === "agent" && session.status === "PENDING") {
        await this.supportService.joinSession(session.id, payload.userId, "agent");
      }

      // Notify the other party
      client.to(session.id).emit("peer-joined", { role: payload.role, userId: payload.userId });

      return {
        ok: true,
        sessionId: session.id,
        mode: session.mode,
        peers: this.getRoomPeers(session.id, client.id),
      };
    } catch (err: any) {
      return { error: err.message || "Failed to join session" };
    }
  }

  @SubscribeMessage("signal")
  handleSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { type: "offer" | "answer"; sdp: string },
  ) {
    const info = this.connections.get(client.id);
    if (!info) return { error: "Not in a session" };

    // Relay SDP to the other party in the room
    client.to(info.sessionId).emit("signal", {
      type: payload.type,
      sdp: payload.sdp,
      from: info.role,
    });
  }

  @SubscribeMessage("ice-candidate")
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { candidate: Record<string, unknown> },
  ) {
    const info = this.connections.get(client.id);
    if (!info) return { error: "Not in a session" };

    client.to(info.sessionId).emit("ice-candidate", {
      candidate: payload.candidate,
      from: info.role,
    });
  }

  @SubscribeMessage("end-session")
  async handleEndSession(@ConnectedSocket() client: Socket) {
    const info = this.connections.get(client.id);
    if (!info) return { error: "Not in a session" };

    try {
      await this.supportService.endSession(info.sessionId, info.userId);
    } catch {
      // Session may already be ended — fine
    }

    // Notify everyone in the room
    this.server.to(info.sessionId).emit("session-ended", { endedBy: info.role });

    // Clean up all sockets in this room
    const sockets = await this.server.in(info.sessionId).fetchSockets();
    for (const s of sockets) {
      s.leave(info.sessionId);
      this.connections.delete(s.id);
    }
  }

  @SubscribeMessage("heartbeat")
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const info = this.connections.get(client.id);
    if (!info) return;

    await this.supportService.heartbeat(info.sessionId);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private getRoomPeers(sessionId: string, excludeSocketId: string): string[] {
    const peers: string[] = [];
    for (const [socketId, info] of this.connections) {
      if (info.sessionId === sessionId && socketId !== excludeSocketId) {
        peers.push(info.role);
      }
    }
    return peers;
  }
}
