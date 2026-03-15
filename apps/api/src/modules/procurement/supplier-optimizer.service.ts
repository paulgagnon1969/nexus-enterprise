import { Injectable, Logger } from '@nestjs/common';
import type { CbaConfig } from './cba-engine.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SupplierProductDetail {
  productId: string;
  title: string;
  modelNumber?: string;
  productUrl?: string;
  pricePerPurchaseUnit: number;
  coveragePerPurchaseUnit?: number;
  purchaseUnit?: string;
  purchaseQty?: number;
  coverageConfidence?: string;
  stockQty?: number;
  inStock?: boolean;
}

export interface ItemPricing {
  cartItemId: string;
  description: string;
  quantity: number;
  /** unitPrice per supplier (keyed by supplierKey). null = not available. */
  supplierPrices: Record<string, number | null>;
  /** Product details per supplier for display in trip plans. */
  supplierProducts?: Record<string, SupplierProductDetail>;
}

export interface SupplierInfo {
  key: string;
  name: string;
  address?: string;
  distanceMiles: number;
  /** LOCAL_PICKUP (default), SHIP_TO_SITE, WILL_CALL */
  fulfillmentType?: string;
  /** Shipping cost for online suppliers. */
  shippingCost?: number;
  /** Whether shipping is free. */
  freeShipping?: boolean;
  /** Estimated delivery lead time in days. */
  leadTimeDays?: number;
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
  /** Shipping cost (0 for local pickup). */
  shippingCost: number;
  /** Lead time penalty (0 for local pickup). */
  leadTimePenalty: number;
  /** How items from this supplier arrive. */
  fulfillmentType: string;
  /** Delivery window (online only). */
  deliveryMinDays?: number;
  deliveryMaxDays?: number;
}

export interface TripPlan {
  /** Number of physical store stops (online orders are NOT counted). */
  stops: number;
  /** Number of parallel online orders in this plan. */
  onlineOrders: number;
  totalCost: number;
  itemCost: number;
  travelCost: number;
  timeCost: number;
  /** Total shipping across online suppliers. */
  shippingCost: number;
  /** Total lead time penalty across online suppliers. */
  leadTimePenalty: number;
  /** Longest delivery wait in the plan (days). 0 for all-local plans. */
  maxLeadTimeDays: number;
  savings: number; // vs. worst plan
  suppliers: TripPlanSupplier[];
  unfulfilledItems: string[]; // cartItemIds not available at any supplier in this plan
}

const DEFAULT_CONFIG: CbaConfig = {
  mileageCostPerMile: 0.70,
  avgTravelSpeedMph: 35,
  crewHourlyRate: 45.0,
  shippingCostDefault: 9.99,
  deliveryPenaltyPerDay: 5.0,
  freeShippingThreshold: 35.0,
};

@Injectable()
export class SupplierOptimizerService {
  private readonly logger = new Logger(SupplierOptimizerService.name);

  /**
   * Find optimal supplier combinations for a set of cart items.
   *
   * Enumerates all subsets of suppliers (1-stop, 2-stop, 3-stop) and assigns
   * each item to the cheapest supplier in the subset. Returns top plans
   * ranked by total cost (item + travel + time).
   *
   * Tractable for ≤5 suppliers (max 26 subsets of size ≤3).
   */
  optimize(
    items: ItemPricing[],
    suppliers: SupplierInfo[],
    config: CbaConfig = DEFAULT_CONFIG,
    maxStops = 3,
    topN = 3,
  ): TripPlan[] {
    if (items.length === 0 || suppliers.length === 0) return [];

    const supplierKeys = suppliers.map((s) => s.key);
    const supplierMap = new Map(suppliers.map((s) => [s.key, s]));

    // Generate all subsets of size 1..maxStops
    const subsets = generateSubsets(supplierKeys, maxStops);

    const plans: TripPlan[] = [];

    for (const subset of subsets) {
      const plan = this.evaluateSubset(
        subset,
        items,
        supplierMap,
        config,
      );
      plans.push(plan);
    }

    // Sort by total cost ascending
    plans.sort((a, b) => a.totalCost - b.totalCost);

    // Calculate savings relative to the most expensive plan
    const worstCost = plans[plans.length - 1]?.totalCost ?? 0;
    for (const p of plans) {
      p.savings = round2(worstCost - p.totalCost);
    }

    return plans.slice(0, topN);
  }

