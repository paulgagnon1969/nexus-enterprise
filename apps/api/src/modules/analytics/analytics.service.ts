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
