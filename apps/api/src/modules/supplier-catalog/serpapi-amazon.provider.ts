import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../infra/redis/redis.service';
import type {
  CatalogProvider,
  CatalogProduct,
  CatalogSearchResult,
  CatalogSearchOptions,
  StoreAvailability,
} from './catalog-provider.interface';

const SERP_BASE = 'https://serpapi.com/search.json';
const SEARCH_CACHE_TTL = 300; // 5 min
const PRODUCT_CACHE_TTL = 900; // 15 min

/**
 * Amazon supplier provider via SerpAPI.
 *
 * Uses `engine=amazon` for search and `engine=amazon_product` for ASIN
 * detail. Same SERPAPI_KEY as the Home Depot / Lowe's providers.
 *
 * All Amazon products are marked `fulfillmentType: 'SHIP_TO_SITE'` and
 * `availabilityStatus: 'ONLINE_ONLY'`. Prime-eligible items get
 * `freeShipping: true` and a 2-day delivery estimate.
 */
@Injectable()
export class SerpApiAmazonProvider implements CatalogProvider {
  readonly providerKey = 'amazon';
  readonly displayName = 'Amazon';

  private readonly logger = new Logger(SerpApiAmazonProvider.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>('SERPAPI_KEY');
    if (!this.apiKey) {
      this.logger.warn(
        'SERPAPI_KEY is not set — Amazon catalog will be disabled.',
      );
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

    const page = options?.page ?? 1;
    const cacheKey = `catalog:amazon:search:${query}:${options?.zipCode ?? ''}:${page}`;
    const cached = await this.redis.getJson<CatalogSearchResult>(cacheKey);
    if (cached) return cached;

    // Amazon SerpAPI uses `k` for the search query (not `q`)
    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'amazon',
      k: query,
      page: String(page),
    });
    if (options?.zipCode) params.set('amazon_zip', options.zipCode);

    const data = await this.request(params);
    if (!data) {
      return { provider: this.providerKey, query, totalResults: 0, page, products: [] };
    }

    const products: CatalogProduct[] = (data.organic_results ?? [])
      .slice(0, options?.pageSize ?? 10)
      .map((r: any) => this.mapSearchResult(r));

    const result: CatalogSearchResult = {
      provider: this.providerKey,
      query,
      totalResults: data.search_information?.total_results ?? products.length,
      page,
      products,
    };

