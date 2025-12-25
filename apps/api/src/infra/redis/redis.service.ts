import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

class NoopRedis {
  async ping() {
    return "unreachable";
  }

  async get(_key: string) {
    return null;
  }

  async setex(_key: string, _ttl: number, _value: string) {
    return "OK";
  }

  async del(_key: string) {
    return 0;
  }

  async quit() {
    return 0;
  }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: any;

  constructor() {
    const url = process.env.REDIS_URL;
    const nodeEnv = process.env.NODE_ENV || "development";
    const useRealRedisInDev = process.env.REDIS_USE_REAL === "true";

    // In non-production environments, default to the no-op client so that
    // missing/unstable Redis does not break local dev flows (e.g. login).
    // To exercise real Redis in dev/staging, opt-in via REDIS_USE_REAL=true.
    if (nodeEnv !== "production" && !useRealRedisInDev) {
      this.client = new NoopRedis();
      return;
    }

    if (url) {
      this.client = new Redis(url);
    } else {
      // In production-like environments without Redis configured, still fall
      // back to no-op so that the API degrades gracefully instead of
      // crashing. Features depending on Redis (refresh tokens, password
      // resets, etc.) will be effectively disabled.
      this.client = new NoopRedis();
    }
  }

  getClient() {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
