/**
 * WebScraperProvider — a generic CatalogProvider that reads scrapeConfig
 * from a VendorRegistry row and extracts price / availability from HTML.
 *
 * This replaces hard-coded per-vendor scraper scripts with a configurable,
 * data-driven engine. Adding a new vendor is just inserting a VendorRegistry
 * row with the right scrapeConfig JSON.
 */

import type {
  CatalogProvider,
  CatalogProduct,
  CatalogSearchResult,
  CatalogSearchOptions,
  StoreAvailability,
} from "./catalog-provider.interface";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface ScrapeConfig {
  /** URL template with {sku} placeholder. */
  urlPattern?: string;
  /** Sitemap URLs to discover product pages. */
  sitemapUrls?: string[];
  /** Ordered list of price extraction strategies. */
  priceSelectors?: Array<{
    type: "meta" | "regex" | "jsonLd";
    pattern?: string;
    path?: string;
  }>;
  /** Ordered list of availability extraction strategies. */
  availabilitySelectors?: Array<{
    type: "css" | "regex";
    selector?: string;
    pattern?: string;
    inStockPattern?: string;
  }>;
  /** SKU extraction hints for sitemap URL matching. */
  skuExtraction?: {
    urlSlugSuffix?: boolean;
    urlSlugPattern?: string;
  };
}

export interface RateLimitConfig {
  delayMs?: number;
  maxRetries?: number;
  requestsPerMinute?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Dynamically instantiated per VendorRegistry row with providerType=WEB_SCRAPER.
 */
export class WebScraperProvider implements CatalogProvider {
  readonly providerKey: string;
  readonly displayName: string;

  private readonly config: ScrapeConfig;
  private readonly rateLimit: RateLimitConfig;

  constructor(
    providerKey: string,
    displayName: string,
    scrapeConfig: ScrapeConfig,
    rateLimit?: RateLimitConfig,
  ) {
    this.providerKey = providerKey;
    this.displayName = displayName;
    this.config = scrapeConfig;
    this.rateLimit = rateLimit ?? {};
  }

  isEnabled(): boolean {
    return true;
  }

  // ── Core: fetch a single product by SKU ──────────────────────────

  async getProduct(
    sku: string,
    _zipCode?: string,
  ): Promise<CatalogProduct | null> {
    const url = this.resolveProductUrl(sku);
    if (!url) return null;

    const html = await this.fetchWithRetry(url);
    if (!html) return null;

    const price = this.extractPrice(html);
    const inStock = this.extractAvailability(html);

    return {
      productId: sku,
      provider: this.providerKey,
      title: sku,
      price: price ?? undefined,
      inStock,
      productUrl: url,
    };
  }

  // ── Search (limited for scrapers — does direct SKU lookup) ───────

  async searchProducts(
    query: string,
    _options?: CatalogSearchOptions,
  ): Promise<CatalogSearchResult> {
    // For web scrapers, "search" means trying the query as a SKU.
    const product = await this.getProduct(query);
    return {
      provider: this.providerKey,
      query,
      totalResults: product ? 1 : 0,
      page: 1,
      products: product ? [product] : [],
    };
  }

  // ── Store availability (not supported for generic scrapers) ──────

  async getStoreAvailability(
    _productId: string,
    _zipCode: string,
  ): Promise<StoreAvailability> {
    return {
      provider: this.providerKey,
      productId: _productId,
      zipCode: _zipCode,
      stores: [],
    };
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private resolveProductUrl(sku: string): string | null {
    if (this.config.urlPattern) {
      return this.config.urlPattern.replace("{sku}", sku);
    }
    return null;
  }

  private async fetchWithRetry(url: string): Promise<string | null> {
    const maxRetries = this.rateLimit.maxRetries ?? 2;
    const delayMs = this.rateLimit.delayMs ?? 1200;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": DEFAULT_UA },
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
        if (resp.status === 404) return null;
        if (!resp.ok) {
          if (attempt < maxRetries) {
            await sleep(delayMs * (attempt + 1));
            continue;
          }
          return null;
        }
        const text = await resp.text();
        // Polite delay between requests.
        if (delayMs > 0) await sleep(delayMs);
        return text;
      } catch {
        if (attempt < maxRetries) {
          await sleep(delayMs * (attempt + 1));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  private extractPrice(html: string): number | null {
    for (const sel of this.config.priceSelectors ?? []) {
      let match: RegExpMatchArray | null = null;

      if (sel.type === "meta" || sel.type === "regex") {
        if (sel.pattern) {
          const re = new RegExp(sel.pattern, "i");
          match = html.match(re);
        }
      } else if (sel.type === "jsonLd" && sel.path) {
        // Simple JSON-LD extraction: find "price":"123.45"
        const re = new RegExp(`"${sel.path}"\\s*:\\s*"([\\d.]+)"`, "i");
        match = html.match(re);
      }

      if (match && match[1]) {
        const price = parseFloat(match[1]);
        if (!Number.isNaN(price) && price > 0) return price;
      }
    }
    return null;
  }

  private extractAvailability(html: string): boolean | undefined {
    for (const sel of this.config.availabilitySelectors ?? []) {
      if (sel.type === "regex" && sel.pattern) {
        const re = new RegExp(sel.pattern, "i");
        const match = html.match(re);
        if (match) {
          const inStockPat = sel.inStockPattern ?? "in stock";
          return new RegExp(inStockPat, "i").test(match[0]);
        }
      }
    }
    return undefined;
  }
}