  private evaluateSubset(
    supplierKeys: string[],
    items: ItemPricing[],
    supplierMap: Map<string, SupplierInfo>,
    config: CbaConfig,
  ): TripPlan {
    const supplierItems = new Map<string, TripPlanItem[]>();
    const unfulfilledItems: string[] = [];
    let totalItemCost = 0;

    for (const key of supplierKeys) {
      supplierItems.set(key, []);
    }

    // Assign each item to the cheapest available supplier in the subset
    for (const item of items) {
      let bestKey: string | null = null;
      let bestPrice = Infinity;

      for (const key of supplierKeys) {
        const price = item.supplierPrices[key];
        if (price != null && price < bestPrice) {
          bestPrice = price;
          bestKey = key;
        }
      }

      if (bestKey != null) {
        const lineTotal = round2(bestPrice * item.quantity);
        totalItemCost += lineTotal;
        const productDetail = item.supplierProducts?.[bestKey];
        supplierItems.get(bestKey)!.push({
          cartItemId: item.cartItemId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: bestPrice,
          lineTotal,
          // Product detail passthrough
          productId: productDetail?.productId,
          productTitle: productDetail?.title,
          modelNumber: productDetail?.modelNumber,
          productUrl: productDetail?.productUrl,
          pricePerPurchaseUnit: productDetail?.pricePerPurchaseUnit,
          coveragePerPurchaseUnit: productDetail?.coveragePerPurchaseUnit,
          purchaseUnit: productDetail?.purchaseUnit,
          purchaseQty: productDetail?.purchaseQty,
          coverageConfidence: productDetail?.coverageConfidence,
          stockQty: productDetail?.stockQty,
          inStock: productDetail?.inStock,
        });
      } else {
        unfulfilledItems.push(item.cartItemId);
      }
    }

    // Build supplier summaries (only include suppliers that have items)
    const tripSuppliers: TripPlanSupplier[] = [];
    let totalTravelCost = 0;
    let totalTimeCost = 0;
    let totalShippingCost = 0;
    let totalLeadTimePenalty = 0;
    let maxLeadTimeDays = 0;

    for (const key of supplierKeys) {
      const assignedItems = supplierItems.get(key)!;
      if (assignedItems.length === 0) continue;

      const info = supplierMap.get(key)!;
      const isOnline = info.fulfillmentType === 'SHIP_TO_SITE';

      let travelCost: number;
      let timeCost: number;
      let shippingCost: number;
      let leadTimePenalty: number;

      if (isOnline) {
        // Online supplier: no travel, but shipping + lead time penalty
        travelCost = 0;
        timeCost = 0;
        const supplierSubtotal = round2(assignedItems.reduce((s, i) => s + i.lineTotal, 0));
        if (info.freeShipping || supplierSubtotal >= config.freeShippingThreshold) {
          shippingCost = 0;
        } else {
          shippingCost = info.shippingCost ?? config.shippingCostDefault;
        }
        const leadDays = info.leadTimeDays ?? 3;
        leadTimePenalty = round2(leadDays * config.deliveryPenaltyPerDay);
        maxLeadTimeDays = Math.max(maxLeadTimeDays, leadDays);
      } else {
        // Local supplier: travel + time
        const roundTrip = info.distanceMiles * 2;
        travelCost = round2(roundTrip * config.mileageCostPerMile);
        timeCost = round2(
          (roundTrip / config.avgTravelSpeedMph) * config.crewHourlyRate,
        );
        shippingCost = 0;
        leadTimePenalty = 0;
      }

      totalTravelCost += travelCost;
      totalTimeCost += timeCost;
      totalShippingCost += shippingCost;
      totalLeadTimePenalty += leadTimePenalty;

      tripSuppliers.push({
        key: info.key,
        name: info.name,
        address: info.address,
        distanceMiles: info.distanceMiles,
        items: assignedItems,
        subtotal: round2(assignedItems.reduce((s, i) => s + i.lineTotal, 0)),
        travelCost,
        timeCost,
        shippingCost: round2(shippingCost),
        leadTimePenalty: round2(leadTimePenalty),
        fulfillmentType: info.fulfillmentType ?? 'LOCAL_PICKUP',
        deliveryMinDays: isOnline ? (info.leadTimeDays ?? 1) : undefined,
        deliveryMaxDays: isOnline ? (info.leadTimeDays ?? 5) : undefined,
      });
    }

    // Count physical stops vs. online orders
    const localSuppliers = tripSuppliers.filter((s) => s.fulfillmentType !== 'SHIP_TO_SITE');
    const onlineSuppliers = tripSuppliers.filter((s) => s.fulfillmentType === 'SHIP_TO_SITE');

    return {
      stops: localSuppliers.length,
      onlineOrders: onlineSuppliers.length,
      totalCost: round2(totalItemCost + totalTravelCost + totalTimeCost + totalShippingCost + totalLeadTimePenalty),
      itemCost: round2(totalItemCost),
      travelCost: round2(totalTravelCost),
      timeCost: round2(totalTimeCost),
      shippingCost: round2(totalShippingCost),
      leadTimePenalty: round2(totalLeadTimePenalty),
      maxLeadTimeDays,
      savings: 0, // filled by caller
      suppliers: tripSuppliers,
      unfulfilledItems,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate all subsets of `arr` with size 1..maxSize. */
function generateSubsets(arr: string[], maxSize: number): string[][] {
  const result: string[][] = [];
  const n = arr.length;

  function backtrack(start: number, current: string[]) {
    if (current.length > 0 && current.length <= maxSize) {
      result.push([...current]);
    }
    if (current.length === maxSize) return;

    for (let i = start; i < n; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
