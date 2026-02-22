// ---------------------------------------------------------------------------
// Supplier Catalog — Provider Interface & Shared Types
// ---------------------------------------------------------------------------

/** Canonical product representation returned by any provider. */
export interface CatalogProduct {
  /** Provider-specific product ID (e.g. HD item_id, Lowe's itemNumber). */
  productId: string;
  /** Provider key: "homedepot" | "lowes" */
  provider: string;
  /** Product title / display name. */
  title: string;
  /** Full HTML or plain-text description. */
  description?: string;
  /** Brand name (e.g. "DEWALT", "Owens Corning"). */
  brand?: string;
  /** Model number from manufacturer. */
  modelNumber?: string;
  /** UPC / GTIN barcode. */
  upc?: string;
  /** Store SKU (provider-specific). */
  storeSku?: string;
  /** Primary image URL. */
  imageUrl?: string;
  /** Product page URL on the retailer's site. */
  productUrl?: string;

  /** Current price in USD. */
  price?: number;
  /** Was / list price if on sale. */
  wasPrice?: number;
  /** Unit of measure (e.g. "each", "per sq ft"). */
  unit?: string;

  /** In-store aisle / bay location (store-specific). */
  aisle?: string;
  /** Whether the item is in stock at a nearby store. */
  inStock?: boolean;

  /** Xactimate-style category code if we can infer it. */
  inferredCatCode?: string;

  /** Raw response from provider for debugging / extension. */
  rawJson?: Record<string, any>;
}

/** Paginated search result wrapper. */
export interface CatalogSearchResult {
  provider: string;
  query: string;
  totalResults: number;
  page: number;
  products: CatalogProduct[];
}

/** Store-level availability + pricing. */
export interface StoreAvailability {
  provider: string;
  productId: string;
  zipCode: string;
  stores: Array<{
    storeId: string;
    storeName: string;
    address?: string;
    distance?: string;
    inStock: boolean;
    qty?: number;
    price?: number;
  }>;
}

/** Search options passed to providers. */
export interface CatalogSearchOptions {
  /** ZIP code for local pricing / availability. */
  zipCode?: string;
  /** Page number (1-indexed). */
  page?: number;
  /** Max results per page. */
  pageSize?: number;
  /** Sort order (provider-specific). */
  sort?: string;
}

/**
 * Contract that every product data provider must implement.
 * Providers are swappable — BigBox API today, direct HD API tomorrow.
 */
export interface CatalogProvider {
  /** Unique provider key (e.g. "homedepot", "lowes"). */
  readonly providerKey: string;
  /** Display name (e.g. "Home Depot", "Lowe's"). */
  readonly displayName: string;

  /** Whether this provider is configured and ready to accept requests. */
  isEnabled(): boolean;

  /** Search products by keyword. */
  searchProducts(
    query: string,
    options?: CatalogSearchOptions,
  ): Promise<CatalogSearchResult>;

  /** Get a single product by its provider-specific ID. */
  getProduct(productId: string, zipCode?: string): Promise<CatalogProduct | null>;

  /** Get store-level availability for a product near a ZIP code. */
  getStoreAvailability(
    productId: string,
    zipCode: string,
  ): Promise<StoreAvailability>;
}
