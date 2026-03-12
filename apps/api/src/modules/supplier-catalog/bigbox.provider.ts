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

const BIGBOX_BASE = "https://api.bigboxapi.com/request";
const BIGBOX_ZIPCODES = "https://api.bigboxapi.com/zipcodes";
const SEARCH_CACHE_TTL = 300; // 5 min
const PRODUCT_CACHE_TTL = 900; // 15 min
/** Cache registered zips in Redis so we don't re-check the API every request. */
const ZIP_REGISTRY_KEY = "catalog:bb:registered_zips";
const ZIP_REGISTRY_TTL = 3600; // 1 hour

@Injectable()
export class BigBoxProvider implements CatalogProvider {
  readonly providerKey = "homedepot";
  readonly displayName = "Home Depot";

  private readonly logger = new Logger(BigBoxProvider.name);
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.config.get<string>("BIGBOX_API_KEY");
    if (!this.apiKey) {
      this.logger.warn(
        "BIGBOX_API_KEY is not set — Home Depot product catalog will be disabled.",
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
    const cacheKey = `catalog:bb:search:${query}:${options?.zipCode ?? ""}:${page}`;
    const cached = await this.redis.getJson<CatalogSearchResult>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      type: "search",
      search_term: query,
      page: String(page),
    });
    if (options?.zipCode) params.set("customer_zipcode", options.zipCode);
    if (options?.sort) params.set("sort_by", options.sort);

    const data = await this.request(params);
    if (!data) {
      return { provider: this.providerKey, query, totalResults: 0, page, products: [] };
    }

    const products: CatalogProduct[] = (data.search_results ?? []).map(
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

    const cacheKey = `catalog:bb:product:${productId}:${zipCode ?? ""}`;
    const cached = await this.redis.getJson<CatalogProduct>(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      type: "product",
      item_id: productId,
    });
    if (zipCode) params.set("customer_zipcode", zipCode);

    const data = await this.request(params);
    if (!data?.product) return null;

    const product = this.mapProductDetail(data.product);
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
    // BigBox API returns fulfillment/buybox info per product query with zip.
    // We pull it from the product detail response.
    const product = await this.getProduct(productId, zipCode);

    const stores: StoreAvailability["stores"] = [];
    if (product?.rawJson?.fulfillment) {
      const f = product.rawJson.fulfillment;
      if (f.pickup_available) {
        stores.push({
          storeId: f.store_id ?? "nearby",
          storeName: f.store_name ?? "Nearby Store",
          address: f.store_address ?? undefined,
          inStock: true,
          price: product.price,
        });
      }
    }

    return { provider: this.providerKey, productId, zipCode, stores };
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  private mapSearchResult(r: any): CatalogProduct {
    const product = r.product ?? r;
    const offers = r.offers ?? {};
    const primaryOffer = offers.primary ?? {};
    const ff = r.fulfillment ?? {};
    const po = ff.pickup_options ?? {};
    const inStock = ff.pickup ?? product.in_stock ?? undefined;
    return {
      productId: String(product.item_id ?? product.link?.split("/")?.pop() ?? ""),
      provider: this.providerKey,
      title: product.title ?? "",
      brand: product.brand ?? undefined,
      modelNumber: product.model_number ?? undefined,
      imageUrl: product.primary_image ?? product.thumbnail ?? undefined,
      productUrl: product.link ?? undefined,
      price: primaryOffer.price ?? product.price?.value ?? product.price ?? undefined,
      wasPrice: primaryOffer.was_price ?? product.was_price?.value ?? undefined,
      unit: primaryOffer.unit ?? product.unit ?? undefined,
      inStock,
      availabilityStatus: this.deriveAvailabilityStatus(inStock, ff),
      leadTimeDays: this.extractLeadTimeDays(ff),
      upc: product.upc ?? undefined,
      storeSku: product.store_sku ?? undefined,
      storeName: ff.store_name ?? po.store_name ?? undefined,
      storeAddress: ff.store_address ?? po.store_address ?? po.address ?? undefined,
      storeCity: ff.store_city ?? po.store_city ?? po.city ?? undefined,
      storeState: ff.store_state ?? po.store_state ?? po.state ?? undefined,
      storeZip: ff.store_zip ?? po.store_zip ?? po.zipcode ?? undefined,
      storePhone: ff.store_phone ?? po.store_phone ?? po.phone ?? undefined,
    };
  }

