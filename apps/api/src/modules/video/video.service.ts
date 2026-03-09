import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { PushService, PushPayload } from "../notifications/push.service";
import { EmailService } from "../../common/email.service";
import { MessageBirdSmsClient } from "../../common/messagebird-sms.client";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

export interface SmartInvitee {
  userId?: string;
  phone?: string;
  email?: string;
  name?: string;
}

export interface InviteResult {
  name: string;
  channel: "push" | "sms" | "email" | "none";
  status: "sent" | "failed";
  error?: string;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private roomService: RoomServiceClient | null = null;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly livekitUrl: string | undefined;
  private readonly webBaseUrl: string | undefined;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly push: PushService,
    private readonly email: EmailService,
    private readonly sms: MessageBirdSmsClient,
  ) {
    this.apiKey = this.config.get<string>("LIVEKIT_API_KEY");
    this.apiSecret = this.config.get<string>("LIVEKIT_API_SECRET");
    this.livekitUrl = this.config.get<string>("LIVEKIT_URL");

    if (!this.apiKey || !this.apiSecret || !this.livekitUrl) {
      this.logger.warn(
        "LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL not set — video calling will be disabled.",
      );
      this.enabled = false;
      return;
    }

    this.enabled = true;
    this.webBaseUrl = this.config.get<string>("WEB_BASE_URL") || "https://ncc.nfsgrp.com";
    // RoomServiceClient uses the HTTP endpoint (replace wss:// with https://)
    const httpUrl = this.livekitUrl.replace("wss://", "https://");
    this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new NotFoundException("Video calling is not configured on this server.");
    }
  }

  /**
   * Create a new video room, optionally scoped to a project.
   * Returns the room record + a join token for the creator.
   */
  async createRoom(
    actor: AuthenticatedUser,
    opts: { projectId?: string; companyId: string; callMode?: "video" | "voice" | "radio" },
  ) {
    this.assertEnabled();
    const roomName = `nexus-${opts.companyId.slice(-6)}-${Date.now()}`;
    const callMode = opts.callMode ?? "video";

    // Scale max participants based on call mode
    const maxParticipants = callMode === "radio" ? 100 : callMode === "voice" ? 50 : 20;

    // Create the room on LiveKit
    await this.roomService!.createRoom({
      name: roomName,
      emptyTimeout: 300, // auto-close after 5 min if empty
      maxParticipants,
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
    this.assertEnabled();
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
    this.assertEnabled();
    const room = await this.prisma.videoRoom.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // Close the room on LiveKit
    try {
      await this.roomService!.deleteRoom(room.livekitRoomName);
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
      sound: "nexus_ring.wav",
      channelId: "video-calls",
      categoryId: "video_call",
    };

    const result = await this.push.sendToUsers(userIds, payload);
    return { invited: userIds.length, ...result };
  }

  // ── Guest token (Phase 3) ──────────────────────────────────────

  /**
   * Generate a short-lived LiveKit token for a non-Nexus guest.
   * Records a VideoRoomParticipant with userId = null.
   */
  async createGuestToken(
    roomId: string,
    guestName: string,
    actor: AuthenticatedUser,
  ) {
    this.assertEnabled();
    if (!guestName?.trim()) {
      throw new BadRequestException("guestName is required");
    }

    const room = await this.prisma.videoRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== "ACTIVE") {
      throw new NotFoundException("Room not found or already ended");
    }
    // Only members of the same company can generate guest links
    if (room.companyId !== actor.companyId) {
      throw new NotFoundException("Room not found or already ended");
    }

    const identity = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity,
      name: guestName.trim(),
      ttl: "1h",
    });
    token.addGrant({
      room: room.livekitRoomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    const jwt = await token.toJwt();

    // Record guest participant
    await this.prisma.videoRoomParticipant.create({
      data: {
        roomId: room.id,
        guestName: guestName.trim(),
      },
    });

    await this.prisma.videoRoom.update({
      where: { id: room.id },
      data: { participantCount: { increment: 1 } },
    });

    const joinUrl = `${this.webBaseUrl}/call/join?token=${encodeURIComponent(jwt)}&wsUrl=${encodeURIComponent(this.livekitUrl!)}` ;

    this.logger.log(`Guest token created for "${guestName}" in room ${room.id}`);

    return { token: jwt, joinUrl, expiresIn: 3600 };
  }

  // ── Smart invite routing (Phase 4) ────────────────────────────

  /**
   * For each invitee, determine the best delivery channel and send an invite.
   * Returns per-invitee delivery status.
   */
  async smartInvite(
    roomId: string,
    invitees: SmartInvitee[],
    actor: AuthenticatedUser,
  ): Promise<InviteResult[]> {
    this.assertEnabled();
    const room = await this.prisma.videoRoom.findUnique({
      where: { id: roomId },
      include: { project: { select: { name: true } } },
    });
    if (!room || room.status !== "ACTIVE") {
      throw new NotFoundException("Room not found or already ended");
    }
    if (room.companyId !== actor.companyId) {
      throw new NotFoundException("Room not found or already ended");
    }

    // Caller display name
    const caller = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const callerName =
      [caller?.firstName, caller?.lastName].filter(Boolean).join(" ") ||
      caller?.email ||
      "Someone";

    const results: InviteResult[] = [];

    for (const invitee of invitees) {
      const displayName = invitee.name || invitee.email || invitee.phone || "Unknown";

      try {
        // ── Has userId → try push first ──
        if (invitee.userId) {
          const pushResult = await this.tryPushInvite(
            room,
            invitee.userId,
            callerName,
          );
          if (pushResult) {
            results.push({ name: displayName, channel: "push", status: "sent" });
            continue;
          }

          // No active push token → fall back to email
          const user = await this.prisma.user.findUnique({
            where: { id: invitee.userId },
            select: { email: true, firstName: true, lastName: true },
          });
          if (user?.email) {
            const guestLink = await this.createGuestToken(
              roomId,
              [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
              actor,
            );
            await this.email.sendCallInvite({
              toEmail: user.email,
              callerName,
              projectName: room.project?.name,
              joinUrl: guestLink.joinUrl,
            });
            results.push({ name: displayName, channel: "email", status: "sent" });
            continue;
          }
        }

        // ── Has phone → send SMS ──
        if (invitee.phone) {
          const guestLink = await this.createGuestToken(
            roomId,
            invitee.name || invitee.phone,
            actor,
          );
          const projectSuffix = room.project?.name
            ? ` for ${room.project.name}`
            : "";
          await this.sms.sendSms(
            invitee.phone,
            `📹 ${callerName} is inviting you to a video call${projectSuffix}. Join here: ${guestLink.joinUrl}`,
          );
          results.push({ name: displayName, channel: "sms", status: "sent" });
          continue;
        }

        // ── Has email → send email ──
        if (invitee.email) {
          const guestLink = await this.createGuestToken(
            roomId,
            invitee.name || invitee.email,
            actor,
          );
          await this.email.sendCallInvite({
            toEmail: invitee.email,
            callerName,
            projectName: room.project?.name,
            joinUrl: guestLink.joinUrl,
          });
          results.push({ name: displayName, channel: "email", status: "sent" });
          continue;
        }

        // No delivery channel available
        results.push({
          name: displayName,
          channel: "none",
          status: "failed",
          error: "No phone, email, or userId provided",
        });
      } catch (err: any) {
        this.logger.error(`Smart invite failed for ${displayName}: ${err?.message}`);
        results.push({
          name: displayName,
          channel: "none",
          status: "failed",
          error: err?.message || "Unknown error",
        });
      }
    }

    return results;
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Attempt to send a push notification to a user.
   * Returns true if the user had an active push token and the send succeeded.
   */
  private async tryPushInvite(
    room: { id: string; projectId: string | null; project?: { name: string } | null; livekitRoomName: string },
    userId: string,
    callerName: string,
  ): Promise<boolean> {
    // Check if user has an active push token
    const activeToken = await this.prisma.devicePushToken.findFirst({
      where: { userId, active: true },
    });
    if (!activeToken) return false;

    const payload: PushPayload = {
      title: `📹 Video Call — ${room.project?.name ?? "Nexus"}`,
      body: `${callerName} is calling you`,
      data: {
        type: "video_call",
        roomId: room.id,
        projectId: room.projectId,
      },
      sound: "nexus_ring.wav",
      channelId: "video-calls",
      categoryId: "video_call",
    };

    try {
      const result = await this.push.sendToUsers([userId], payload);
      if (result.sent === 0) {
        this.logger.warn(`Push invite failed for user ${userId}: sent=0, failed=${result.failed}`);
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.warn(`Push invite error for user ${userId}: ${err?.message}`);
      return false;
    }
  }

  /**
   * Get the user's most frequently called contacts.
   * Aggregates VideoRoomParticipant data to find co-participants sorted by call volume.
   */
  async getFrequentContacts(actor: AuthenticatedUser, limit = 10) {
    // Find all rooms the user participated in
    const myParticipations = await this.prisma.videoRoomParticipant.findMany({
      where: { userId: actor.userId },
      select: { roomId: true },
    });

    const roomIds = myParticipations.map(p => p.roomId);
    if (!roomIds.length) return [];

    // Find all other participants in those rooms
    const coParticipants = await this.prisma.videoRoomParticipant.findMany({
      where: {
        roomId: { in: roomIds },
        userId: { not: actor.userId },
      },
      select: {
        userId: true,
        guestName: true,
      },
    });

    // Count occurrences per userId
    const countMap = new Map<string, number>();
    const guestMap = new Map<string, { count: number; name: string }>();

    for (const p of coParticipants) {
      if (p.userId) {
        countMap.set(p.userId, (countMap.get(p.userId) ?? 0) + 1);
      } else if (p.guestName) {
        const key = `guest:${p.guestName}`;
        const existing = guestMap.get(key);
        guestMap.set(key, {
          count: (existing?.count ?? 0) + 1,
          name: p.guestName,
        });
      }
    }

    // Resolve user details
    const userIds = Array.from(countMap.keys());
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];

    const userMap = new Map(users.map(u => [u.id, u]));

    // Build result list
    const contacts: {
      userId?: string;
      guestName?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      callCount: number;
    }[] = [];

    for (const [userId, count] of countMap) {
      const user = userMap.get(userId);
      contacts.push({
        userId,
        email: user?.email,
        firstName: user?.firstName ?? undefined,
        lastName: user?.lastName ?? undefined,
        callCount: count,
      });
    }

    for (const [, entry] of guestMap) {
      contacts.push({
        guestName: entry.name,
        callCount: entry.count,
      });
    }

    // Sort by call count descending, take top N
    contacts.sort((a, b) => b.callCount - a.callCount);
    return contacts.slice(0, limit);
  }

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
