import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import { EmailService } from "../../common/email.service";
import { SecurityEventType, SecurityEventSeverity } from "@prisma/client";
import { randomInt } from "crypto";

const CHALLENGE_TTL_SECONDS = 600; // 10 minutes
const TRUST_DURATION_DAYS = 90;
const SUSPICIOUS_DEVICE_THRESHOLD = 3; // 3+ new devices in 24h = suspicious
const MAX_CHALLENGE_ATTEMPTS = 5; // lockout after 5 bad codes

@Injectable()
export class DeviceTrustService {
  private readonly logger = new Logger(DeviceTrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: EmailService,
  ) {}

  // ── Evaluate whether a device is trusted ────────────────────────

  async evaluateDevice(
    userId: string,
    companyId: string,
    fingerprint: string | undefined,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<{ trusted: boolean; deviceId?: string; requiresChallenge: boolean }> {
    // No fingerprint provided (e.g. web login) — skip challenge
    if (!fingerprint) {
      return { trusted: true, requiresChallenge: false };
    }

    const device = await this.prisma.userDevice.findUnique({
      where: {
        UserDevice_user_device_key: { userId, deviceId: fingerprint },
      },
    });

    if (device && device.isTrusted && !device.isRevoked) {
      // Check if trust has expired
      if (device.trustExpiresAt && device.trustExpiresAt < new Date()) {
        this.logger.log(`Trust expired for device ${fingerprint} (user ${userId})`);
        return { trusted: false, deviceId: device.id, requiresChallenge: true };
      }

      // Trusted — update lastSeenAt and extend trust window
      const newExpiry = new Date(Date.now() + TRUST_DURATION_DAYS * 24 * 60 * 60 * 1000);
      await this.prisma.userDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date(), trustExpiresAt: newExpiry },
      });

