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

    // In non-production environments, always fall back to the no-op client so
    // that missing/unstable Redis does not break local dev flows (e.g. login).
    // To use a real Redis in dev/staging, we can revisit this guard or add a
    // dedicated flag later.
    if (nodeEnv !== "production") {
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
