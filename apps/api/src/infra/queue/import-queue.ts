import IORedis from "ioredis";
import { Queue } from "bullmq";

export const IMPORT_QUEUE_NAME = "import-jobs";

let redisConnection: IORedis | null = null;
let importQueue: Queue | null = null;

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
    connection: getBullRedisConnection()
  });

  return importQueue;
}
