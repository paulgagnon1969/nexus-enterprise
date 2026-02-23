import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../infra/redis/redis.service";
import type {
  CatalogProvider,
  CatalogProduct,
  CatalogSearchResult,
  CatalogSearchOptions,
  StoreAvailability,
} from "./catalog-provider.interface";

/**
 * Lowe's product search powered by SerpAPI's Google Shopping engine.
 *
 * Uses the same SERPAPI_KEY as the Home Depot provider.  We append "lowes" to
 * the query and post-filter results whose `source` field contains "Lowe" so
 * only Lowe's listings are returned.
 */

const SERP_BASE = "https://serpapi.com/search.json";
const SEARCH_CACHE_TTL = 300; // 5 min

@Injectable()
export class SerpApiLowesProvider implements CatalogProvider {
  readonly providerKey = "lowes";
  readonly displayName = "Lowe's";

  private readonly logger = new Logger(SerpApiLowesProvider.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>("SERPAPI_KEY");
    if (!this.apiKey) {
      this.logger.warn(
        "SERPAPI_KEY is not set — Lowe's catalog (Google Shopping) will be disabled.",
      );
    } else {
      this.logger.log("Lowe's catalog enabled via SerpAPI Google Shopping.");
    }
  }

  isEnabled(): boolean {
    return !!this.apiKey;
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  async searchProducts(
    query: string,
    options?: CatalogSearchOptions,
  ): Promise<CatalogSearchResult> {
    if (!this.apiKey) {
      return { provider: this.providerKey, query, totalResults: 0, page: 1, products: [] };
    }

    const cacheKey = `catalog:serp-lowes:search:${query}:${options?.zipCode ?? ""}`;
    const cached = await this.redis.getJson<CatalogSearchResult>(cacheKey);
    if (cached) return cached;

    // Search Google Shopping with "lowes" appended so Lowe's listings rank high
    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: "google_shopping",
      q: `${query} lowes`,
      gl: "us",
      hl: "en",
    });
    if (options?.zipCode) params.set("location", `${options.zipCode}, United States`);

    const data = await this.request(params);
    if (!data) {
      return { provider: this.providerKey, query, totalResults: 0, page: 1, products: [] };
    }

    // Extract results and filter to Lowe's-sourced listings
    const raw: any[] = data.shopping_results ?? data.inline_shopping_results ?? [];
    const lowesResults = raw.filter(
      (r) => r.source && /lowe/i.test(r.source),
    );

    const products: CatalogProduct[] = lowesResults.map((r) =>
      this.mapShoppingResult(r),
    );

    const result: CatalogSearchResult = {
      provider: this.providerKey,
      query,
      totalResults: products.length,
      page: 1,
      products,
    };

    await this.redis.setJson(cacheKey, result, SEARCH_CACHE_TTL);
    return result;
  }

  // -------------------------------------------------------------------------
  // Product Detail  (not available via Google Shopping — return null)
  // -------------------------------------------------------------------------

  async getProduct(
    _productId: string,
    _zipCode?: string,
  ): Promise<CatalogProduct | null> {
    return null;
  }

  // -------------------------------------------------------------------------
  // Store Availability (not available via Google Shopping)
  // -------------------------------------------------------------------------

  async getStoreAvailability(
    productId: string,
    zipCode: string,
  ): Promise<StoreAvailability> {
    return { provider: this.providerKey, productId, zipCode, stores: [] };
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  private mapShoppingResult(r: any): CatalogProduct {
    return {
      productId: String(r.product_id ?? r.docid ?? ""),
      provider: this.providerKey,
      title: r.title ?? "",
      brand: r.extensions?.find?.((e: string) => e && !/free/i.test(e)) ?? undefined,
      imageUrl: r.thumbnail ?? undefined,
      productUrl: r.link ?? r.product_link ?? undefined,
      price: r.extracted_price ?? this.parsePrice(r.price),
      wasPrice: r.extracted_old_price ?? this.parsePrice(r.old_price),
      unit: undefined,
      inStock: r.delivery ? !/out\s*of\s*stock/i.test(r.delivery) : undefined,
      rating: r.rating ?? undefined,
      storeName: r.source ?? "Lowe's",
    };
  }

  /** Parse "$3.98" or "3.98" into a number. */
  private parsePrice(val: any): number | undefined {
    if (val == null) return undefined;
    if (typeof val === "number") return val;
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? undefined : n;
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async request(params: URLSearchParams): Promise<any | null> {
    const url = `${SERP_BASE}?${params.toString()}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.warn(`SerpAPI Google Shopping returned ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const json: any = await res.json();

      if (json?.error) {
        this.logger.warn(`SerpAPI error: ${json.error}`);
        return null;
      }

      return json;
    } catch (err: any) {
      this.logger.warn(`SerpAPI Google Shopping request failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