    await this.redis.setJson(cacheKey, result, SEARCH_CACHE_TTL);
    return result;
  }

  // -------------------------------------------------------------------------
  // Product Detail (ASIN lookup)
  // -------------------------------------------------------------------------

  async getProduct(
    productId: string,
    zipCode?: string,
  ): Promise<CatalogProduct | null> {
    if (!this.apiKey) return null;

    const cacheKey = `catalog:amazon:product:${productId}:${zipCode ?? ''}`;
    const cached = await this.redis.getJson<CatalogProduct>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'amazon_product',
      asin: productId,
    });
    if (zipCode) params.set('amazon_zip', zipCode);

    const data = await this.request(params);
    if (!data?.product_results) return null;

    const product = this.mapProductDetail(data.product_results);
    await this.redis.setJson(cacheKey, product, PRODUCT_CACHE_TTL);
    return product;
  }

  // -------------------------------------------------------------------------
  // Store Availability (virtual — Amazon is always online-only)
  // -------------------------------------------------------------------------

  async getStoreAvailability(
    productId: string,
    zipCode: string,
  ): Promise<StoreAvailability> {
    // Amazon has no physical stores — return a single virtual entry
    return {
      provider: this.providerKey,
      productId,
      zipCode,
      stores: [
        {
          storeId: 'amazon-online',
          storeName: 'Amazon.com',
          inStock: true,
          availabilityStatus: 'ONLINE_ONLY',
        },
      ],
    };
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  private mapSearchResult(r: any): CatalogProduct {
    const price = this.parsePrice(r.price?.raw ?? r.price?.value ?? r.price);
    const isPrime = r.is_prime === true || r.badge?.text?.toLowerCase()?.includes('prime');
    const delivery = this.parseDelivery(r.delivery);

    return {
      productId: r.asin ?? '',
      provider: this.providerKey,
      title: r.title ?? '',
      brand: r.brand ?? undefined,
      imageUrl: r.thumbnail ?? undefined,
      productUrl: r.link ?? undefined,
      price,
      unit: 'each',
      rating: r.rating ?? undefined,

      // Amazon-specific
      asin: r.asin ?? undefined,
      isPrime: isPrime || undefined,
      freeShipping: isPrime || delivery.free || undefined,
      shippingCost: isPrime || delivery.free ? 0 : delivery.cost ?? undefined,
      deliveryMinDays: delivery.minDays ?? (isPrime ? 1 : undefined),
      deliveryMaxDays: delivery.maxDays ?? (isPrime ? 3 : undefined),
      deliveryEstimate: delivery.text ?? undefined,
      fulfillmentType: 'SHIP_TO_SITE',
      availabilityStatus: 'ONLINE_ONLY',

      // Bulk pricing from Amazon "other buying options" or "Subscribe & Save"
      bulkPricing: this.parseBulkPricing(r),

      rawJson: {
        asin: r.asin,
        badge: r.badge,
        delivery: r.delivery,
        buybox_winner: r.buybox_winner,
        prices: r.prices,
        coupon: r.coupon,
      },
    };
  }

  private mapProductDetail(p: any): CatalogProduct {
    const price = this.parsePrice(
      p.buybox_winner?.price?.raw ?? p.buybox_winner?.price?.value ?? p.price?.raw ?? p.price,
    );
    const isPrime = p.buybox_winner?.is_prime === true || p.is_prime === true;
    const delivery = this.parseDelivery(
      p.buybox_winner?.delivery ?? p.delivery,
    );

    return {
      productId: p.asin ?? '',
      provider: this.providerKey,
      title: p.title ?? '',
      description: p.description ?? p.feature_bullets?.join('. ') ?? undefined,
      brand: p.brand ?? undefined,
      imageUrl: p.main_image?.link ?? p.images?.[0]?.link ?? undefined,
      productUrl: p.link ?? undefined,
      price,
      wasPrice: this.parsePrice(p.was_price?.raw),
      unit: 'each',
      rating: p.rating ?? undefined,

      // Amazon-specific
      asin: p.asin ?? undefined,
      isPrime: isPrime || undefined,
      freeShipping: isPrime || delivery.free || undefined,
      shippingCost: isPrime || delivery.free ? 0 : delivery.cost ?? undefined,
      deliveryMinDays: delivery.minDays ?? (isPrime ? 1 : undefined),
      deliveryMaxDays: delivery.maxDays ?? (isPrime ? 3 : undefined),
      deliveryEstimate: delivery.text ?? undefined,
      fulfillmentType: 'SHIP_TO_SITE',
      availabilityStatus: 'ONLINE_ONLY',

      bulkPricing: this.parseBulkPricingFromDetail(p),

      rawJson: {
        asin: p.asin,
        buybox_winner: p.buybox_winner,
        specifications: p.specifications,
        delivery: p.delivery,
        feature_bullets: p.feature_bullets,
        categories: p.categories,
        bought_together: p.bought_together,
      },
    };
  }

  // ── Price parsing ─────────────────────────────────────────────────────────

  private parsePrice(val: any): number | undefined {
    if (val == null) return undefined;
    if (typeof val === 'number') return val;
    const n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    return isNaN(n) ? undefined : n;
  }

  // ── Delivery parsing ──────────────────────────────────────────────────────

  private parseDelivery(delivery: any): {
    text?: string;
    free: boolean;
    cost?: number;
    minDays?: number;
    maxDays?: number;
  } {
    if (!delivery) return { free: false };

    const text =
      typeof delivery === 'string'
        ? delivery
        : delivery.tagline ?? delivery.date ?? delivery.text ?? undefined;

    const free =
      delivery.is_free === true ||
      (typeof text === 'string' &&
        /free\s+(delivery|shipping)/i.test(text));

    const cost = delivery.price
      ? this.parsePrice(delivery.price)
      : undefined;

    // Try to extract day estimates from text like "Get it Mar 15 - Mar 18"
    // or "Arrives in 3-5 business days"
    let minDays: number | undefined;
    let maxDays: number | undefined;

    if (typeof text === 'string') {
      const daysMatch = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(business\s+)?days?/i);
      if (daysMatch) {
        minDays = parseInt(daysMatch[1], 10);
        maxDays = parseInt(daysMatch[2], 10);
      }
    }

    return { text, free, cost, minDays, maxDays };
  }

  // ── Bulk pricing parsing ──────────────────────────────────────────────────

  /**
   * Amazon search results sometimes include "other buying options" or
   * multi-pack variants in the `prices` array. Extract quantity tiers.
   */
  private parseBulkPricing(
    r: any,
  ): Array<{ minQty: number; unitPrice: number }> | undefined {
    const prices: Array<{ minQty: number; unitPrice: number }> = [];

    // Some results include a `prices` array with per-unit breakdowns
    if (Array.isArray(r.prices)) {
      for (const p of r.prices) {
        const price = this.parsePrice(p.raw ?? p.value);
        const qty = p.quantity ?? 1;
        if (price != null && qty > 0) {
          prices.push({ minQty: qty, unitPrice: price / qty });
        }
      }
    }

    // Look for "Subscribe & Save" discounts
    if (r.coupon?.badge_text) {
      const match = r.coupon.badge_text.match(/(\d+)%/);
      const basePrice = this.parsePrice(r.price?.raw ?? r.price);
      if (match && basePrice) {
        const discount = parseInt(match[1], 10) / 100;
        prices.push({
          minQty: 5, // S&S typically requires 5+ subscriptions
          unitPrice: Math.round(basePrice * (1 - discount) * 100) / 100,
        });
      }
    }

    return prices.length > 0 ? prices : undefined;
  }

  /**
   * Product detail may have `buying_options` with multi-pack pricing.
   */
  private parseBulkPricingFromDetail(
    p: any,
  ): Array<{ minQty: number; unitPrice: number }> | undefined {
    const tiers: Array<{ minQty: number; unitPrice: number }> = [];

    if (Array.isArray(p.buying_options)) {
      for (const opt of p.buying_options) {
        const price = this.parsePrice(opt.price?.raw ?? opt.price);
        if (price != null) {
          // Try to extract quantity from option name (e.g. "Pack of 4")
          const qtyMatch = (opt.name ?? '').match(/pack\s+of\s+(\d+)/i);
          const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
          tiers.push({ minQty: qty, unitPrice: price / qty });
        }
      }
    }

    return tiers.length > 0 ? tiers : undefined;
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
        const body = await res.text().catch(() => '');
        this.logger.warn(`SerpAPI Amazon returned ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const json: any = await res.json();

      if (json?.error) {
        this.logger.warn(`SerpAPI Amazon error: ${json.error}`);
        return null;
      }

      return json;
    } catch (err: any) {
      this.logger.warn(`SerpAPI Amazon request failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
