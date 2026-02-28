import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";

const REDIS_KEY = "tucks:events";
const FLUSH_BATCH_SIZE = 500;

/** Lightweight event payload pushed to Redis (or direct to Postgres). */
export interface ActivityEvent {
  companyId: string;
  userId: string;
  eventType: string;
  module: string;
  entityId?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Track Event ──────────────────────────────────────────────────────

  /**
   * Record a user activity event. If Redis is connected, events are buffered
   * in a Redis list and flushed to Postgres every 30 s. Without Redis (local
   * dev), events are written directly to Postgres synchronously.
   */
  async trackEvent(event: ActivityEvent): Promise<void> {
    try {
      if (this.redis.isConnected()) {
        const client = this.redis.getClient();
        await client.rpush(REDIS_KEY, JSON.stringify(event));
      } else {
        // Direct insert (dev fallback — no Redis)
        await this.prisma.userActivityEvent.create({
          data: {
            companyId: event.companyId,
            userId: event.userId,
            eventType: event.eventType,
            module: event.module,
            entityId: event.entityId ?? null,
            metadata: event.metadata ?? undefined,
          },
        });
      }
    } catch (err) {
      // Never let telemetry failures break the request
      this.logger.warn("Failed to track event", (err as Error).message);
    }
  }

  // ── Redis → Postgres Flush (every 30 s) ──────────────────────────────

  @Cron(CronExpression.EVERY_30_SECONDS)
  async flushRedisBuffer(): Promise<number> {
    if (!this.redis.isConnected()) return 0;

    const client = this.redis.getClient();
    let total = 0;

    // Drain in batches to avoid loading huge payloads into memory
    while (true) {
      const batch: string[] = await client.lrange(REDIS_KEY, 0, FLUSH_BATCH_SIZE - 1);
      if (!batch.length) break;

      const events: ActivityEvent[] = [];
      for (const raw of batch) {
        try {
          events.push(JSON.parse(raw));
        } catch {
          // skip malformed entries
        }
      }

      if (events.length) {
        await this.prisma.userActivityEvent.createMany({
          data: events.map(e => ({
            companyId: e.companyId,
            userId: e.userId,
            eventType: e.eventType,
            module: e.module,
            entityId: e.entityId ?? null,
            metadata: e.metadata ?? undefined,
          })),
        });
      }

      // Remove the processed entries atomically
      await client.ltrim(REDIS_KEY, batch.length, -1);
      total += events.length;

      if (batch.length < FLUSH_BATCH_SIZE) break;
    }

    if (total > 0) {
      this.logger.log(`Flushed ${total} activity events from Redis → Postgres`);
    }
    return total;
  }

  // ── Nightly Rollup (2:00 AM UTC) ─────────────────────────────────────

  @Cron("0 2 * * *") // 2:00 AM UTC daily
  async computeDailyRollups(): Promise<void> {
    this.logger.log("Starting daily rollup computation…");

    // Roll up yesterday's data
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    const rows = await this.prisma.$queryRaw<
      { companyId: string; userId: string; module: string; eventType: string; cnt: number }[]
    >`
      SELECT "companyId", "userId", "module", "eventType", COUNT(*)::int AS cnt
      FROM "UserActivityEvent"
      WHERE "createdAt" >= ${new Date(dateStr + "T00:00:00Z")}
        AND "createdAt" < ${new Date(dateStr + "T00:00:00Z")}::timestamp + interval '1 day'
      GROUP BY "companyId", "userId", "module", "eventType"
    `;

    if (!rows.length) {
      this.logger.log("No events to roll up for " + dateStr);
      return;
    }

    const dateValue = new Date(dateStr + "T00:00:00Z");

    // Upsert daily rollups
    for (const r of rows) {
      await this.prisma.activityDailyRollup.upsert({
        where: {
          ActivityDailyRollup_unique: {
            companyId: r.companyId,
            userId: r.userId,
            date: dateValue,
            module: r.module,
            eventType: r.eventType,
          },
        },
        update: { eventCount: r.cnt },
        create: {
          companyId: r.companyId,
          userId: r.userId,
          date: dateValue,
          module: r.module,
          eventType: r.eventType,
          eventCount: r.cnt,
        },
      });
    }

    this.logger.log(`Daily rollup: ${rows.length} rows for ${dateStr}`);

    // Also compute weekly rollup for the week containing yesterday
    await this.computeWeeklyRollupForDate(yesterday);
  }

