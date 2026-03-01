/**
 * matcher.ts — NEXI Object Matching Engine
 *
 * Identifies unknown objects by comparing their visual fingerprint
 * against the NEXI catalog. Uses the native module for feature print
 * extraction and comparison, with an in-memory cache for scan sessions.
 */

import { findBestMatch, identifyFromImage, isNexiSupported } from "../../modules/nexus-nexi";
import type { NexiIdentifyResult } from "../../modules/nexus-nexi";
import { loadAllPrintsFlat, getEntry, incrementMatchCount } from "./catalog";
import type { NexiCatalogEntry, NexiObjectMatch } from "./types";
import { NEXI_THRESHOLDS } from "./types";

// ── In-Memory Cache ──────────────────────────────────────────
// During a scan session, we load all prints once and reuse them.
// Call `warmCache()` at the start of a session, `clearCache()` at the end.

let cachedPrints: Array<{ entryId: string; data: string; printIndex: number }> | null = null;

/**
 * Pre-load all catalog prints into memory for fast matching.
 * Call this at the start of a scan session.
 * Returns the number of prints loaded.
 */
export async function warmCache(): Promise<number> {
  cachedPrints = await loadAllPrintsFlat();
  return cachedPrints.length;
}

/**
 * Clear the in-memory print cache.
 * Call this when leaving a scan session.
 */
export function clearCache(): void {
  cachedPrints = null;
}

/**
 * Check if the cache is loaded.
 */
export function isCacheWarmed(): boolean {
  return cachedPrints !== null && cachedPrints.length > 0;
}

// ── Identification ───────────────────────────────────────────

/**
 * Identify an object from a photo.
 * Takes a photo URI, extracts its fingerprint, and compares against the catalog.
 *
 * If the cache is warmed, uses the cached prints (fast).
 * If not, loads prints on-demand (slower, but works).
 */
export async function identifyObject(imageUri: string): Promise<NexiObjectMatch> {
  if (!isNexiSupported()) {
    return noMatch("NEXI not available on this platform");
  }

  // Ensure we have prints to compare against
  const prints = cachedPrints ?? (await loadAllPrintsFlat());
  if (prints.length === 0) {
    return noMatch("Catalog is empty — enroll objects first");
  }

  // Extract the base64 data array for native comparison
  const catalogData = prints.map((p) => p.data);

  let result: NexiIdentifyResult;
  try {
    result = await identifyFromImage(imageUri, catalogData);
  } catch (err) {
    console.warn("[NEXI] identifyFromImage failed:", err);
    return noMatch("Feature extraction failed");
  }

  if (result.bestIndex < 0) {
    return noMatch("No match found");
  }

  const bestPrint = prints[result.bestIndex];
  const distance = result.distance;

  // Map distance to confidence and tier
  const { confidence, tier } = distanceToConfidence(distance);

  // If below threshold, no match
  if (tier === "none") {
    return {
      entry: null,
      confidence,
      distance,
      tier,
    };
  }

  // Load the full entry
  const entry = await getEntry(bestPrint.entryId);
  if (!entry) {
    return noMatch("Matched entry not found in catalog");
  }

  // Increment match count (fire-and-forget)
  void incrementMatchCount(entry.id);

  return {
    entry,
    confidence,
    distance,
    tier,
  };
}

/**
 * Identify from an already-extracted feature print (avoids re-extraction).
 * Useful when you've already extracted the print during enrollment or a previous match.
 */
export async function identifyFromPrint(queryPrintBase64: string): Promise<NexiObjectMatch> {
  if (!isNexiSupported()) {
    return noMatch("NEXI not available on this platform");
  }

  const prints = cachedPrints ?? (await loadAllPrintsFlat());
  if (prints.length === 0) {
    return noMatch("Catalog is empty");
  }

  const catalogData = prints.map((p) => p.data);

  let result;
  try {
    result = await findBestMatch(queryPrintBase64, catalogData);
  } catch (err) {
    console.warn("[NEXI] findBestMatch failed:", err);
    return noMatch("Matching failed");
  }

  if (result.bestIndex < 0) {
    return noMatch("No match found");
  }

  const bestPrint = prints[result.bestIndex];
  const { confidence, tier } = distanceToConfidence(result.distance);

  if (tier === "none") {
    return { entry: null, confidence, distance: result.distance, tier };
  }

  const entry = await getEntry(bestPrint.entryId);
  if (!entry) return noMatch("Entry not found");

  void incrementMatchCount(entry.id);
  return { entry, confidence, distance: result.distance, tier };
}

// ── Confidence Mapping ───────────────────────────────────────

function distanceToConfidence(distance: number): { confidence: number; tier: NexiObjectMatch["tier"] } {
  if (distance < NEXI_THRESHOLDS.EXACT) {
    // 95-100%
    const t = distance / NEXI_THRESHOLDS.EXACT;
    return { confidence: Math.round(100 - t * 5), tier: "exact" };
  }
  if (distance < NEXI_THRESHOLDS.STRONG) {
    // 80-95%
    const t = (distance - NEXI_THRESHOLDS.EXACT) / (NEXI_THRESHOLDS.STRONG - NEXI_THRESHOLDS.EXACT);
    return { confidence: Math.round(95 - t * 15), tier: "strong" };
  }
  if (distance < NEXI_THRESHOLDS.LIKELY) {
    // 60-80%
    const t = (distance - NEXI_THRESHOLDS.STRONG) / (NEXI_THRESHOLDS.LIKELY - NEXI_THRESHOLDS.STRONG);
    return { confidence: Math.round(80 - t * 20), tier: "likely" };
  }
  if (distance < NEXI_THRESHOLDS.WEAK) {
    // 40-60%
    const t = (distance - NEXI_THRESHOLDS.LIKELY) / (NEXI_THRESHOLDS.WEAK - NEXI_THRESHOLDS.LIKELY);
    return { confidence: Math.round(60 - t * 20), tier: "weak" };
  }
  return { confidence: 0, tier: "none" };
}

function noMatch(reason?: string): NexiObjectMatch {
  if (reason) console.log(`[NEXI] ${reason}`);
  return { entry: null, confidence: 0, distance: -1, tier: "none" };
}
