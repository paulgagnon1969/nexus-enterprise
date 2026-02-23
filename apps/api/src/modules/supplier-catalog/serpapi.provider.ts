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

const SERP_BASE = "https://serpapi.com/search.json";
const SEARCH_CACHE_TTL = 300; // 5 min
const PRODUCT_CACHE_TTL = 900; // 15 min

/** Sort key mapping from our generic names to SerpAPI HD params. */
const SORT_MAP: Record<string, string> = {
  best_match: "best_match",
  top_sellers: "top_sellers",
  price_asc: "price_low_to_high",
  price_desc: "price_high_to_low",
  top_rated: "top_rated",
};

@Injectable()
export class SerpApiProvider implements CatalogProvider {
  readonly providerKey = "homedepot";
  readonly displayName = "Home Depot";

  private readonly logger = new Logger(SerpApiProvider.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>("SERPAPI_KEY");
    if (!this.apiKey) {
      this.logger.warn(
        "SERPAPI_KEY is not set — Home Depot catalog (SerpAPI) will be disabled.",
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
    const cacheKey = `catalog:serp:search:${query}:${options?.zipCode ?? ""}:${page}`;
    const cached = await this.redis.getJson<CatalogSearchResult>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: "home_depot",
      q: query,
      page: String(page),
    });
    if (options?.zipCode) params.set("delivery_zip", options.zipCode);
    if (options?.sort && SORT_MAP[options.sort]) {
      params.set("hd_sort", SORT_MAP[options.sort]);
    }

    const data = await this.request(params);
    if (!data) {
      return { provider: this.providerKey, query, totalResults: 0, page, products: [] };
    }

    const products: CatalogProduct[] = (data.products ?? []).map(
      (r: any) => this.mapSearchResult(r),
    );

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
  // Product Detail
  // -------------------------------------------------------------------------

  async getProduct(
    productId: string,
    zipCode?: string,
  ): Promise<CatalogProduct | null> {
    if (!this.apiKey) return null;

    const cacheKey = `catalog:serp:product:${productId}:${zipCode ?? ""}`;
    const cached = await this.redis.getJson<CatalogProduct>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: "home_depot_product",
      product_id: productId,
    });
    if (zipCode) params.set("delivery_zip", zipCode);

    const data = await this.request(params);
    if (!data?.product_results) return null;

    const product = this.mapProductDetail(data.product_results);
    await this.redis.setJson(cacheKey, product, PRODUCT_CACHE_TTL);
    return product;
  }

  // -------------------------------------------------------------------------
  // Store Availability
  // -------------------------------------------------------------------------

  async getStoreAvailability(
    productId: string,
    zipCode: string,
  ): Promise<StoreAvailability> {
    const product = await this.getProduct(productId, zipCode);

    const stores: StoreAvailability["stores"] = [];
    if (product?.rawJson?.pickup) {
      stores.push({
        storeId: product.rawJson.pickup.store_id ?? "nearby",
        storeName: product.rawJson.pickup.store_name ?? "Nearby Store",
        address: product.rawJson.pickup.address ?? undefined,
        inStock: product.rawJson.pickup.in_stock ?? true,
        price: product.price,
      });
    }

    return { provider: this.providerKey, productId, zipCode, stores };
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  private mapSearchResult(r: any): CatalogProduct {
    const pk = r.pickup ?? r.in_store_pickup ?? {};
    return {
      productId: String(r.product_id ?? ""),
      provider: this.providerKey,
      title: r.title ?? "",
      brand: r.brand ?? undefined,
      modelNumber: r.model_number ?? undefined,
      imageUrl: r.thumbnail ?? r.thumbnails?.[0]?.[0] ?? undefined,
      productUrl: r.link ?? undefined,
      price: typeof r.price === "number" ? r.price : this.parsePrice(r.price),
      unit: r.unit ?? undefined,
      inStock: r.pickup?.free_ship_to_store ?? r.delivery?.free ?? undefined,
      upc: undefined, // Not in search results; available in product detail
      storeSku: undefined,
      rating: r.rating ?? undefined,
      storeName: pk.store_name ?? undefined,
      storeAddress: pk.address ?? pk.street ?? undefined,
      storeCity: pk.city ?? undefined,
      storeState: pk.state ?? undefined,
      storeZip: pk.zipcode ?? pk.zip ?? undefined,
      storePhone: pk.phone ?? undefined,
    };
  }

  private mapProductDetail(p: any): CatalogProduct {
    const pk = p.pickup ?? {};
    const ff = p.fulfillment ?? {};
    return {
      productId: String(p.product_id ?? ""),
      provider: this.providerKey,
      title: p.title ?? "",
      description: p.description ?? undefined,
      brand: p.brand ?? undefined,
      modelNumber: p.model_number ?? undefined,
      upc: p.upc ?? undefined,
      storeSku: p.store_sku ?? undefined,
      imageUrl: p.primary_image ?? p.thumbnails?.[0] ?? undefined,
      productUrl: p.link ?? undefined,
      price: typeof p.price === "number" ? p.price : this.parsePrice(p.price),
      wasPrice: this.parsePrice(p.was_price),
      unit: p.unit ?? undefined,
      aisle: p.aisle ?? undefined,
      inStock: p.in_stock ?? undefined,
      rating: p.rating ?? undefined,
      storeName: pk.store_name ?? ff.store_name ?? undefined,
      storeAddress: pk.address ?? pk.street ?? ff.store_address ?? undefined,
      storeCity: pk.city ?? ff.store_city ?? undefined,
      storeState: pk.state ?? ff.store_state ?? undefined,
      storeZip: pk.zipcode ?? pk.zip ?? ff.store_zip ?? undefined,
      storePhone: pk.phone ?? ff.store_phone ?? undefined,
      rawJson: {
        fulfillment: p.fulfillment ?? undefined,
        specifications: p.specifications ?? undefined,
        pickup: p.pickup ?? undefined,
        delivery: p.delivery ?? undefined,
        bullets: p.bullets ?? undefined,
      },
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
        this.logger.warn(`SerpAPI returned ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const json: any = await res.json();

      if (json?.error) {
        this.logger.warn(`SerpAPI error: ${json.error}`);
        return null;
      }

      return json;
    } catch (err: any) {
      this.logger.warn(`SerpAPI request failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
