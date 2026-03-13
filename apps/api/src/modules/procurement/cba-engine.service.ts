import { Injectable, Logger } from '@nestjs/common';

// ── Config defaults (overridable per company in the future) ──────────────────

export interface CbaConfig {
  /** Cost per mile (IRS 2026 rate). */
  mileageCostPerMile: number;
  /** Average travel speed in urban/suburban areas. */
  avgTravelSpeedMph: number;
  /** Loaded crew hourly rate. */
  crewHourlyRate: number;

  // ── Online supplier parameters ───────────────────────────────────────────

  /** Default shipping cost when provider doesn't report one (USD). */
  shippingCostDefault: number;
  /** Opportunity cost per day of delivery lead time (USD/day). */
  deliveryPenaltyPerDay: number;
  /** Order total above which shipping is assumed free (e.g. Amazon $35). */
  freeShippingThreshold: number;
}

const DEFAULT_CBA_CONFIG: CbaConfig = {
  mileageCostPerMile: 0.70,
  avgTravelSpeedMph: 35,
  crewHourlyRate: 45.0,
  shippingCostDefault: 9.99,
  deliveryPenaltyPerDay: 5.0,
  freeShippingThreshold: 35.0,
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface SupplierPricing {
  supplierKey: string;
  supplierName: string;
  supplierAddress?: string;
  distanceMiles: number;
  unitPrice: number;
  availabilityStatus?: string;
  leadTimeDays?: number;

  // ── Online supplier fields ───────────────────────────────────────────────
  /** Shipping cost in USD (0 = free, undefined = use default). */
  shippingCost?: number;
  /** Whether shipping is free (Prime, freight threshold, etc.). */
  freeShipping?: boolean;
  /** How the item reaches the jobsite. */
  fulfillmentType?: string;
}

export interface CbaResult {
  supplierKey: string;
  supplierName: string;
  supplierAddress?: string;
  distanceMiles: number;
  unitPrice: number;
  totalPrice: number;
  travelCost: number;
  timeCost: number;
  /** Shipping cost for online suppliers (0 for local pickup). */
  shippingCost: number;
  /** Lead time penalty for online delivery (0 for local pickup). */
  leadTimePenalty: number;
  /** Total cost including item price + travel + time + shipping + lead time penalty. */
  allInCost: number;
  /** Net benefit vs. the cheapest single-stop option. */
  netBenefit: number;
  availabilityStatus?: string;
  leadTimeDays?: number;
  fulfillmentType?: string;
}

export interface QuantityRecommendation {
  recommendedQty: number;
  reason: string;
  savingsAtRecommended: number;
}

@Injectable()
export class CbaEngineService {
  private readonly logger = new Logger(CbaEngineService.name);

  /**
   * Score all supplier options for a single cart item.
   * Returns suppliers ranked by all-in cost (lowest first).
   */
  scoreItem(
    quantity: number,
    suppliers: SupplierPricing[],
    config: CbaConfig = DEFAULT_CBA_CONFIG,
  ): CbaResult[] {
    if (suppliers.length === 0) return [];

    const results: CbaResult[] = suppliers.map((s) => {
      const totalPrice = s.unitPrice * quantity;
      const isOnline = s.fulfillmentType === 'SHIP_TO_SITE' || (s.distanceMiles === 0 && s.shippingCost != null);

      let travelCost: number;
      let timeCost: number;
      let shippingCost: number;
      let leadTimePenalty: number;

      if (isOnline) {
        // Online supplier: no travel, but shipping + lead time penalty
        travelCost = 0;
        timeCost = 0;

        // Determine shipping cost
        if (s.freeShipping || totalPrice >= config.freeShippingThreshold) {
          shippingCost = 0;
        } else {
          shippingCost = s.shippingCost ?? config.shippingCostDefault;
        }

        // Lead time penalty: opportunity cost of waiting for delivery
        const leadDays = s.leadTimeDays ?? 3; // default 3 days for online
        leadTimePenalty = leadDays * config.deliveryPenaltyPerDay;
      } else {
        // Local supplier: travel + time, no shipping or lead time penalty
        const roundTripMiles = s.distanceMiles * 2;
        travelCost = roundTripMiles * config.mileageCostPerMile;
        const travelHours = roundTripMiles / config.avgTravelSpeedMph;
        timeCost = travelHours * config.crewHourlyRate;
        shippingCost = 0;
        leadTimePenalty = 0;
      }

      const allInCost = totalPrice + travelCost + timeCost + shippingCost + leadTimePenalty;

      return {
        supplierKey: s.supplierKey,
        supplierName: s.supplierName,
        supplierAddress: s.supplierAddress,
        distanceMiles: s.distanceMiles,
        unitPrice: s.unitPrice,
        totalPrice: round2(totalPrice),
        travelCost: round2(travelCost),
        timeCost: round2(timeCost),
        shippingCost: round2(shippingCost),
        leadTimePenalty: round2(leadTimePenalty),
        allInCost: round2(allInCost),
        netBenefit: 0, // filled below
        availabilityStatus: s.availabilityStatus,
        leadTimeDays: s.leadTimeDays,
        fulfillmentType: s.fulfillmentType,
      };
    });

    // Sort by all-in cost
    results.sort((a, b) => a.allInCost - b.allInCost);

    // Calculate net benefit relative to the MOST EXPENSIVE option
    // (positive = savings vs. worst option)
    const worstCost = results[results.length - 1].allInCost;
    for (const r of results) {
      r.netBenefit = round2(worstCost - r.allInCost);
    }

    return results;
  }

  /**
   * Recommend whether buying more than requested saves money.
   *
   * Compares the per-unit all-in cost at the requested qty vs. a higher qty,
   * factoring in whether the additional units would be used by the project.
   */
  recommendQuantity(
    requestedQty: number,
    remainingProjectNeed: number,
    bestSupplier: SupplierPricing,
    alternativeSupplier: SupplierPricing | null,
    config: CbaConfig = DEFAULT_CBA_CONFIG,
  ): QuantityRecommendation | null {
    if (!alternativeSupplier) return null;

    // Only recommend more if it doesn't exceed project need
    const maxQty = Math.min(remainingProjectNeed, requestedQty * 3);
    if (maxQty <= requestedQty) return null;

    // Calculate savings at double the requested qty from the best supplier
    // vs. the requested qty from the alternative (more expensive per-unit)
    const costAtRequested =
      bestSupplier.unitPrice * requestedQty +
      bestSupplier.distanceMiles * 2 * config.mileageCostPerMile;
    const costAtDouble =
      bestSupplier.unitPrice * Math.min(requestedQty * 2, maxQty) +
      bestSupplier.distanceMiles * 2 * config.mileageCostPerMile;
    const altCost =
      alternativeSupplier.unitPrice * requestedQty +
      alternativeSupplier.distanceMiles * 2 * config.mileageCostPerMile;

    // If buying double from best supplier costs less than buying requested from alt
    const savingsVsAlt = altCost - costAtDouble;
    if (savingsVsAlt <= 0) return null;

    // Per-unit savings check: at least $0.50/unit or 5% savings
    const perUnitSavings =
      alternativeSupplier.unitPrice - bestSupplier.unitPrice;
    const percentSavings = perUnitSavings / alternativeSupplier.unitPrice;

    if (perUnitSavings < 0.5 && percentSavings < 0.05) return null;

    const recommendedQty = Math.min(requestedQty * 2, maxQty);
    const totalSavings = round2(
      perUnitSavings * recommendedQty - (costAtDouble - costAtRequested),
    );

    if (totalSavings <= 0) return null;

    return {
      recommendedQty,
      reason: `$${perUnitSavings.toFixed(2)}/unit cheaper at ${bestSupplier.supplierName}. Buying ${recommendedQty} instead of ${requestedQty} saves $${totalSavings.toFixed(2)} total and covers more of the remaining ${remainingProjectNeed} units needed.`,
      savingsAtRecommended: totalSavings,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