  private async computeWeeklyRollupForDate(date: Date): Promise<void> {
    // Find Monday of the week
    const day = date.getUTCDay(); // 0=Sun, 1=Mon, ...
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
    const mondayStr = monday.toISOString().slice(0, 10);
    const mondayDate = new Date(mondayStr + "T00:00:00Z");
    const sundayDate = new Date(mondayDate);
    sundayDate.setUTCDate(sundayDate.getUTCDate() + 7);

    const rows = await this.prisma.$queryRaw<
      { companyId: string; userId: string; module: string; eventType: string; cnt: number }[]
    >`
      SELECT "companyId", "userId", "module", "eventType", SUM("eventCount")::int AS cnt
      FROM "ActivityDailyRollup"
      WHERE "date" >= ${mondayDate} AND "date" < ${sundayDate}
      GROUP BY "companyId", "userId", "module", "eventType"
    `;

    for (const r of rows) {
      await this.prisma.activityWeeklyRollup.upsert({
        where: {
          ActivityWeeklyRollup_unique: {
            companyId: r.companyId,
            userId: r.userId,
            weekStart: mondayDate,
            module: r.module,
            eventType: r.eventType,
          },
        },
        update: { eventCount: r.cnt },
        create: {
          companyId: r.companyId,
          userId: r.userId,
          weekStart: mondayDate,
          module: r.module,
          eventType: r.eventType,
          eventCount: r.cnt,
        },
      });
    }

    if (rows.length) {
      this.logger.log(`Weekly rollup: ${rows.length} rows for week of ${mondayStr}`);
    }
  }

  // ── Personal KPI Dashboard ───────────────────────────────────────────

  async getPersonalKpis(userId: string, companyId: string, period: string) {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // User's own counts by module (from existing data tables for accuracy)
    const [userLogs, userTasks, userMessages, userTimecards] = await Promise.all([
      this.prisma.dailyLog.count({
        where: { createdById: userId, createdAt: { gte: since } },
      }),
      this.prisma.task.count({
        where: { createdByUserId: userId, createdAt: { gte: since } },
      }),
      this.prisma.message.count({
        where: { senderId: userId, createdAt: { gte: since } },
      }),
      this.prisma.dailyTimecard.count({
        where: { createdByUserId: userId, createdAt: { gte: since } },
      }),
    ]);

    // Company averages (per user) for the same period
    const companyUsers = await this.prisma.companyMembership.count({
      where: { companyId },
    });
    const activeUsers = Math.max(companyUsers, 1);

    const [companyLogs, companyTasks, companyMessages, companyTimecards] = await Promise.all([
      this.prisma.dailyLog.count({
        where: {
          project: { companyId },
          createdAt: { gte: since },
        },
      }),
      this.prisma.task.count({
        where: { companyId, createdAt: { gte: since } },
      }),
      this.prisma.message.count({
        where: {
          thread: { companyId },
          createdAt: { gte: since },
        },
      }),
      this.prisma.dailyTimecard.count({
        where: { companyId, createdAt: { gte: since } },
      }),
    ]);

    // Percentile ranking: how many users in this company have fewer daily logs?
    const usersWithFewerLogs = await this.prisma.$queryRaw<{ cnt: number }[]>`
      SELECT COUNT(DISTINCT "createdById")::int AS cnt
      FROM "DailyLog" dl
      JOIN "Project" p ON p.id = dl."projectId"
      WHERE p."companyId" = ${companyId}
        AND dl."createdAt" >= ${since}
      GROUP BY dl."createdById"
      HAVING COUNT(*) < ${userLogs}
    `;
    const logPercentile =
      activeUsers > 1
        ? Math.round(((usersWithFewerLogs.length) / activeUsers) * 100)
        : 100;

    // Task completion rate: user's DONE tasks vs total assigned
    const [userTasksDone, userTasksTotal] = await Promise.all([
      this.prisma.task.count({
        where: { assigneeId: userId, status: "DONE", updatedAt: { gte: since } },
      }),
      this.prisma.task.count({
        where: { assigneeId: userId, createdAt: { gte: since } },
      }),
    ]);
    const userCompletionRate = userTasksTotal > 0
      ? Math.round((userTasksDone / userTasksTotal) * 100)
      : 0;

    // Company-wide task completion rate
    const [companyTasksDone, companyTasksTotal] = await Promise.all([
      this.prisma.task.count({
        where: { companyId, status: "DONE", updatedAt: { gte: since } },
      }),
      this.prisma.task.count({
        where: { companyId, createdAt: { gte: since } },
      }),
    ]);
    const companyCompletionRate = companyTasksTotal > 0
      ? Math.round((companyTasksDone / companyTasksTotal) * 100)
      : 0;

    return {
      period: `${days}d`,
      modules: {
        dailyLogs:  { you: userLogs,      companyAvg: Math.round(companyLogs / activeUsers) },
        tasks:      { you: userTasks,      companyAvg: Math.round(companyTasks / activeUsers) },
        messages:   { you: userMessages,   companyAvg: Math.round(companyMessages / activeUsers) },
        timecards:  { you: userTimecards,  companyAvg: Math.round(companyTimecards / activeUsers) },
      },
      completionRate: {
        you: userCompletionRate,
        companyAvg: companyCompletionRate,
      },
      ranking: {
        dailyLogPercentile: logPercentile,
        label: logPercentile >= 80
          ? `Top ${100 - logPercentile}%`
          : logPercentile >= 50
            ? "Above average"
            : "Below average",
      },
    };
  }

