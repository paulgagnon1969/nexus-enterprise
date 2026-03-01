import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

// ── Types ────────────────────────────────────────────────────

export interface NexiFeaturePrint {
  /** Base64-encoded feature print data (~8 KB) */
  data: string;
  /** Number of elements in the feature vector (typically 2048) */
  elementCount: number;
  /** Element type (1 = Float) */
  elementType: number;
}

export interface NexiBatchResult {
  prints: NexiFeaturePrint[];
  errors: string[];
  totalRequested: number;
  totalExtracted: number;
}

export interface NexiCompareResult {
  /** Distance between two prints — lower = more similar */
  distance: number;
}

export interface NexiMatchResult {
  /** Index of best match in the catalog array, or -1 if none */
  bestIndex: number;
  /** Distance to best match, or -1 if none */
  distance: number;
  /** All distances (parallel to catalog input) */
  distances?: number[];
}

export interface NexiIdentifyResult {
  bestIndex: number;
  distance: number;
  /** The extracted query print (base64) — cache this to avoid re-extraction */
  queryPrint: string;
}

// ── Native Module ────────────────────────────────────────────

interface NexusNexiNative {
  extractFeaturePrint(imageUri: string): Promise<NexiFeaturePrint>;
  extractMultipleFeaturePrints(imageUris: string[]): Promise<NexiBatchResult>;
  compareFeaturePrints(a: string, b: string): Promise<NexiCompareResult>;
  findBestMatch(queryPrint: string, catalogPrints: string[]): Promise<NexiMatchResult>;
  identifyFromImage(imageUri: string, catalogPrints: string[]): Promise<NexiIdentifyResult>;
}

let NexusNexi: NexusNexiNative | null = null;

if (Platform.OS === "ios") {
  try {
    NexusNexi = requireNativeModule("NexusNexi") as NexusNexiNative;
  } catch {
    // Module not available (not built with native yet)
  }
}

// ── Public API ───────────────────────────────────────────────

/**
 * Check if NEXI is available on this device.
 * Currently iOS-only (uses Apple Vision framework).
 */
export function isNexiSupported(): boolean {
  return NexusNexi !== null;
}

/**
 * Extract a visual fingerprint from a single image.
 * Returns a compact base64 representation (~8 KB).
 */
export async function extractFeaturePrint(imageUri: string): Promise<NexiFeaturePrint> {
  if (!NexusNexi) throw new Error("NEXI is not available on this platform");
  return NexusNexi.extractFeaturePrint(imageUri);
}

/**
 * Batch-extract fingerprints from multiple images.
 * Used during enrollment — capture 5-10 photos, extract all at once.
 */
export async function extractMultipleFeaturePrints(imageUris: string[]): Promise<NexiBatchResult> {
  if (!NexusNexi) throw new Error("NEXI is not available on this platform");
  return NexusNexi.extractMultipleFeaturePrints(imageUris);
}

/**
 * Compare two feature prints and return their distance.
 * Lower distance = more similar. Thresholds: <5 strong, 5-10 likely, >15 no match.
 */
export async function compareFeaturePrints(a: string, b: string): Promise<NexiCompareResult> {
  if (!NexusNexi) throw new Error("NEXI is not available on this platform");
  return NexusNexi.compareFeaturePrints(a, b);
}

/**
 * Find the best match for a query print against a catalog of prints.
 */
export async function findBestMatch(queryPrint: string, catalogPrints: string[]): Promise<NexiMatchResult> {
  if (!NexusNexi) throw new Error("NEXI is not available on this platform");
  return NexusNexi.findBestMatch(queryPrint, catalogPrints);
}

/**
 * One-shot identify: extract print from image + match against catalog.
 * Avoids the JS round-trip between extract and match.
 */
export async function identifyFromImage(imageUri: string, catalogPrints: string[]): Promise<NexiIdentifyResult> {
  if (!NexusNexi) throw new Error("NEXI is not available on this platform");
  return NexusNexi.identifyFromImage(imageUri, catalogPrints);
}
