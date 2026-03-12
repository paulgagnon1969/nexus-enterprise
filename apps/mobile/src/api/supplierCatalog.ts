import { apiJson } from "./client";

// ---------------------------------------------------------------------------
// Types (mirrored from apps/api catalog-provider.interface.ts)
// ---------------------------------------------------------------------------

export type AvailabilityStatus =
  | "IN_STOCK"
  | "SPECIAL_ORDER"
  | "ONLINE_ONLY"
  | "UNAVAILABLE";

export interface CatalogProduct {
  productId: string;
  provider: string;
  title: string;
  description?: string;
  brand?: string;
  modelNumber?: string;
  upc?: string;
  storeSku?: string;
  imageUrl?: string;
  productUrl?: string;

  price?: number;
  wasPrice?: number;
  unit?: string;

  aisle?: string;
  inStock?: boolean;
  availabilityStatus?: AvailabilityStatus;
  leadTimeDays?: number;
  rating?: number;

  storeName?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  storeZip?: string;
  storePhone?: string;

  inferredCatCode?: string;
}

export interface CatalogSearchResult {
  provider: string;
  query: string;
  totalResults: number;
  page: number;
  products: CatalogProduct[];
}

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
    availabilityStatus?: AvailabilityStatus;
    leadTimeDays?: number;
  }>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Search all enabled providers (basic — no BigBox enrichment). */
export async function searchCatalog(
  query: string,
  zipCode?: string,
  page?: number,
): Promise<CatalogSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (zipCode) params.set("zip", zipCode);
  if (page) params.set("page", String(page));
  return apiJson<CatalogSearchResult[]>(
    `/supplier-catalog/search/all?${params}`,
  );
}

/**
 * Search all providers WITH BigBox enrichment for HD results.
 * Returns localized pricing, availability status, aisle, and lead times.
 * This is the preferred method for consumer-facing product search.
 */
export async function searchWithAvailability(
  query: string,
  zipCode?: string,
  topN?: number,
): Promise<CatalogSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (zipCode) params.set("zip", zipCode);
  if (topN) params.set("topN", String(topN));
  return apiJson<CatalogSearchResult[]>(
    `/supplier-catalog/search/enriched?${params}`,
  );
}

/** Get a single product by provider + product ID. */
export async function getProductDetail(
  provider: string,
  productId: string,
  zipCode?: string,
): Promise<CatalogProduct> {
  const params = new URLSearchParams({ provider, id: productId });
  if (zipCode) params.set("zip", zipCode);
  return apiJson<CatalogProduct>(`/supplier-catalog/product?${params}`);
}

/** Check in-store availability for a product near a ZIP code. */
export async function getAvailability(
  provider: string,
  productId: string,
  zipCode: string,
): Promise<StoreAvailability> {
  const params = new URLSearchParams({ provider, id: productId, zip: zipCode });
  return apiJson<StoreAvailability>(`/supplier-catalog/availability?${params}`);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Human-readable availability label for display. */
export function availabilityLabel(product: CatalogProduct): string {
  switch (product.availabilityStatus) {
    case "IN_STOCK": {
      const store = product.storeName ? ` at ${product.storeName}` : "";
      return `In Stock${store}`;
    }
    case "SPECIAL_ORDER": {
      const days = product.leadTimeDays;
      return days ? `Special Order — est. ${days} days` : "Special Order";
    }
    case "ONLINE_ONLY":
      return "Online Only";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      // Fall back to boolean inStock
      if (product.inStock === true) return "In Stock";
      if (product.inStock === false) return "Out of Stock";
      return "Check Availability";
  }
}

/** Availability status color for badges. */
export function availabilityColor(
  status?: AvailabilityStatus | null,
): string {
  switch (status) {
    case "IN_STOCK":
      return "#22c55e"; // green
    case "SPECIAL_ORDER":
      return "#f59e0b"; // amber
    case "ONLINE_ONLY":
      return "#3b82f6"; // blue
    case "UNAVAILABLE":
      return "#9ca3af"; // gray
    default:
      return "#9ca3af";
  }
}

/** Provider brand color. */
export function providerColor(provider: string): string {
  switch (provider) {
    case "homedepot":
      return "#F96302"; // HD orange
    case "lowes":
      return "#004990"; // Lowe's blue
    default:
      return "#6b7280";
  }
}

/** Provider display name. */
export function providerDisplayName(provider: string): string {
  switch (provider) {
    case "homedepot":
      return "Home Depot";
    case "lowes":
      return "Lowe's";
    default:
      return provider;
  }
}
