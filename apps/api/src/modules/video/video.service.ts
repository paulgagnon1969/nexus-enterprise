import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { PushService, PushPayload } from "../notifications/push.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly roomService: RoomServiceClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly livekitUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly push: PushService,
  ) {
    this.apiKey = this.config.getOrThrow<string>("LIVEKIT_API_KEY");
    this.apiSecret = this.config.getOrThrow<string>("LIVEKIT_API_SECRET");
    this.livekitUrl = this.config.getOrThrow<string>("LIVEKIT_URL");

    // RoomServiceClient uses the HTTP endpoint (replace wss:// with https://)
    const httpUrl = this.livekitUrl.replace("wss://", "https://");
    this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Create a new video room, optionally scoped to a project.
   * Returns the room record + a join token for the creator.
   */
  async createRoom(
    actor: AuthenticatedUser,
    opts: { projectId?: string; companyId: string },
  ) {
    const roomName = `nexus-${opts.companyId.slice(-6)}-${Date.now()}`;

    // Create the room on LiveKit
    await this.roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // auto-close after 5 min if empty
      maxParticipants: 20,
    });

    // Persist in our DB
    const room = await this.prisma.videoRoom.create({
      data: {
        companyId: opts.companyId,
        projectId: opts.projectId ?? null,
        createdById: actor.userId,
        livekitRoomName: roomName,
      },
    });

    // Generate a join token for the creator
    const token = await this.createParticipantToken(roomName, actor);

    this.logger.log(`Room ${room.id} created by ${actor.userId} (livekit: ${roomName})`);

    return {
      room,
      token,
      livekitUrl: this.livekitUrl,
    };
  }

  /**
   * Join an existing room. Returns a participant token.
   */
  async joinRoom(roomId: string, actor: AuthenticatedUser) {
    const room = await this.prisma.videoRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== "ACTIVE") {
      throw new NotFoundException("Room not found or already ended");
    }

    // Record participation
    await this.prisma.videoRoomParticipant.create({
      data: {
        roomId: room.id,
        userId: actor.userId,
      },
    });

    // Bump participant count
    await this.prisma.videoRoom.update({
      where: { id: room.id },
      data: { participantCount: { increment: 1 } },
    });

    const token = await this.createParticipantToken(room.livekitRoomName, actor);

    this.logger.log(`User ${actor.userId} joined room ${room.id}`);

    return {
      room,
      token,
      livekitUrl: this.livekitUrl,
    };
  }

  /**
   * End a room. Marks it as ENDED and closes the LiveKit room.
   */
  async endRoom(roomId: string, actor: AuthenticatedUser) {
    const room = await this.prisma.videoRoom.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // Close the room on LiveKit
    try {
      await this.roomService.deleteRoom(room.livekitRoomName);
    } catch (err: any) {
      this.logger.warn(`Failed to delete LiveKit room ${room.livekitRoomName}: ${err?.message}`);
    }

    // Mark all participants as left
    await this.prisma.videoRoomParticipant.updateMany({
      where: { roomId: room.id, leftAt: null },
      data: { leftAt: new Date() },
    });

    const updated = await this.prisma.videoRoom.update({
      where: { id: room.id },
      data: { status: "ENDED", endedAt: new Date() },
    });

    this.logger.log(`Room ${room.id} ended by ${actor.userId}`);
    return updated;
  }

  /**
   * List active rooms the user can see (all rooms in their company).
   */
  async listActiveRooms(companyId: string) {
    return this.prisma.videoRoom.findMany({
      where: { companyId, status: "ACTIVE" },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { startedAt: "desc" },
    });
  }

  /**
   * Send a push notification to invite users to a call.
   */
  async inviteToRoom(
    roomId: string,
    userIds: string[],
    actor: AuthenticatedUser,
  ) {
    const room = await this.prisma.videoRoom.findUnique({
      where: { id: roomId },
      include: { project: { select: { name: true } } },
    });
    if (!room || room.status !== "ACTIVE") {
      throw new NotFoundException("Room not found or already ended");
    }

    // Look up caller name
    const caller = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const callerName = [caller?.firstName, caller?.lastName].filter(Boolean).join(" ") || caller?.email || "Someone";

    const payload: PushPayload = {
      title: `📹 Video Call — ${room.project?.name ?? "Nexus"}`,
      body: `${callerName} is calling you`,
      data: {
        type: "video_call",
        roomId: room.id,
        projectId: room.projectId,
      },
      sound: "default",
    };

    const result = await this.push.sendToUsers(userIds, payload);
    return { invited: userIds.length, ...result };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async createParticipantToken(
    roomName: string,
    actor: AuthenticatedUser,
  ): Promise<string> {
    // Look up display name
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const identity = actor.userId;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || identity;

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      name,
      ttl: "4h",
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return await token.toJwt();
  }
}
