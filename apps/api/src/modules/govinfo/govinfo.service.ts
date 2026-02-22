import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../infra/redis/redis.service";

const GOVINFO_BASE = "https://api.govinfo.gov";
const CACHE_TTL_SUMMARY = 3600; // 1 hour for package summaries
const CACHE_TTL_GRANULES = 1800; // 30 min for granule lists

/** Minimum delay between API requests (ms). */
const RATE_LIMIT_MS = 1000;
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface GovInfoPackageRef {
  packageId: string;
  lastModified: string;
  packageLink: string;
  title?: string;
  docClass?: string;
}

export interface GovInfoCollectionResult {
  count: number;
  nextPage: string | null;
  packages: GovInfoPackageRef[];
}

export interface GovInfoPackageSummary {
  packageId: string;
  title: string;
  collectionCode: string;
  dateIssued: string;
  lastModified: string;
  category?: string;
  docClass?: string;
  suDocClassNumber?: string;
  download?: Record<string, string>;
  [key: string]: any;
}

export interface GovInfoGranuleRef {
  granuleId: string;
  title: string;
  granuleLink: string;
  [key: string]: any;
}

export interface GovInfoGranuleResult {
  count: number;
  nextPage: string | null;
  granules: GovInfoGranuleRef[];
}

export interface GovInfoGranuleSummary {
  granuleId: string;
  title: string;
  collectionCode: string;
  dateIssued: string;
  category?: string;
  subGranuleClass?: string;
  download?: Record<string, string>;
  references?: { cfrParts?: string[] };
  [key: string]: any;
}

