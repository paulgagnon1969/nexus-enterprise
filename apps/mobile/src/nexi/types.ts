// ── NEXI: Nexus Enhanced eXtraction Identifier ───────────────
// Types for the object fingerprint catalog and matching engine.

// ── Catalog Entry ────────────────────────────────────────────

export interface NexiCatalogEntry {
  /** Unique ID for this catalog entry */
  id: string;
  /** Human-readable name, e.g. "Dri-Eaz LGR 3500i" */
  name: string;
  /** Primary category, e.g. "Dehumidifier" */
  category: string;
  /** Subcategory, e.g. "LGR" */
  subcategory: string;
  /** Material descriptor, e.g. "Plastic", "Steel", "Wood" */
  material: string;
  /** Free-form tags for search, e.g. ["equipment", "restoration", "portable"] */
  tags: string[];
  /** Number of feature prints stored for this entry */
  featurePrintCount: number;
  /** URI to the thumbnail image (local file) */
  thumbnailUri: string | null;
  /** URI to USDZ 3D model (if enrolled via Object Capture) */
  modelUri: string | null;
  /** Dimensions from Object Capture or manual entry */
  dimensions: NexiDimensions | null;
  /** How many times this entry has been matched during identification */
  matchCount: number;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
  /** Whether this entry has been synced to the API */
  synced: boolean;
}

export interface NexiDimensions {
  length: number;
  width: number;
  height: number;
  unit: "inches" | "feet" | "meters";
}

// ── Stored Feature Print ─────────────────────────────────────

export interface NexiStoredPrint {
  /** Base64-encoded feature print data */
  data: string;
  /** Source image filename (for debugging) */
  sourceImage: string;
  /** When this print was extracted */
  extractedAt: string;
}

// ── Match Result ─────────────────────────────────────────────

export interface NexiObjectMatch {
  /** The matched catalog entry, or null if no match */
  entry: NexiCatalogEntry | null;
  /** Confidence score 0-100 (100 = perfect match) */
  confidence: number;
  /** Raw distance from Vision feature print comparison */
  distance: number;
  /** Quality tier for UI display */
  tier: "exact" | "strong" | "likely" | "weak" | "none";
}

// ── Thresholds ───────────────────────────────────────────────
// These define how raw distance maps to confidence tiers.
// Calibrate empirically — start conservative, loosen over time.

export const NEXI_THRESHOLDS = {
  /** Distance < EXACT = 95-100% confidence */
  EXACT: 3.0,
  /** Distance < STRONG = 80-95% confidence */
  STRONG: 5.0,
  /** Distance < LIKELY = 60-80% confidence */
  LIKELY: 10.0,
  /** Distance < WEAK = 40-60% confidence */
  WEAK: 15.0,
  /** Distance >= WEAK = no match */
  MAX: 15.0,
} as const;

// ── Category Presets ─────────────────────────────────────────
// Common categories for the enrollment picker.
// Users can also type custom categories.

export const NEXI_CATEGORIES = [
  // Restoration equipment
  "Dehumidifier",
  "Air Mover",
  "Air Scrubber",
  "Moisture Meter",
  "Thermal Camera",
  "Extraction Unit",
  "Heater",
  "Generator",
  // Furniture
  "Chair",
  "Table",
  "Desk",
  "Sofa",
  "Bed",
  "Dresser",
  "Cabinet",
  "Shelf",
  "Bookcase",
  // Appliances
  "Refrigerator",
  "Stove",
  "Oven",
  "Microwave",
  "Dishwasher",
  "Washer",
  "Dryer",
  // Fixtures
  "Light Fixture",
  "Ceiling Fan",
  "Thermostat",
  "Smoke Detector",
  "HVAC Register",
  // Construction
  "Tool",
  "Safety Equipment",
  "Ladder",
  "Scaffold",
  // Other
  "Electronics",
  "Signage",
  "Vehicle",
  "Other",
] as const;

export const NEXI_MATERIALS = [
  "Plastic",
  "Steel",
  "Aluminum",
  "Wood",
  "Glass",
  "Fabric",
  "Leather",
  "Composite",
  "Rubber",
  "Ceramic",
  "Stone",
  "Vinyl",
  "Fiberglass",
  "Carbon Fiber",
  "Other",
] as const;