  private mapProductDetail(p: any): CatalogProduct {
    const ff = p.fulfillment ?? {};
    const po = ff.pickup_options ?? {};
    const inStock = p.in_stock ?? undefined;
    return {
      productId: String(p.item_id ?? ""),
      provider: this.providerKey,
      title: p.title ?? "",
      description: p.description ?? undefined,
      brand: p.brand ?? undefined,
      modelNumber: p.model_number ?? undefined,
      upc: p.upc ?? undefined,
      storeSku: p.store_sku ?? undefined,
      imageUrl: p.primary_image ?? p.main_image?.link ?? undefined,
      productUrl: p.link ?? undefined,
      price:
        p.buybox_winner?.price?.value ?? p.buybox_winner?.price ?? p.price?.value ?? undefined,
      wasPrice: p.was_price?.value ?? undefined,
      unit: p.unit ?? undefined,
      aisle: p.aisle ? `Aisle ${p.aisle.aisle_id}, Bay ${p.aisle.bay_id ?? ""}`.trim() : undefined,
      inStock,
      availabilityStatus: this.deriveAvailabilityStatus(inStock, ff),
      leadTimeDays: this.extractLeadTimeDays(ff),
      storeName: ff.store_name ?? po.store_name ?? undefined,
      storeAddress: ff.store_address ?? po.store_address ?? po.address ?? undefined,
      storeCity: ff.store_city ?? po.store_city ?? po.city ?? undefined,
      storeState: ff.store_state ?? po.store_state ?? po.state ?? undefined,
      storeZip: ff.store_zip ?? po.store_zip ?? po.zipcode ?? undefined,
      storePhone: ff.store_phone ?? po.store_phone ?? po.phone ?? undefined,
      rawJson: {
        fulfillment: p.fulfillment ?? undefined,
        specifications: p.specifications ?? undefined,
        buybox_winner: p.buybox_winner ?? undefined,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Availability helpers
  // -------------------------------------------------------------------------

  /**
   * Derive a structured availability status from BigBox fulfillment data.
   */
  private deriveAvailabilityStatus(
    inStock: boolean | undefined,
    ff: Record<string, any>,
  ): CatalogProduct['availabilityStatus'] {
    // Pickup available → in stock at a store
    if (ff.pickup_available || ff.pickup === true || inStock === true) {
      return 'IN_STOCK';
    }
    // Ship-to-home but not pickup → online only or special order
    if (ff.ship_to_home_available || ff.online_only) {
      return 'ONLINE_ONLY';
    }
    // Special order fields present
    if (ff.special_order || ff.special_order_available) {
      return 'SPECIAL_ORDER';
    }
    // Explicitly out of stock
    if (inStock === false) {
      return 'UNAVAILABLE';
    }
    return undefined;
  }

  /**
   * Extract lead time in days from BigBox fulfillment response.
   * Checks ship_to_home.delivery_days, special_order fields, and free_delivery_date.
   */
  private extractLeadTimeDays(ff: Record<string, any>): number | undefined {
    // Direct delivery days field
    const sth = ff.ship_to_home ?? ff.shipping ?? {};
    if (typeof sth.delivery_days === 'number') return sth.delivery_days;
    if (typeof sth.delivery_date === 'string') {
      const days = this.dateToDays(sth.delivery_date);
      if (days != null) return days;
    }

    // Special order lead time
    const so = ff.special_order ?? {};
    if (typeof so.lead_time_days === 'number') return so.lead_time_days;
    if (typeof so.delivery_days === 'number') return so.delivery_days;

    // Free delivery date string (e.g. "Delivery by Fri, Mar 20")
    if (typeof ff.free_delivery_date === 'string') {
      const days = this.dateToDays(ff.free_delivery_date);
      if (days != null) return days;
    }

    return undefined;
  }

  /** Parse a date-like string into days from now. Returns undefined if unparseable. */
  private dateToDays(dateStr: string): number | undefined {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return undefined;
      const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days > 0 ? days : undefined;
    } catch {
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Zipcode Management (BigBox Zipcodes API)
  // -------------------------------------------------------------------------

  /**
   * Register a zipcode on the BigBox account so future requests can use
   * `customer_zipcode` for localized pricing.
   *
   * Safe to call repeatedly — will skip if already registered.
   * Takes ~2 min on BigBox's side before the zip is `available`.
   */
  async ensureZipcode(zipCode: string): Promise<void> {
    if (!this.apiKey || !zipCode) return;

    // Check local cache first
    const cached = await this.getRegisteredZips();
    if (cached.has(zipCode)) return;

    this.logger.log(`Registering zipcode ${zipCode} with BigBox...`);
    try {
      const res = await fetch(`${BIGBOX_ZIPCODES}?api_key=${this.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ zipcode: zipCode, domain: "homedepot.com" }]),
        signal: AbortSignal.timeout(10_000),
      });
      const json: any = await res.json().catch(() => null);
      if (json?.request_info?.success) {
        this.logger.log(`BigBox zipcode ${zipCode} registered — will be available in ~2 min`);
        // Add to local cache
        cached.add(zipCode);
        await this.redis.setJson(ZIP_REGISTRY_KEY, [...cached], ZIP_REGISTRY_TTL);
      } else {
        this.logger.warn(`BigBox zipcode registration response: ${JSON.stringify(json?.request_info)}`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to register zipcode ${zipCode}: ${err?.message}`);
    }
  }

  /** Remove a zipcode from BigBox. Call when no active projects use it. */
  async removeZipcode(zipCode: string): Promise<void> {
    if (!this.apiKey || !zipCode) return;

    this.logger.log(`Removing zipcode ${zipCode} from BigBox...`);
    try {
      const res = await fetch(`${BIGBOX_ZIPCODES}?api_key=${this.apiKey}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ zipcode: zipCode, domain: "homedepot.com" }]),
        signal: AbortSignal.timeout(10_000),
      });
      const json: any = await res.json().catch(() => null);
      if (json?.request_info?.success) {
        this.logger.log(`BigBox zipcode ${zipCode} removed`);
        // Remove from local cache
        const cached = await this.getRegisteredZips();
        cached.delete(zipCode);
        await this.redis.setJson(ZIP_REGISTRY_KEY, [...cached], ZIP_REGISTRY_TTL);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to remove zipcode ${zipCode}: ${err?.message}`);
    }
  }

  /** List all zipcodes currently registered on the BigBox account. */
  async listRegisteredZipcodes(): Promise<{ zipcode: string; status: string }[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${BIGBOX_ZIPCODES}?api_key=${this.apiKey}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const json: any = await res.json().catch(() => null);
      const zips = json?.zipcodes?.["homedepot.com"] ?? [];
      // Refresh the local cache while we have the data
      const set = new Set(zips.map((z: any) => z.zipcode));
      await this.redis.setJson(ZIP_REGISTRY_KEY, [...set], ZIP_REGISTRY_TTL);
      return zips;
    } catch (err: any) {
      this.logger.warn(`Failed to list BigBox zipcodes: ${err?.message}`);
      return [];
    }
  }

  /** Get locally cached set of registered zips (avoids hitting BigBox API). */
  private async getRegisteredZips(): Promise<Set<string>> {
    const cached = await this.redis.getJson<string[]>(ZIP_REGISTRY_KEY);
    return new Set(cached ?? []);
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async request(params: URLSearchParams): Promise<any | null> {
    const url = `${BIGBOX_BASE}?${params.toString()}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.warn(`BigBox API returned ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }
      const json: any = await res.json();

      // If the zipcode isn't registered on the BigBox account, auto-register
      // it for future requests and retry without zip so the user still gets
      // (non-localized) results immediately.
      if (
        json?.request_info?.success === false &&
        typeof json?.request_info?.message === "string" &&
        json.request_info.message.includes("not set up") &&
        params.has("customer_zipcode")
      ) {
        const zip = params.get("customer_zipcode")!;
        this.logger.warn(
          `BigBox zipcode ${zip} not registered — auto-registering and retrying without zip`,
        );
        // Fire-and-forget: register the zip for next time
        void this.ensureZipcode(zip);
        params.delete("customer_zipcode");
        return this.request(params);
      }

      return json;
    } catch (err: any) {
      this.logger.warn(`BigBox API request failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