export interface GovInfoSearchResult {
  count: number;
  offsetMark: string | null;
  results: Array<{
    title: string;
    packageId: string;
    granuleId?: string;
    dateIssued: string;
    collectionCode: string;
    [key: string]: any;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class GovInfoService {
  private readonly logger = new Logger(GovInfoService.name);
  private readonly apiKey: string | undefined;
  private lastRequestAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>("GOVINFO_API_KEY");
    if (!this.apiKey) {
      this.logger.warn(
        "GOVINFO_API_KEY is not set — GovInfo API calls will be disabled",
      );
    }
  }

  /** Whether the service has a valid API key configured. */
  isEnabled(): boolean {
    return !!this.apiKey;
  }

  // -----------------------------------------------------------------------
  // Collection endpoints
  // -----------------------------------------------------------------------

  /**
   * List packages in a collection that were added/updated after `startDate`.
   * Handles pagination internally if `fetchAll` is true.
   */
  async getCollectionPackages(
    collection: string,
    startDate: string,
    opts?: { pageSize?: number; fetchAll?: boolean },
  ): Promise<GovInfoPackageRef[]> {
    const pageSize = opts?.pageSize ?? 100;
    const fetchAll = opts?.fetchAll ?? true;
    const allPackages: GovInfoPackageRef[] = [];

    let url =
      `${GOVINFO_BASE}/collections/${collection}/${startDate}` +
      `?pageSize=${pageSize}&offsetMark=*&api_key=${this.apiKey}`;

    do {
      const data = await this.apiFetch<GovInfoCollectionResult>(url);
      if (!data) break;

      allPackages.push(...(data.packages ?? []));

      url = fetchAll && data.nextPage
        ? `${data.nextPage}&api_key=${this.apiKey}`
        : "";
    } while (url);

    return allPackages;
  }

  // -----------------------------------------------------------------------
  // Package endpoints
  // -----------------------------------------------------------------------

  /** Get summary metadata for a single package. Results are cached. */
  async getPackageSummary(
    packageId: string,
  ): Promise<GovInfoPackageSummary | null> {
    const cacheKey = `govinfo:pkg:${packageId}`;
    const cached = await this.redis.getJson<GovInfoPackageSummary>(cacheKey);
    if (cached) return cached;

    const url = `${GOVINFO_BASE}/packages/${packageId}/summary?api_key=${this.apiKey}`;
    const data = await this.apiFetch<GovInfoPackageSummary>(url);
    if (data) {
      await this.redis.setJson(cacheKey, data, CACHE_TTL_SUMMARY);
    }
    return data;
  }

  /** List granules within a package (paginated). */
  async getPackageGranules(
    packageId: string,
    opts?: { pageSize?: number; fetchAll?: boolean },
  ): Promise<GovInfoGranuleRef[]> {
    const pageSize = opts?.pageSize ?? 100;
    const fetchAll = opts?.fetchAll ?? true;
    const allGranules: GovInfoGranuleRef[] = [];

    // Check cache for small-ish results
    const cacheKey = `govinfo:granules:${packageId}`;
    const cached = await this.redis.getJson<GovInfoGranuleRef[]>(cacheKey);
    if (cached) return cached;

    let url =
      `${GOVINFO_BASE}/packages/${packageId}/granules` +
      `?pageSize=${pageSize}&offsetMark=*&api_key=${this.apiKey}`;

    do {
      const data = await this.apiFetch<GovInfoGranuleResult>(url);
      if (!data) break;

      allGranules.push(...(data.granules ?? []));

      url = fetchAll && data.nextPage
        ? `${data.nextPage}&api_key=${this.apiKey}`
        : "";
    } while (url);

    if (allGranules.length > 0) {
      await this.redis.setJson(cacheKey, allGranules, CACHE_TTL_GRANULES);
    }
    return allGranules;
  }

  /** Get detailed summary for a single granule. */
  async getGranuleSummary(
    packageId: string,
    granuleId: string,
  ): Promise<GovInfoGranuleSummary | null> {
    const cacheKey = `govinfo:granule:${packageId}:${granuleId}`;
    const cached = await this.redis.getJson<GovInfoGranuleSummary>(cacheKey);
    if (cached) return cached;

    const url =
      `${GOVINFO_BASE}/packages/${packageId}/granules/${granuleId}/summary` +
      `?api_key=${this.apiKey}`;
    const data = await this.apiFetch<GovInfoGranuleSummary>(url);
    if (data) {
      await this.redis.setJson(cacheKey, data, CACHE_TTL_SUMMARY);
    }
    return data;
  }

  // -----------------------------------------------------------------------
  // Search Service
  // -----------------------------------------------------------------------

  /**
   * Full-text search across GovInfo collections.
   * The Search Service uses POST with a JSON body.
   */
  async search(
    query: string,
    opts?: { pageSize?: number; collection?: string; offsetMark?: string },
  ): Promise<GovInfoSearchResult | null> {
    const body: any = {
      query: opts?.collection
        ? `collection:(${opts.collection}) AND ${query}`
        : query,
      pageSize: String(opts?.pageSize ?? 25),
      offsetMark: opts?.offsetMark ?? "*",
      sorts: [{ field: "score", sortOrder: "DESC" }],
    };

    await this.rateLimit();
    const url = `${GOVINFO_BASE}/search?api_key=${this.apiKey}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.warn(`GovInfo search error (${res.status}): ${text.slice(0, 200)}`);
        return null;
      }

      return (await res.json()) as GovInfoSearchResult;
    } catch (err: any) {
      this.logger.warn(`GovInfo search failed: ${err?.message ?? err}`);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Published-date endpoint (useful for querying by date range + collection)
  // -----------------------------------------------------------------------

  /** List packages published between two dates, optionally filtered by collection. */
  async getPublishedPackages(
    startDate: string,
    endDate: string,
    opts?: { collection?: string; pageSize?: number },
  ): Promise<GovInfoPackageRef[]> {
    const pageSize = opts?.pageSize ?? 100;
    const collectionParam = opts?.collection ? `&collection=${opts.collection}` : "";
    const allPackages: GovInfoPackageRef[] = [];

    let url =
      `${GOVINFO_BASE}/published/${startDate}/${endDate}` +
      `?pageSize=${pageSize}&offsetMark=*${collectionParam}&api_key=${this.apiKey}`;

    do {
      const data = await this.apiFetch<{ nextPage: string | null; packages: GovInfoPackageRef[] }>(url);
      if (!data) break;
      allPackages.push(...(data.packages ?? []));
      url = data.nextPage ? `${data.nextPage}&api_key=${this.apiKey}` : "";
    } while (url);

    return allPackages;
  }

  // -----------------------------------------------------------------------
  // Bulk Data helpers
  // -----------------------------------------------------------------------

  /** Fetch raw XML from the GovInfo bulk data repository. No API key needed. */
  async fetchBulkXml(path: string): Promise<string | null> {
    const url = `https://www.govinfo.gov/bulkdata/${path}`;
    this.logger.log(`Fetching bulk data: ${url}`);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/xml" },
      });
      if (!res.ok) {
        this.logger.warn(`Bulk data fetch error (${res.status}) for ${path}`);
        return null;
      }
      return res.text();
    } catch (err: any) {
      this.logger.warn(`Bulk data fetch failed: ${err?.message ?? err}`);
      return null;
    }
  }

  /** List files/directories in a bulk data path (returns JSON index). */
  async listBulkDataIndex(path: string): Promise<any | null> {
    const url = `https://www.govinfo.gov/bulkdata/json/${path}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Simple rate limiter: ensure at least RATE_LIMIT_MS between requests. */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  /** Fetch JSON from the GovInfo API with rate limiting and retry. */
  private async apiFetch<T>(url: string, retries = MAX_RETRIES): Promise<T | null> {
    if (!this.apiKey) return null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.rateLimit();

      try {
        const res = await fetch(url);

        if (res.status === 429) {
          // Rate limited — back off
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(`GovInfo 429 — retrying in ${delay}ms (attempt ${attempt}/${retries})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          this.logger.warn(`GovInfo API ${res.status}: ${text.slice(0, 200)}`);
          return null;
        }

        return (await res.json()) as T;
      } catch (err: any) {
        if (attempt === retries) {
          this.logger.warn(`GovInfo fetch failed after ${retries} attempts: ${err?.message ?? err}`);
          return null;
        }
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }

    return null;
  }
}
