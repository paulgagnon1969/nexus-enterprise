import { apiJson } from "./client";
import type { FieldPetlItem } from "../types/api";

// ── Types ────────────────────────────────────────────────────────────────────

export type CartStatus = "DRAFT" | "READY" | "IN_PROGRESS" | "COMPLETED";
export type CartHorizon = "TODAY" | "THIS_WEEK" | "TWO_WEEKS" | "CUSTOM";
export type CartItemStatus = "PENDING" | "SOURCED" | "PURCHASED" | "RECEIVED";

export interface ShoppingCart {
  id: string;
  companyId: string;
  projectId: string;
  createdByUserId?: string | null;
  label?: string | null;
  status: CartStatus;
  horizon: CartHorizon;
  horizonDate?: string | null;
  notes?: string | null;
  createdAt: string;
  items?: ShoppingCartItem[];
  _count?: { items: number };
}

export interface ShoppingCartItem {
  id: string;
  cartId: string;
  sowItemId?: string | null;
  costBookItemId?: string | null;
  normalizedKey: string;
  description: string;
  unit?: string | null;
  unitPrice?: number | null;
  projectNeedQty: number;
  cartQty: number;
  recommendedQty?: number | null;
  recommendedReason?: string | null;
  purchasedQty: number;
  status: CartItemStatus;
  bestSupplierKey?: string | null;
  bestSupplierName?: string | null;
  bestUnitPrice?: number | null;
  cbaScore?: number | null;
  pricingSnapshots?: PricingSnapshot[];
  // Unit normalization — coverage-based pricing
  purchaseUnit?: string | null;
  coveragePerPurchaseUnit?: number | null;
  purchaseQty?: number | null;
  effectiveUnitPrice?: number | null;
  coverageConfidence?: string | null;
}

export interface PricingSnapshot {
  id: string;
  supplierKey: string;
  supplierName: string;
  supplierAddress?: string | null;
  distanceMiles?: number | null;
  unitPrice: number;
  totalPrice: number;
  travelCostEstimate?: number | null;
  timeCostEstimate?: number | null;
  netBenefit?: number | null;
  availabilityStatus?: string | null;
  leadTimeDays?: number | null;
  // Unit normalization
  purchaseUnit?: string | null;
  coveragePerPurchaseUnit?: number | null;
  purchaseQty?: number | null;
  normalizedUnitPrice?: number | null;
}

export interface TripPlanItem {
  cartItemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Product detail for display
  productId?: string;
  productTitle?: string;
  modelNumber?: string;
  productUrl?: string;
  pricePerPurchaseUnit?: number;
  coveragePerPurchaseUnit?: number;
  purchaseUnit?: string;
  purchaseQty?: number;
  coverageConfidence?: string;
  stockQty?: number;
  inStock?: boolean;
}

export interface TripPlanSupplier {
  key: string;
  name: string;
  address?: string;
  distanceMiles: number;
  items: TripPlanItem[];
  subtotal: number;
  travelCost: number;
  timeCost: number;
  shippingCost: number;
  leadTimePenalty: number;
  fulfillmentType: string;
}

export interface TripPlan {
  stops: number;
  onlineOrders: number;
  totalCost: number;
  itemCost: number;
  travelCost: number;
  timeCost: number;
  shippingCost: number;
  leadTimePenalty: number;
  maxLeadTimeDays: number;
  savings: number;
  suppliers: TripPlanSupplier[];
  unfulfilledItems: string[];
}

export interface CbaRunResult {
  cartId: string;
  itemsSearched: number;
  tripPlans: TripPlan[];
}

export interface CatalogItem {
  id: string;
  category?: string | null;
  description: string;
  unit?: string | null;
  unitPrice?: number | null;
}

export interface CatalogSearchResult {
  provider: string;
  query: string;
  totalResults: number;
  page: number;
  products: CatalogProduct[];
}

export interface CatalogProduct {
  productId: string;
  provider: string;
  title: string;
  description?: string;
  brand?: string;
  imageUrl?: string;
  productUrl?: string;
  price?: number;
  unit?: string;
  inStock?: boolean;
}

// ── Types (with project context for hub) ─────────────────────────────────────