      return { trusted: true, deviceId: device.id, requiresChallenge: false };
    }

    // Unrecognized or untrusted device — log security event
    await this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.UNRECOGNIZED_DEVICE_LOGIN,
      deviceFingerprint: fingerprint,
      ipAddress: ip,
      userAgent,
      severity: SecurityEventSeverity.MEDIUM,
      metadata: { companyId },
    });

    return { trusted: false, deviceId: device?.id, requiresChallenge: true };
  }

  // ── Issue a 6-digit email challenge ─────────────────────────────

  async issueDeviceChallenge(
    userId: string,
    email: string,
    fingerprint: string,
    devicePlatform?: string,
    deviceName?: string,
  ): Promise<{ challengeToken: string }> {
    const code = String(randomInt(100000, 999999)); // 6-digit code
    const redisKey = `devchallenge:${userId}:${fingerprint}`;
    const attemptsKey = `devchallenge_attempts:${userId}:${fingerprint}`;

    const redisClient = this.redis.getClient();

    // Store challenge code
    await redisClient.setex(
      redisKey,
      CHALLENGE_TTL_SECONDS,
      JSON.stringify({ code, email, devicePlatform, deviceName }),
    );

    // Reset attempt counter
    await redisClient.setex(attemptsKey, CHALLENGE_TTL_SECONDS, "0");

    // Send verification email
    await this.email.sendDeviceVerificationCode({
      toEmail: email,
      code,
      devicePlatform: devicePlatform || "Unknown device",
      deviceName: deviceName || undefined,
    });

    this.logger.log(`Device challenge issued for user ${userId} (${email})`);

    // Return an opaque token the client can reference — the fingerprint itself
    // is the lookup key (client already has it), so we just confirm issuance.
    return { challengeToken: fingerprint };
  }

  // ── Verify the challenge code ───────────────────────────────────

  async verifyDeviceChallenge(
    userId: string,
    companyId: string,
    fingerprint: string,
    code: string,
    deviceMeta: { platform?: string; deviceName?: string },
  ): Promise<{ valid: boolean; reason?: string }> {
    const redisClient = this.redis.getClient();
    const redisKey = `devchallenge:${userId}:${fingerprint}`;
    const attemptsKey = `devchallenge_attempts:${userId}:${fingerprint}`;

    // Check lockout
    const attempts = parseInt(await redisClient.get(attemptsKey) || "0", 10);
    if (attempts >= MAX_CHALLENGE_ATTEMPTS) {
      await this.logSecurityEvent({
        userId,
        eventType: SecurityEventType.DEVICE_CHALLENGE_FAILED,
        deviceFingerprint: fingerprint,
        severity: SecurityEventSeverity.HIGH,
        metadata: { reason: "max_attempts_exceeded", attempts },
      });
      return { valid: false, reason: "Too many attempts. Please request a new code." };
    }

    const raw = await redisClient.get(redisKey);
    if (!raw) {
      return { valid: false, reason: "Verification code expired. Please sign in again." };
    }

    let stored: { code: string; email: string; devicePlatform?: string; deviceName?: string };
    try {
      stored = JSON.parse(raw);
    } catch {
      return { valid: false, reason: "Invalid challenge state." };
    }

    if (stored.code !== code) {
      await redisClient.incr(attemptsKey);
      await this.logSecurityEvent({
        userId,
        eventType: SecurityEventType.DEVICE_CHALLENGE_FAILED,
        deviceFingerprint: fingerprint,
        severity: SecurityEventSeverity.LOW,
        metadata: { attempt: attempts + 1 },
      });
      return { valid: false, reason: "Incorrect code. Please try again." };
    }

    // Code is correct — mark device as trusted
    const trustExpiry = new Date(Date.now() + TRUST_DURATION_DAYS * 24 * 60 * 60 * 1000);
    const platform = deviceMeta.platform || stored.devicePlatform || "unknown";
    const deviceName = deviceMeta.deviceName || stored.deviceName;

    await this.prisma.userDevice.upsert({
      where: {
        UserDevice_user_device_key: { userId, deviceId: fingerprint },
      },
      create: {
        userId,
        companyId,
        deviceId: fingerprint,
        platform,
        deviceName,
        isTrusted: true,
        trustedAt: new Date(),
        trustExpiresAt: trustExpiry,
      },
      update: {
        isTrusted: true,
        trustedAt: new Date(),
        trustExpiresAt: trustExpiry,
        lastSeenAt: new Date(),
        isRevoked: false,
        revokedAt: null,
        platform,
        deviceName: deviceName || undefined,
      },
    });

    // Clean up Redis
    await redisClient.del(redisKey);
    await redisClient.del(attemptsKey);

    // Log success
    await this.logSecurityEvent({
      userId,
      eventType: SecurityEventType.DEVICE_CHALLENGE_PASSED,
      deviceFingerprint: fingerprint,
      severity: SecurityEventSeverity.LOW,
      metadata: { platform, deviceName },
    });

    // Check for suspicious patterns (fire-and-forget)
    this.detectSuspiciousPatterns(userId).catch(() => {});

    return { valid: true };
  }

  // ── Suspicious pattern detection ────────────────────────────────

  async detectSuspiciousPatterns(userId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

    // Count distinct new devices trusted in the last 24 hours
    const recentTrusted = await this.prisma.userDevice.count({
      where: {
        userId,
        trustedAt: { gte: since },
      },
    });

    if (recentTrusted >= SUSPICIOUS_DEVICE_THRESHOLD) {
      // Check if we already flagged this user recently
      const existingFlag = await this.prisma.securityEvent.findFirst({
        where: {
          userId,
          eventType: SecurityEventType.CREDENTIAL_SHARING_SUSPECTED,
          createdAt: { gte: since },
        },
      });

      if (!existingFlag) {
        await this.logSecurityEvent({
          userId,
          eventType: SecurityEventType.CREDENTIAL_SHARING_SUSPECTED,
          severity: SecurityEventSeverity.HIGH,
          metadata: {
            newDevicesIn24h: recentTrusted,
            threshold: SUSPICIOUS_DEVICE_THRESHOLD,
          },
        });
        this.logger.warn(
          `CREDENTIAL_SHARING_SUSPECTED: User ${userId} trusted ${recentTrusted} devices in 24h`,
        );
      }
    }
  }

  // ── Admin: query security events ────────────────────────────────

  async getSecurityEvents(filters: {
    userId?: string;
    eventType?: SecurityEventType;
    severity?: SecurityEventSeverity;
    status?: "PENDING" | "REVIEWED" | "DISMISSED";
    since?: Date;
    until?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.severity) where.severity = filters.severity;
    if (filters.status) where.status = filters.status;
    if (filters.since || filters.until) {
      where.createdAt = {};
      if (filters.since) where.createdAt.gte = filters.since;
      if (filters.until) where.createdAt.lte = filters.until;
    }

    const [events, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: filters.skip || 0,
        take: filters.take || 50,
      }),
      this.prisma.securityEvent.count({ where }),
    ]);

    return { events, total };
  }

  async reviewSecurityEvent(
    eventId: string,
    reviewerId: string,
    status: "REVIEWED" | "DISMISSED",
    notes?: string,
  ) {
    return this.prisma.securityEvent.update({
      where: { id: eventId },
      data: {
        status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });
  }

  async getFlaggedUsers() {
    const flagged = await this.prisma.securityEvent.groupBy({
      by: ["userId"],
      where: {
        status: "PENDING",
        severity: { in: ["HIGH", "CRITICAL"] },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    if (!flagged.length) return [];

    const userIds = flagged.map((f) => f.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return flagged.map((f) => ({
      user: userMap.get(f.userId) || { id: f.userId },
      pendingHighSeverityEvents: f._count.id,
    }));
  }

  // ── Internal helper ─────────────────────────────────────────────

  private async logSecurityEvent(params: {
    userId: string;
    eventType: SecurityEventType;
    deviceFingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
    severity: SecurityEventSeverity;
    metadata?: any;
  }) {
    return this.prisma.securityEvent.create({
      data: {
        userId: params.userId,
        eventType: params.eventType,
        deviceFingerprint: params.deviceFingerprint,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        severity: params.severity,
        metadata: params.metadata,
      },
    });
  }
}
