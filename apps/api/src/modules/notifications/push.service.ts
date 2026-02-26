import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import Expo, { type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { $Enums } from "@prisma/client";

const expo = new Expo();

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Optional badge count (iOS) */
  badge?: number;
  /** Optional sound name */
  sound?: "default" | null;
  /** Optional channel (Android) */
  channelId?: string;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Device token management ──────────────────────────────────────

  /**
   * Register or re-activate an Expo push token for the current user.
   */
  async registerToken(userId: string, token: string, platform: "IOS" | "ANDROID") {
    if (!Expo.isExpoPushToken(token)) {
      throw new Error(`Invalid Expo push token: ${token}`);
    }

    return this.prisma.devicePushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: platform as $Enums.DevicePlatform,
        active: true,
      },
      update: {
        userId, // token may have been reassigned to a different user
        active: true,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Deactivate a push token (e.g. on logout).
   */
  async deactivateToken(userId: string, token: string) {
    const existing = await this.prisma.devicePushToken.findUnique({ where: { token } });
    if (!existing || existing.userId !== userId) return null;

    return this.prisma.devicePushToken.update({
      where: { token },
      data: { active: false },
    });
  }

  // ── Sending push notifications ───────────────────────────────────

  /**
   * Send a push notification to one or more users.
   */
  async sendToUsers(userIds: string[], payload: PushPayload) {
    // Look up all active tokens for the target users
    const tokens = await this.prisma.devicePushToken.findMany({
      where: {
        userId: { in: userIds },
        active: true,
      },
    });

    if (tokens.length === 0) {
      this.logger.debug(`No active push tokens for users: ${userIds.join(", ")}`);
      return { sent: 0, failed: 0 };
    }

    // Build messages
    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data as any,
      sound: payload.sound ?? "default",
      badge: payload.badge,
      channelId: payload.channelId,
    }));

    // Chunk and send
    const chunks = expo.chunkPushNotifications(messages);
    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    for (const chunk of chunks) {
      try {
        const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status === "ok") {
            sent++;
          } else {
            failed++;
            const failedToken = (chunk[i] as any).to as string;
            const errorDetail = ticket.status === "error"
              ? `${ticket.details?.error ?? "unknown"}: ${ticket.message ?? ""}`
              : "unknown status";
            this.logger.warn(`Push failed for token ${failedToken.slice(0, 25)}...: ${errorDetail}`);
            // If device is not registered, mark token as inactive
            if (
              ticket.status === "error" &&
              ticket.details?.error === "DeviceNotRegistered"
            ) {
              invalidTokens.push(failedToken);
            }
          }
        }
      } catch (err) {
        this.logger.error("Failed to send push notification chunk", err);
        failed += chunk.length;
      }
    }

    // Deactivate invalid tokens
    if (invalidTokens.length > 0) {
      await this.prisma.devicePushToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { active: false },
      });
      this.logger.warn(`Deactivated ${invalidTokens.length} invalid push tokens`);
    }

    this.logger.log(`Push sent: ${sent}, failed: ${failed} (to ${tokens.length} devices)`);
    return { sent, failed };
  }

  /**
   * Send a push notification to all members of a project.
   * Optionally exclude a specific user (e.g. the creator of the log).
   */
  async sendToProjectMembers(
    projectId: string,
    payload: PushPayload,
    excludeUserId?: string,
  ) {
    // Find all users who are members of this project
    const memberships = await this.prisma.projectMembership.findMany({
      where: { projectId },
      select: { userId: true },
    });

    let userIds = memberships.map((m) => m.userId);
    if (excludeUserId) {
      userIds = userIds.filter((id) => id !== excludeUserId);
    }

    if (userIds.length === 0) return { sent: 0, failed: 0 };

    return this.sendToUsers(userIds, payload);
  }
}
