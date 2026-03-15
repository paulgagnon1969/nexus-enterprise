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
  /** On-hand stock quantity at nearest store (e.g. 100, null if unknown). */
  stockQty?: number;
  /** Structured availability status for UI display. */
  availabilityStatus?: 'IN_STOCK' | 'SPECIAL_ORDER' | 'ONLINE_ONLY' | 'UNAVAILABLE';
  /** Estimated lead time in days (for special order / ship-to-home items). */
  leadTimeDays?: number;
  /** Average customer rating (e.g. 4.5). */
  rating?: number;

  // ── Online / Delivery fields ──────────────────────────────────────────────

  /** Estimated shipping cost in USD (null for local-pickup items). */
  shippingCost?: number;
  /** Whether the item ships free (e.g. Prime-eligible, free freight). */
  freeShipping?: boolean;
  /** Earliest delivery in calendar days from order. */
  deliveryMinDays?: number;
  /** Latest delivery in calendar days from order. */
  deliveryMaxDays?: number;
  /** Raw delivery estimate text (e.g. "March 15–18"). */
  deliveryEstimate?: string;
  /** Amazon ASIN identifier. */
  asin?: string;
  /** Whether the product is Prime-eligible. */
  isPrime?: boolean;
  /** Quantity break pricing tiers (e.g. pack-of-4 vs pack-of-12). */
  bulkPricing?: Array<{ minQty: number; unitPrice: number }>;
  /** How the item reaches the jobsite. */
  fulfillmentType?: 'LOCAL_PICKUP' | 'SHIP_TO_SITE' | 'WILL_CALL';

  // ── Coverage / Unit Normalization ──────────────────────────────────────────

  /** Total coverage per retail purchase unit (e.g. 40 SF per roll). */
  coverageValue?: number;
  /** Unit of the coverage measure (e.g. "SF", "LF"). */
  coverageUnit?: string;
  /** Human label for the purchase unit (e.g. "roll", "bag", "sheet"). */
  purchaseUnitLabel?: string;

  /** Nearest store name (e.g. "Phoenix #0409"). */
  storeName?: string;
  /** Nearest store street address. */
  storeAddress?: string;
  /** Store city. */
  storeCity?: string;
  /** Store state (2-letter). */
  storeState?: string;
  /** Store ZIP code. */
  storeZip?: string;
  /** Store phone number. */
  storePhone?: string;

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
    availabilityStatus?: 'IN_STOCK' | 'SPECIAL_ORDER' | 'ONLINE_ONLY' | 'UNAVAILABLE';
    leadTimeDays?: number;
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
