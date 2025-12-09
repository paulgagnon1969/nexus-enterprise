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
    if (url) {
      this.client = new Redis(url);
    } else {
      // In environments without Redis (e.g., Cloud Run dev), use a no-op client
      // so that features depending on Redis (refresh tokens, etc.) degrade
      // gracefully instead of crashing the API.
      // For local development with a real Redis instance, set REDIS_URL.
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
