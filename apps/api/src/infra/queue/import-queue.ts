import IORedis from "ioredis";
import { Queue } from "bullmq";

export const IMPORT_QUEUE_NAME = "import-jobs";

let redisConnection: IORedis | null = null;
let importQueue: Queue | null = null;

/**
 * Check if Redis is configured and available for queueing.
 * Returns false if REDIS_URL is not set.
 */
export function isRedisAvailable(): boolean {
  return !!process.env.REDIS_URL;
}

export function getBullRedisConnection(): IORedis {
  if (redisConnection) return redisConnection;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Import jobs require Redis (BullMQ)."
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
