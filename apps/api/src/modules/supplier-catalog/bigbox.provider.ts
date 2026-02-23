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
const SEARCH_CACHE_TTL = 300; // 5 min
const PRODUCT_CACHE_TTL = 900; // 15 min

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
      inStock: r.fulfillment?.pickup ?? product.in_stock ?? undefined,
      upc: product.upc ?? undefined,
      storeSku: product.store_sku ?? undefined,
    };
  }

  private mapProductDetail(p: any): CatalogProduct {
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
      inStock: p.in_stock ?? undefined,
      rawJson: {
        fulfillment: p.fulfillment ?? undefined,
        specifications: p.specifications ?? undefined,
        buybox_winner: p.buybox_winner ?? undefined,
      },
    };
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
      return res.json();
    } catch (err: any) {
      this.logger.warn(`BigBox API request failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
