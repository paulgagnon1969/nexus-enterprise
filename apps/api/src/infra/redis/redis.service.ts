import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

/** Default TTLs for different cache types (in seconds) */
export const CACHE_TTL = {
  /** Golden price list - changes rarely, 1 hour */
  GOLDEN_PRICE_LIST: 3600,
  /** Company price list - per-tenant, 30 minutes */
  COMPANY_PRICE_LIST: 1800,
  /** Field security policies - per-company, 15 minutes */
  FIELD_SECURITY: 900,
  /** Division mappings - static data, 24 hours */
  DIVISIONS: 86400,
  /** Short-lived cache for frequent lookups, 5 minutes */
  SHORT: 300,
} as const;

/** Cache key prefixes for namespacing */
export const CACHE_KEY = {
  GOLDEN_CURRENT: "golden:current",
  GOLDEN_TABLE: "golden:table",
  GOLDEN_UPLOADS: "golden:uploads",
  COMPANY_PRICE_LIST: (companyId: string) => `company:${companyId}:pricelist`,
  COMPANY_PRICE_TABLE: (companyId: string) => `company:${companyId}:pricetable`,
  FIELD_SECURITY: (companyId: string) => `company:${companyId}:fieldsec`,
  DIVISIONS: "divisions:all",
} as const;

class NoopRedis {
  async ping() {
    return "unreachable";
  }

  async get(_key: string) {
    return null;
  }

  async set(_key: string, _value: string, _ex?: string, _ttl?: number) {
    return "OK";
  }

  async setex(_key: string, _ttl: number, _value: string) {
    return "OK";
  }

  async del(..._keys: string[]) {
    return 0;
  }

  async keys(_pattern: string) {
    return [];
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

    // In dev/staging, if someone accidentally points REDIS_URL at
    // host.docker.internal (which only makes sense *from inside* a
    // container), ioredis will spam ENOTFOUND errors on every reconnect
    // attempt. Treat that as effectively "no Redis" for local API dev and
    // fall back to the no-op client.
    if (nodeEnv !== "production" && url && url.includes("host.docker.internal")) {
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

  /**
   * Check if Redis is actually connected (not no-op).
   */
  isConnected(): boolean {
    return !(this.client instanceof NoopRedis);
  }

  /**
   * Get a JSON value from cache.
   * Returns null if not found or on error.
   */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error(`[redis] getJson error for key=${key}`, err);
      return null;
    }
  }

  /**
   * Set a JSON value in cache with TTL.
   */
  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttlSeconds, serialized);
    } catch (err) {
      console.error(`[redis] setJson error for key=${key}`, err);
    }
  }

  /**
   * Delete one or more cache keys.
   */
  async del(...keys: string[]): Promise<number> {
    try {
      if (keys.length === 0) return 0;
      return await this.client.del(...keys);
    } catch (err) {
      console.error(`[redis] del error for keys=${keys.join(",")}`, err);
      return 0;
    }
  }

  /**
   * Delete all keys matching a pattern (use with caution).
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.client.del(...keys);
    } catch (err) {
      console.error(`[redis] delPattern error for pattern=${pattern}`, err);
      return 0;
    }
  }

  /**
   * Invalidate all Golden price list caches.
   */
  async invalidateGoldenCache(): Promise<void> {
    await this.del(
      CACHE_KEY.GOLDEN_CURRENT,
      CACHE_KEY.GOLDEN_TABLE,
      CACHE_KEY.GOLDEN_UPLOADS,
    );
    console.log("[redis] Invalidated Golden price list cache");
  }

  /**
   * Invalidate company-specific caches.
   */
  async invalidateCompanyCache(companyId: string): Promise<void> {
    await this.del(
      CACHE_KEY.COMPANY_PRICE_LIST(companyId),
      CACHE_KEY.COMPANY_PRICE_TABLE(companyId),
      CACHE_KEY.FIELD_SECURITY(companyId),
    );
    console.log(`[redis] Invalidated cache for company=${companyId}`);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
