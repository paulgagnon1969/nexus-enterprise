import IORedis from "ioredis";
import { Queue } from "bullmq";

export const IMPORT_QUEUE_NAME = "import-jobs";

let redisConnection: IORedis | null = null;
let importQueue: Queue | null = null;

/**
 * Resolve the Redis URL for BullMQ queue operations.
 * Checks BULLMQ_REDIS_URL first (API-only, avoids activating the RedisService
 * caching layer which uses REDIS_URL), then falls back to REDIS_URL (worker).
 */
function getQueueRedisUrl(): string | undefined {
  return process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL;
}

/**
 * Check if Redis is configured and available for queueing.
 * Returns false if neither BULLMQ_REDIS_URL nor REDIS_URL is set.
 */
export function isRedisAvailable(): boolean {
  return !!getQueueRedisUrl();
}

export function getBullRedisConnection(): IORedis {
  if (redisConnection) return redisConnection;

  const url = getQueueRedisUrl();
  if (!url) {
    throw new Error(
      "BULLMQ_REDIS_URL (or REDIS_URL) is not set. Import jobs require Redis (BullMQ)."
    );
  }

  // BullMQ recommends maxRetriesPerRequest=null for long-lived workers.
  redisConnection = new IORedis(url, { maxRetriesPerRequest: null });
  return redisConnection;
}

export function getImportQueue(): Queue {
  if (importQueue) return importQueue;

  importQueue = new Queue(IMPORT_QUEUE_NAME, {
    // Cast to any to avoid BullMQ/ioredis multi-version type incompatibility.
    connection: getBullRedisConnection() as any,
  });

  return importQueue;
}