  // ── Gaming Detection (daily 2:30 AM UTC) ──────────────────────────────

  @Cron("30 2 * * *") // 2:30 AM UTC daily — runs after rollups
  async computeGamingScores(): Promise<void> {
    this.logger.log("Starting gaming detection scoring…");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayStart = new Date(yesterday.toISOString().slice(0, 10) + "T00:00:00Z");
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Fetch all daily logs from yesterday with attachment counts
    const logsRaw = await this.prisma.dailyLog.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      select: {
        id: true,
        projectId: true,
        createdById: true,
        createdAt: true,
        workPerformed: true,
        buildingId: true,
        unitId: true,
        roomParticleId: true,
        project: { select: { companyId: true } },
        attachments: { select: { id: true } },
      },
    });

    if (!logsRaw.length) {
      this.logger.log("No daily logs to score for gaming detection.");
      return;
    }

    // Group logs by company → user
    const byCompanyUser = new Map<string, typeof logsRaw>();
    for (const log of logsRaw) {
      const key = `${log.project.companyId}::${log.createdById}`;
      const list = byCompanyUser.get(key) || [];
      list.push(log);
      byCompanyUser.set(key, list);
    }

    // Compute per-project mean/stddev for volume anomaly
    const projectCounts = new Map<string, number[]>();
    for (const log of logsRaw) {
      const key = `${log.project.companyId}::${log.projectId}`;
      const list = projectCounts.get(key) || [];
      // We'll track per-user counts for this project
      projectCounts.set(key, list);
    }
    // Build per-project per-user count map
    const projUserCounts = new Map<string, Map<string, number>>();
    for (const log of logsRaw) {
      const pk = `${log.project.companyId}::${log.projectId}`;
      if (!projUserCounts.has(pk)) projUserCounts.set(pk, new Map());
      const m = projUserCounts.get(pk)!;
      m.set(log.createdById, (m.get(log.createdById) || 0) + 1);
    }

    let flagCount = 0;

    for (const [key, userLogs] of byCompanyUser) {
      const [companyId, userId] = key.split("::");
      if (userLogs.length < 2) continue; // need at least 2 logs to flag

      // ── Signal 1: Volume Anomaly (30%) ──
      // For each project this user logged in, is their count > mean + 2σ?
      let volumeScore = 0;
      const projectGroups = new Map<string, typeof userLogs>();
      for (const l of userLogs) {
        const pg = projectGroups.get(l.projectId) || [];
        pg.push(l);
        projectGroups.set(l.projectId, pg);
      }
      for (const [projId, projLogs] of projectGroups) {
        const pk = `${companyId}::${projId}`;
        const allCounts = Array.from(projUserCounts.get(pk)?.values() || []);
        if (allCounts.length < 2) continue;
        const mean = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
        const stddev = Math.sqrt(allCounts.reduce((s, v) => s + (v - mean) ** 2, 0) / allCounts.length);
        const threshold = mean + 2 * Math.max(stddev, 1);
        if (projLogs.length > threshold) {
          volumeScore = Math.max(volumeScore, Math.min((projLogs.length - threshold) / threshold, 1));
        }
      }

      // ── Signal 2: Temporal Burst (25%) ──
      // Multiple logs within 10-minute windows
      const sorted = [...userLogs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      let burstPairs = 0;
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].createdAt.getTime() - sorted[i - 1].createdAt.getTime();
        if (gap < 10 * 60 * 1000) burstPairs++;
      }
      const burstScore = sorted.length > 1 ? Math.min(burstPairs / (sorted.length - 1), 1) : 0;

      // ── Signal 3: Content Entropy (20%) ──
      // Short logs with no photos = low effort
      let lowEffortCount = 0;
      for (const l of userLogs) {
        const textLen = (l.workPerformed || "").length;
        const hasPhotos = l.attachments.length > 0;
        if (textLen < 50 && !hasPhotos) lowEffortCount++;
      }
      const entropyScore = Math.min(lowEffortCount / userLogs.length, 1);

      // ── Signal 4: Duplicate Similarity (15%) ──
      // Jaccard similarity on word sets between log bodies
      let highSimPairs = 0;
      let totalPairs = 0;
      const texts = userLogs.map(l => new Set((l.workPerformed || "").toLowerCase().split(/\s+/).filter(Boolean)));
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          totalPairs++;
          if (texts[i].size === 0 && texts[j].size === 0) { highSimPairs++; continue; }
          const intersection = new Set([...texts[i]].filter(w => texts[j].has(w)));
          const union = new Set([...texts[i], ...texts[j]]);
          const jaccard = union.size > 0 ? intersection.size / union.size : 0;
          if (jaccard > 0.7) highSimPairs++;
        }
      }
      const similarityScore = totalPairs > 0 ? Math.min(highSimPairs / totalPairs, 1) : 0;

      // ── Signal 5: Effort-to-Output Ratio (10%) ──
      // Logs per unique context (project × building/unit/room)
      const contextKeys = new Set(
        userLogs.map(l => `${l.projectId}::${l.buildingId || ""}::${l.unitId || ""}::${l.roomParticleId || ""}`),
      );
      // If many logs but few unique contexts, suspicious
      const ratioScore = contextKeys.size > 0
        ? Math.min(Math.max((userLogs.length / contextKeys.size - 2) / 3, 0), 1)
        : 0;

      // ── Composite Score ──
      const gamingScore =
        volumeScore * 0.30 +
        burstScore * 0.25 +
        entropyScore * 0.20 +
        similarityScore * 0.15 +
        ratioScore * 0.10;

      if (gamingScore < 0.4) continue;

      // Upsert flag for this user/day
      await this.prisma.gamingFlag.upsert({
        where: {
          GamingFlag_company_user_date_key: {
            companyId,
            userId,
            flagDate: dayStart,
          },
        },
        update: {
          gamingScore,
          volumeScore,
          burstScore,
          entropyScore,
          similarityScore,
          ratioScore,
          dailyLogIds: userLogs.map(l => l.id),
        },
        create: {
          companyId,
          userId,
          flagDate: dayStart,
          gamingScore,
          volumeScore,
          burstScore,
          entropyScore,
          similarityScore,
          ratioScore,
          dailyLogIds: userLogs.map(l => l.id),
        },
      });
      flagCount++;
    }

    this.logger.log(`Gaming detection: ${flagCount} flag(s) created for ${dayStart.toISOString().slice(0, 10)}`);
  }

  // ── Gaming Review Queue (PM+ management) ──────────────────────────────

  async getGamingReviewQueue(companyId: string, limit = 50) {
    const flags = await this.prisma.gamingFlag.findMany({
      where: { companyId, status: "PENDING" },
      orderBy: [{ gamingScore: "desc" }, { flagDate: "desc" }],
      take: limit,
    });

    // Enrich with user info
    const userIds = [...new Set(flags.map(f => f.userId))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    return flags.map(f => ({
      id: f.id,
      flagDate: f.flagDate,
      gamingScore: Math.round(f.gamingScore * 100) / 100,
      scores: {
        volume: Math.round(f.volumeScore * 100) / 100,
        burst: Math.round(f.burstScore * 100) / 100,
        entropy: Math.round(f.entropyScore * 100) / 100,
        similarity: Math.round(f.similarityScore * 100) / 100,
        ratio: Math.round(f.ratioScore * 100) / 100,
      },
      severity: f.gamingScore >= 0.6 ? "RED" : "AMBER",
      dailyLogCount: Array.isArray(f.dailyLogIds) ? (f.dailyLogIds as string[]).length : 0,
      user: userMap.get(f.userId) || { id: f.userId, email: "unknown", firstName: null, lastName: null },
      status: f.status,
      createdAt: f.createdAt,
    }));
  }

  async reviewGamingFlag(
    flagId: string,
    reviewerId: string,
    action: "DISMISSED" | "CONFIRMED" | "COACHED",
    notes?: string,
  ) {
    return this.prisma.gamingFlag.update({
      where: { id: flagId },
      data: {
        status: action,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
      },
    });
  }

  // ── Purge Old Raw Events (every Sunday 3:00 AM UTC) ──────────────────

  @Cron("0 3 * * 0") // Sunday 3:00 AM UTC
  async purgeOldEvents(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);

    const deleted = await this.prisma.userActivityEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`Purged ${deleted.count} raw events older than ${cutoff.toISOString().slice(0, 10)}`);
  }
}