export interface ShoppingCartWithProject {
  id: string;
  companyId: string;
  projectId: string;
  projectName: string;
  projectCity?: string | null;
  projectState?: string | null;
  label?: string | null;
  status: CartStatus;
  horizon: CartHorizon;
  horizonDate?: string | null;
  notes?: string | null;
  itemCount: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Cart CRUD ────────────────────────────────────────────────────────────────

export function listAllCartsForHub() {
  return apiJson<ShoppingCartWithProject[]>('/procurement/carts/all?includeCompleted=true');
}

export function createCart(body: {
  companyId: string;
  projectId: string;
  label?: string;
  horizon?: CartHorizon;
  notes?: string;
}) {
  return apiJson<ShoppingCart>("/procurement/carts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getCart(cartId: string) {
  return apiJson<ShoppingCart>(`/procurement/carts/${cartId}`);
}

export function listCarts(projectId: string) {
  return apiJson<ShoppingCart[]>(`/procurement/carts?projectId=${encodeURIComponent(projectId)}`);
}

export function deleteCart(cartId: string) {
  return apiJson<void>(`/procurement/carts/${cartId}`, { method: "DELETE" });
}

// ── Cart Items ───────────────────────────────────────────────────────────────

export function addCartItem(
  cartId: string,
  body: {
    sowItemId?: string;
    costBookItemId?: string;
    description: string;
    unit?: string;
    unitPrice?: number;
    projectNeedQty: number;
    cartQty: number;
    roomParticleId?: string;
  },
) {
  return apiJson<ShoppingCartItem>(`/procurement/carts/${cartId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateCartItem(
  cartId: string,
  itemId: string,
  body: Partial<{ cartQty: number; status: CartItemStatus }>,
) {
  return apiJson<ShoppingCartItem>(`/procurement/carts/${cartId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteCartItem(cartId: string, itemId: string) {
  return apiJson<void>(`/procurement/carts/${cartId}/items/${itemId}`, { method: "DELETE" });
}

// ── PETL Population ──────────────────────────────────────────────────────────

export function populateFromPetl(
  cartId: string,
  options?: { roomParticleId?: string; categoryCode?: string },
) {
  return apiJson<{ added: number }>(`/procurement/carts/${cartId}/populate-from-petl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  });
}

// ── CBA + Optimizer ──────────────────────────────────────────────────────────

export function runCba(cartId: string, zipCode?: string) {
  return apiJson<CbaRunResult>(`/procurement/carts/${cartId}/run-cba`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zipCode }),
  });
}

// ── Supplier Catalog Search ──────────────────────────────────────────────────

export function searchSupplierCatalog(query: string, opts?: { provider?: string; zip?: string; page?: number }) {
  const qs = new URLSearchParams({ q: query });
  if (opts?.provider) qs.set("provider", opts.provider);
  if (opts?.zip) qs.set("zip", opts.zip);
  if (opts?.page) qs.set("page", String(opts.page));
  return apiJson<CatalogSearchResult>(`/supplier-catalog/search?${qs}`);
}

// ── Costbook / Catalog Browse ────────────────────────────────────────────────

export function browseCatalog(search?: string, category?: string, limit = 50) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (search) qs.set("search", search);
  if (category) qs.set("category", category);
  return apiJson<{ items: CatalogItem[]; total: number }>(`/supplier-catalog/catalog?${qs}`);
}

// ── PETL Items (re-export for convenience) ───────────────────────────────────

export function fetchPetlItems(projectId: string) {
  return apiJson<{ items: any[] }>(`/projects/${encodeURIComponent(projectId)}/petl-field`);
}

// ── NexBUY: Group Shopping Cart ────────────────────────────────────────────

export interface CartSummary {
  id: string;
  companyId: string;
  projectId: string;
  projectName: string;
  projectCity?: string | null;
  projectState?: string | null;
  label?: string | null;
  status: CartStatus;
  horizon: CartHorizon;
  horizonDate?: string | null;
  notes?: string | null;
  itemCount: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsolidatedAllocation {
  projectId: string;
  projectName: string;
  cartId: string;
  cartLabel: string | null;
  qty: number;
  itemId: string;
}

export interface ConsolidatedLine {
  normalizedKey: string;
  description: string;
  unit: string | null;
  totalQty: number;
  bestKnownPrice: number | null;
  bestSupplierName: string | null;
  purchaseUnit: string | null;
  coveragePerPurchaseUnit: number | null;
  totalPurchaseQty: number | null;
  coverageConfidence: string | null;
  allocations: ConsolidatedAllocation[];
}

export interface ConsolidatedPurchase {
  cartCount: number;
  projectCount: number;
  totalItems: number;
  totalEstimatedCost: number;
  lines: ConsolidatedLine[];
}

export function listAllCarts(status?: string) {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  const query = qs.toString();
  return apiJson<CartSummary[]>(`/procurement/carts/all${query ? `?${query}` : ""}`);
}

export function listAllCartsIncludeCompleted() {
  return apiJson<CartSummary[]>("/procurement/carts/all?includeCompleted=true");
}

export function consolidateCarts(cartIds: string[]) {
  return apiJson<ConsolidatedPurchase>("/procurement/consolidate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartIds }),
  });
}

// ── Drawdown ─────────────────────────────────────────────────────────────────

export function getDrawdown(projectId: string) {
  return apiJson<any[]>(`/procurement/drawdown?projectId=${encodeURIComponent(projectId)}`);
}

// ── NexPRINT: Fingerprint Enrichment ─────────────────────────────────────

export interface PriceHistoryPoint {
  unitPrice: number;
  quantity: number;
  source: string;
  transactionDate: string | null;
  createdAt: string;
}

export interface FingerprintEnrichment {
  fingerprintId: string;
  confidence: string;
  verificationCount: number;
  lastVerifiedAt: string | null;
  coverageValue: number | null;
  coverageUnit: string | null;
  purchaseUnitLabel: string | null;
  sku: string | null;
  priceHistory: PriceHistoryPoint[];
}

/** Batch-enrich CBA items with fingerprint data (confidence + price history). */
export function enrichFingerprints(items: Array<{ supplierKey: string; productId: string }>) {
  return apiJson<Record<string, FingerprintEnrichment>>("/procurement/fingerprints/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}
