// ---------------------------------------------------------------------------
// Coverage Extractor — Unit Normalization for Procurement Pricing
// ---------------------------------------------------------------------------
//
// Extracts coverage/yield per purchase unit from supplier catalog products.
// Three-tier strategy:
//   1. Spec-sheet match (rawJson.specifications) — highest confidence
//   2. Title dimension parsing — medium confidence
//   3. Material-type heuristics — lowest confidence
//
// When coverage is resolved, the CBA pipeline uses:
//   purchaseQty      = ceil(projectQty / coverageValue)
//   totalCost        = purchaseQty × productPrice
//   effectiveUnitPrice = productPrice / coverageValue  ($/project-unit)
// ---------------------------------------------------------------------------

import type { CatalogProduct } from '../supplier-catalog/catalog-provider.interface';

// ── Public Types ─────────────────────────────────────────────────────────────

export type CoverageConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CoverageSource = 'SPEC_SHEET' | 'TITLE_PARSE' | 'HEURISTIC';

export interface CoverageInfo {
  /** How much of the project unit one retail purchase unit covers (e.g. 40 SF/roll). */
  coverageValue: number;
  /** Unit of the coverage measure — should match or convert to the project unit. */
  coverageUnit: string;
  /** What you buy at the store (roll, bag, sheet, each, bundle, gallon, …). */
  purchaseUnitLabel: string;
  confidence: CoverageConfidence;
  source: CoverageSource;
}

export interface NormalizedPricing {
  /** Number of purchase units needed: ceil(projectQty / coverageValue). */
  purchaseQty: number;
  /** Product price per purchase unit (the catalog price). */
  pricePerPurchaseUnit: number;
  /** Effective price per project unit: productPrice / coverageValue. */
  effectiveUnitPrice: number;
  /** Total cost: purchaseQty × pricePerPurchaseUnit. */
  totalCost: number;
  /** Coverage info used. */
  coverage: CoverageInfo;
}

// ── Unit Conversion ──────────────────────────────────────────────────────────

/** Canonical unit aliases → standard key. */
const UNIT_ALIASES: Record<string, string> = {
  sf: 'SF', 'sq ft': 'SF', 'sqft': 'SF', 'sq. ft.': 'SF', 'sq. ft': 'SF',
  'square feet': 'SF', 'square foot': 'SF',
  lf: 'LF', 'lin ft': 'LF', 'linft': 'LF', 'lin. ft.': 'LF', 'lin. ft': 'LF',
  'linear feet': 'LF', 'linear foot': 'LF', ft: 'LF', feet: 'LF', foot: 'LF',
  sy: 'SY', 'sq yd': 'SY', 'sq. yd.': 'SY', 'square yard': 'SY', 'square yards': 'SY',
  sq: 'SQ', square: 'SQ', squares: 'SQ',
  ea: 'EA', each: 'EA', pc: 'EA', pcs: 'EA', piece: 'EA', pieces: 'EA',
  gal: 'GAL', gallon: 'GAL', gallons: 'GAL',
  cf: 'CF', 'cu ft': 'CF', 'cubic feet': 'CF', 'cubic foot': 'CF',
  cy: 'CY', 'cu yd': 'CY', 'cubic yard': 'CY', 'cubic yards': 'CY',
  bf: 'BF', 'board feet': 'BF', 'board foot': 'BF',
};

/** Conversion factors: fromUnit → toUnit → multiplier (multiply fromQty by factor to get toQty). */
const CONVERSIONS: Record<string, Record<string, number>> = {
  SF: { SY: 1 / 9, SQ: 1 / 100 },
  SY: { SF: 9, SQ: 9 / 100 },
  SQ: { SF: 100, SY: 100 / 9 },
  LF: { LF: 1 },
  CF: { CY: 1 / 27 },
  CY: { CF: 27 },
};

/** Normalize a raw unit string to a canonical key. */
export function normalizeUnit(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[lower] ?? raw.toUpperCase();
}

/**
 * Convert a quantity from one unit to another.
 * Returns null if no conversion path exists.
 */
export function convertProjectUnit(
  fromUnit: string,
  toUnit: string,
  qty: number,
): number | null {
  if (fromUnit === toUnit) return qty;
  const factor = CONVERSIONS[fromUnit]?.[toUnit];
  if (factor != null) return qty * factor;
  // Try reverse
  const reverse = CONVERSIONS[toUnit]?.[fromUnit];
  if (reverse != null) return qty / reverse;
  return null;
}

// ── Tier 1: Spec-Sheet Parsing ───────────────────────────────────────────────

/** Known spec keys that directly report coverage area. */
const COVERAGE_SPEC_KEYS = [
  'coverage area (sq. ft.)',
  'coverage area',
  'coverage (sq. ft.)',
  'coverage',
  'approximate coverage area (sq. ft.)',
  'sq. ft. per roll',
  'sq ft per roll',
  'square feet per roll',
  'coverage per roll',
];

const WIDTH_SPEC_KEYS = [
  'product width (in.)',
  'product width',
  'actual product width (in.)',
  'width (in.)',
  'width',
  'nominal width (in.)',
  'roll width (in.)',
  'individual batt width (in.)',
  'individual batt width',
];

const LENGTH_SPEC_KEYS = [
  'product length (ft.)',
  'product length',
  'actual product length (ft.)',
  'length (ft.)',
  'length',
  'roll length (ft.)',
  'product length (in.)',
  'individual batt length (in.)',
  'individual batt length (ft.)',
  'individual batt length',
];

const PACKAGE_QTY_KEYS = [
  'package quantity',
  'number of pieces',
  'pieces per package',
  'quantity',
  'count',
  'pieces',
  'number in package',
  'pack size',
  'number of batts',
  'batts per bag',
];

/** Combined dimension specs (value is "W x L" string to parse). */
const COMBINED_DIM_KEYS = [
  'batt/roll size',
  'product size',
  'batt size',
  'roll size',
  'sheet size',
  'panel size',
  'tile size',
];

/** Parse a number from a spec value string like "40.0", "32 ft", "15 in". */
function parseSpecNum(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const s = String(val).replace(/,/g, '');
  const m = s.match(/^[\s]*([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/** Check if a spec value's unit indicates inches vs feet. */
function specValueIsInches(key: string, val: string): boolean {
  const lower = key.toLowerCase() + ' ' + String(val).toLowerCase();
  return /\bin\.?\b|\binch(es)?\b/.test(lower) && !/\bft\.?\b|\bfeet\b|\bfoot\b/.test(lower);
}

function specValueIsFeet(key: string, val: string): boolean {
  const lower = key.toLowerCase() + ' ' + String(val).toLowerCase();
  return /\bft\.?\b|\bfeet\b|\bfoot\b/.test(lower);
}

/**
 * Look up a spec value from the specifications object (case-insensitive).
 * Handles three formats returned by SerpAPI / BigBox:
 *   - Grouped array: [{ key: "Details", value: [{ name, value }, ...] }]
 *   - Flat array: [{ name, value }]
 *   - Object: { key: value }
 */
function findSpec(specs: any, keys: string[]): string | null {
  if (!specs) return null;

  // Flatten all formats into [{name, value}] entries
  const entries: Array<{ name: string; value: any }> = [];

  if (Array.isArray(specs)) {
    for (const item of specs) {
      if (Array.isArray(item.value)) {
        // Grouped format: { key: "Details", value: [{name, value}, ...] }
        for (const sub of item.value) {
          entries.push({ name: String(sub.name ?? sub.key ?? ''), value: sub.value });
        }
      } else {
        // Flat format: { name: "Coverage Area", value: "40" }
        entries.push({ name: String(item.name ?? item.key ?? ''), value: item.value });
      }
    }
  } else if (typeof specs === 'object') {
    // Object format: { "Coverage Area": "40" }
    for (const [k, v] of Object.entries(specs)) {
      entries.push({ name: k, value: v });
    }
  }

  // Search entries (case-insensitive)
  for (const entry of entries) {
    const name = entry.name.toLowerCase().trim();
    for (const k of keys) {
      if (name === k || name.includes(k)) {
        return String(entry.value ?? '');
      }
    }
  }

  return null;
}

function extractFromSpecs(product: CatalogProduct): CoverageInfo | null {
  const specs = product.rawJson?.specifications;
  if (!specs) return null;

  // 1. Direct coverage area field
  for (const key of COVERAGE_SPEC_KEYS) {
    const val = findSpec(specs, [key]);
    const num = parseSpecNum(val);
    if (num && num > 0) {
      return {
        coverageValue: num,
        coverageUnit: 'SF',
        purchaseUnitLabel: inferPurchaseUnit(product.title),
        confidence: 'HIGH',
        source: 'SPEC_SHEET',
      };
    }
  }

  // 2. Width × Length → area
  const widthRaw = findSpec(specs, WIDTH_SPEC_KEYS);
  const lengthRaw = findSpec(specs, LENGTH_SPEC_KEYS);
  if (widthRaw && lengthRaw) {
    let widthFt = parseSpecNum(widthRaw);
    let lengthFt = parseSpecNum(lengthRaw);
    if (widthFt && lengthFt) {
      // Determine units — width is usually in inches, length in feet
      if (specValueIsInches(WIDTH_SPEC_KEYS[0], widthRaw) || widthFt > 4) {
        widthFt = widthFt / 12; // Convert inches to feet
      }
      // Check if length is actually in inches (batts)
      const lengthKey = LENGTH_SPEC_KEYS.find(k => findSpec(specs, [k]) === lengthRaw) ?? '';
      if (specValueIsInches(lengthKey, lengthRaw) || (lengthFt <= 12 && !specValueIsFeet(lengthKey, lengthRaw))) {
        // Ambiguous small number — check if key says inches
        if (specValueIsInches(lengthKey, lengthRaw)) {
          lengthFt = lengthFt / 12;
        }
        // If length <= 12 and not explicitly feet, might be feet already for sheets
      }

      const area = widthFt * lengthFt;
      if (area > 0.5 && area < 10000) {
        // Check for package quantity multiplier
        const pkgQtyRaw = findSpec(specs, PACKAGE_QTY_KEYS);
        const pkgQty = parseSpecNum(pkgQtyRaw);
        const totalCoverage = pkgQty && pkgQty > 1 ? area * pkgQty : area;

        return {
          coverageValue: Math.round(totalCoverage * 100) / 100,
          coverageUnit: 'SF',
          purchaseUnitLabel: inferPurchaseUnit(product.title),
          confidence: 'HIGH',
          source: 'SPEC_SHEET',
        };
      }
    }
  }

  // 2b. Combined dimension spec (e.g., "Batt/Roll Size: 4 ft. x 16 in.")
  const combinedDim = findSpec(specs, COMBINED_DIM_KEYS);
  if (combinedDim) {
    const parsed = parseTitleDimensions(combinedDim);
    if (parsed && parsed.dims.length >= 2) {
      let area = parsed.dims[0] * parsed.dims[1];
      const pkgQtyRaw2 = findSpec(specs, PACKAGE_QTY_KEYS);
      const pkgQty2 = parseSpecNum(pkgQtyRaw2);
      if (pkgQty2 && pkgQty2 > 1) area *= pkgQty2;

      if (area > 0.5 && area < 10000) {
        return {
          coverageValue: Math.round(area * 100) / 100,
          coverageUnit: 'SF',
          purchaseUnitLabel: inferPurchaseUnit(product.title),
          confidence: 'HIGH',
          source: 'SPEC_SHEET',
        };
      }
    }
  }

  // 3. Package quantity only — no coverage area found in specs.
  //    Fall through to tier 2 (title parse) which will pick up pack count.
  return null;
}

// ── Tier 2: Title Dimension Parsing ──────────────────────────────────────────

/**
 * Dimension patterns found in product titles. Groups capture:
 *   $1 = first dimension number
 *   $2 = first dimension unit (in/ft/")
 *   $3 = second dimension number
 *   $4 = second dimension unit
 *   $5 = optional third dimension number
 *   $6 = optional third dimension unit
 */

interface ParsedDimensions {
  /** All dimensions normalized to feet. */
  dims: number[];
  /** Raw values for debugging. */
  raw: string;
}

/** Parse "15 in" or "32 ft" or "4'" or '1/2"' into feet. */
function parseDimValue(numStr: string, unitStr: string): number | null {
  // Handle fractions like "1/2"
  let val: number;
  const fractionMatch = numStr.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    val = parseInt(fractionMatch[1]) / parseInt(fractionMatch[2]);
  } else {
    val = parseFloat(numStr);
  }
  if (isNaN(val)) return null;

  const u = unitStr.toLowerCase().replace(/\./g, '');
  if (/^(in|inch|inches|"|″|'')$/.test(u) || u === '') {
    // Check context — if no unit given and value > 24, likely inches (insulation width, etc.)
    return val / 12;
  }
  if (/^(ft|feet|foot|'|′)$/.test(u)) {
    return val;
  }
  // Ambiguous — assume inches if small, feet if larger
  return val <= 48 ? val / 12 : val;
}

// Regex: matches patterns like "15 in. x 32 ft.", "4' x 8'", "2 in x 4 in x 8 ft", "16 by 96"
const DIM_PATTERN =
  /(\d+(?:\/\d+)?(?:\.\d+)?)\s*(in\.?|inch(?:es)?|ft\.?|feet|foot|"|'|″|′)?\s*(?:[xX×]|\bby\b)\s*(\d+(?:\/\d+)?(?:\.\d+)?)\s*(in\.?|inch(?:es)?|ft\.?|feet|foot|"|'|″|′)?(?:\s*(?:[xX×]|\bby\b)\s*(\d+(?:\/\d+)?(?:\.\d+)?)\s*(in\.?|inch(?:es)?|ft\.?|feet|foot|"|'|″|′)?)?/;

function parseTitleDimensions(title: string): ParsedDimensions | null {
  const m = title.match(DIM_PATTERN);
  if (!m) return null;

  const dims: number[] = [];

  // For dimension patterns, infer unit context:
  // - If second dim has a unit, first dim without unit inherits it
  // - Common pattern: "15 in. x 32 ft." (width in inches, length in feet)
  const unit1 = m[2] || '';
  const unit2 = m[4] || '';
  const unit3 = m[6] || '';

  // Determine units with fallback logic
  const resolvedUnit1 = unit1 || unit2 || 'in';
  const resolvedUnit2 = unit2 || unit1 || 'in';

  const d1 = parseDimValue(m[1], resolvedUnit1);
  const d2 = parseDimValue(m[3], resolvedUnit2);
  if (d1 != null) dims.push(d1);
  if (d2 != null) dims.push(d2);

  if (m[5]) {
    const resolvedUnit3 = unit3 || unit2 || 'ft';
    const d3 = parseDimValue(m[5], resolvedUnit3);
    if (d3 != null) dims.push(d3);
  }

  return dims.length >= 2 ? { dims, raw: m[0] } : null;
}

/**
 * Extract explicit total coverage stated directly in the product title.
 * Examples:
 *   - "Square Footage of 1173.4 FT"
 *   - "covers 40 sq ft"
 *   - "(40 sq. ft.)"
 *
 * The extracted value is treated as coverage for the full listing at the
 * listed price (e.g., a multi-bag bundle).
 */
function extractExplicitCoverageFromTitle(title: string): number | null {
  const patterns: RegExp[] = [
    /square\s*footage\s+(?:of\s+)?([\d,]+(?:\.\d+)?)/i,
    /covers?\s+([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|SF|square\s*feet)/i,
    /total\s*(?:coverage|area)[:\s]+([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|SF|square\s*feet)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|SF|square\s*feet)\s+total/i,
    /\(([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|SF)\)/i,
  ];

  for (const pattern of patterns) {
    const m = title.match(pattern);
    if (!m) continue;
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (value >= 5 && value <= 50000) {
      return value;
    }
  }
  return null;
}

/**
 * Extract pack/bundle count from title.
 * Examples:
 *   - "a Total of 10 Bags"
 *   - "(10-Pack)"
 *   - "Pack of 6"
 */
function extractPackCountFromTitle(title: string): number | null {
  const patterns: RegExp[] = [
    /total\s+of\s+(\d+)\s*(?:bags?|rolls?|batts?|pieces?|packs?|sheets?|bundles?)/i,
    /\((\d+)[- ]?(?:pack|pk|ct|count)\)/i,
    /\b(\d+)[- ](?:pack|pk|count|ct)\b/i,
    /(?:pack|set|box|case)\s+of\s+(\d+)/i,
  ];

  for (const pattern of patterns) {
    const m = title.match(pattern);
    if (!m) continue;
    const value = parseInt(m[1]);
    if (value >= 2 && value <= 1000) {
      return value;
    }
  }
  return null;
}

/** Detect material type from title for coverage interpretation. */
type MaterialType = 'insulation' | 'drywall' | 'plywood' | 'lumber' | 'roofing' | 'flooring' | 'unknown';

function detectMaterialType(title: string): MaterialType {
  const t = title.toLowerCase();
  if (/\b(insulation|batt|r-?\d+|fiberglass|mineral wool|rockwool|faced|unfaced|kraft)\b/.test(t)) return 'insulation';
  if (/\b(drywall|gypsum|sheetrock|wallboard|cement board|backer\s*board|durock|hardie)\b/.test(t)) return 'drywall';
  if (/\b(plywood|osb|sheathing|oriented strand|cdx|rtd)\b/.test(t)) return 'plywood';
  if (/\b(lumber|stud|board|2\s*x\s*\d|1\s*x\s*\d|4\s*x\s*4|6\s*x\s*6|treated|pressure.treated|kiln.dried)\b/.test(t)) return 'lumber';
  if (/\b(shingle|roofing|ridge\s*cap|underlayment|felt|ice.+water)\b/.test(t)) return 'roofing';
  if (/\b(flooring|tile|plank|vinyl|laminate|hardwood)\b/.test(t)) return 'flooring';
  return 'unknown';
}

function extractFromTitle(product: CatalogProduct): CoverageInfo | null {
  const title = product.title ?? '';

  // Priority 1: explicit total coverage stated in listing title.
  // This should win over dimension math for bundle listings.
  const explicitSF = extractExplicitCoverageFromTitle(title);
  if (explicitSF) {
    const packCount = extractPackCountFromTitle(title);
    return {
      coverageValue: explicitSF,
      coverageUnit: 'SF',
      purchaseUnitLabel: packCount && packCount > 1 ? 'package' : inferPurchaseUnit(title),
      confidence: 'HIGH',
      source: 'TITLE_PARSE',
    };
  }

  // Priority 2: infer coverage from dimensions.
  const parsed = parseTitleDimensions(title);
  if (!parsed) return null;

  const matType = detectMaterialType(title);
  const { dims } = parsed;

  // Check specs for package quantity to multiply (fall back to title pack count)
  const specs = product.rawJson?.specifications;
  const pkgQtyRaw = specs ? findSpec(specs, PACKAGE_QTY_KEYS) : null;
  const pkgQty = parseSpecNum(pkgQtyRaw) ?? extractPackCountFromTitle(title);

  switch (matType) {
    case 'insulation': {
      // Insulation: width (in) × length (ft or in) = SF per roll/batt
      // dims are already in feet
      if (dims.length >= 2) {
        let coverage = dims[0] * dims[1]; // width_ft × length_ft = SF
        // For batts (short lengths), multiply by package quantity
        if (pkgQty && pkgQty > 1 && dims[1] < 10) {
          coverage *= pkgQty;
        }
        if (coverage > 0.5) {
          const isRoll = /\broll\b/i.test(title);
          const isBatt = /\bbatt\b/i.test(title);
          return {
            coverageValue: Math.round(coverage * 100) / 100,
            coverageUnit: 'SF',
            purchaseUnitLabel: isRoll ? 'roll' : isBatt ? 'bag' : 'package',
            confidence: 'MEDIUM',
            source: 'TITLE_PARSE',
          };
        }
      }
      break;
    }

    case 'drywall':
    case 'plywood': {
      // Sheet goods: width (ft) × height (ft) = SF per sheet
      if (dims.length >= 2) {
        // For sheet goods, dimensions are typically 4ft × 8ft, 4ft × 12ft
        const coverage = dims[0] * dims[1];
        if (coverage > 4 && coverage < 200) {
          return {
            coverageValue: Math.round(coverage * 100) / 100,
            coverageUnit: 'SF',
            purchaseUnitLabel: 'sheet',
            confidence: 'MEDIUM',
            source: 'TITLE_PARSE',
          };
        }
      }
      break;
    }

    case 'lumber': {
      // Lumber: the last dimension is typically length in feet
      // e.g., "2 in x 4 in x 8 ft" → 8 LF per piece
      if (dims.length >= 3) {
        const lengthFt = dims[2]; // Last dim = length
        if (lengthFt >= 4 && lengthFt <= 24) {
          return {
            coverageValue: lengthFt,
            coverageUnit: 'LF',
            purchaseUnitLabel: 'piece',
            confidence: 'MEDIUM',
            source: 'TITLE_PARSE',
          };
        }
      } else if (dims.length === 2) {
        // "2x4 8ft" or similar — second dim might be length
        const lengthFt = Math.max(dims[0], dims[1]);
        if (lengthFt >= 4 && lengthFt <= 24) {
          return {
            coverageValue: lengthFt,
            coverageUnit: 'LF',
            purchaseUnitLabel: 'piece',
            confidence: 'LOW',
            source: 'TITLE_PARSE',
          };
        }
      }
      break;
    }

    case 'flooring': {
      // Flooring: usually sold per box with SF coverage — let specs handle it
      // Title might say "25.03 sq. ft. per case"
      const sfMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|SF)\s*(?:per|\/)\s*(?:case|box|carton|package)/i);
      if (sfMatch) {
        return {
          coverageValue: parseFloat(sfMatch[1]),
          coverageUnit: 'SF',
          purchaseUnitLabel: 'case',
          confidence: 'MEDIUM',
          source: 'TITLE_PARSE',
        };
      }
      break;
    }

    default:
      break;
  }

  return null;
}

// ── Tier 3: Material-Type Heuristics ─────────────────────────────────────────

function extractFromHeuristics(product: CatalogProduct, projectUnit: string | null): CoverageInfo | null {
  const title = (product.title ?? '').toLowerCase();
  const normUnit = normalizeUnit(projectUnit);

  // Roofing shingles: 3 bundles = 1 square (100 SF)
  if (/\b(shingle|ridge\s*cap)\b/.test(title) && /\bbundle\b/.test(title)) {
    return {
      coverageValue: normUnit === 'SQ' ? 1 / 3 : 33.33,
      coverageUnit: normUnit === 'SQ' ? 'SQ' : 'SF',
      purchaseUnitLabel: 'bundle',
      confidence: 'LOW',
      source: 'HEURISTIC',
    };
  }

  // Paint — gallons
  if (/\b(paint|primer|stain|sealer)\b/.test(title) && /\b(gal|gallon)\b/.test(title)) {
    return {
      coverageValue: 350,
      coverageUnit: 'SF',
      purchaseUnitLabel: 'gallon',
      confidence: 'LOW',
      source: 'HEURISTIC',
    };
  }

  // Concrete mix bags (60lb or 80lb)
  if (/\bconcrete\s*mix\b/.test(title)) {
    const is80 = /80\s*lb/.test(title);
    return {
      coverageValue: is80 ? 0.6 : 0.45,
      coverageUnit: 'CF',
      purchaseUnitLabel: 'bag',
      confidence: 'LOW',
      source: 'HEURISTIC',
    };
  }

  // Mortar/thinset bags
  if (/\b(mortar|thinset|grout)\b/.test(title) && /\b(lb|bag)\b/.test(title)) {
    return {
      coverageValue: 95,
      coverageUnit: 'SF',
      purchaseUnitLabel: 'bag',
      confidence: 'LOW',
      source: 'HEURISTIC',
    };
  }

  // Caulk tubes
  if (/\b(caulk|sealant|adhesive)\b/.test(title) && /\b(oz|tube|cartridge)\b/.test(title)) {
    return {
      coverageValue: 12,
      coverageUnit: 'LF',
      purchaseUnitLabel: 'tube',
      confidence: 'LOW',
      source: 'HEURISTIC',
    };
  }

  return null;
}

// ── Purchase Unit Inference ──────────────────────────────────────────────────

function inferPurchaseUnit(title: string | undefined): string {
  if (!title) return 'each';
  const t = title.toLowerCase();
  if (/\broll\b/.test(t)) return 'roll';
  if (/\bbatt\b/.test(t)) return 'bag';
  if (/\bsheet\b/.test(t)) return 'sheet';
  if (/\bbundle\b/.test(t)) return 'bundle';
  if (/\bcase\b|\bbox\b|\bcarton\b/.test(t)) return 'case';
  if (/\bgal(lon)?\b/.test(t)) return 'gallon';
  if (/\bbag\b|\bsack\b/.test(t)) return 'bag';
  if (/\bbucket\b|\bpail\b/.test(t)) return 'bucket';
  if (/\btube\b|\bcartridge\b/.test(t)) return 'tube';
  if (/\bpack\b|\bpk\b/.test(t)) return 'pack';
  if (/\bboard\b|\bpanel\b|\bpiece\b/.test(t)) return 'piece';
  return 'each';
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Extract coverage/yield information from a catalog product.
 * Returns null if coverage cannot be determined.
 */
export function extractCoverage(
  product: CatalogProduct,
  projectUnit?: string | null,
): CoverageInfo | null {
  // Tier 1: Spec-sheet (highest confidence)
  const fromSpecs = extractFromSpecs(product);
  if (fromSpecs) return fromSpecs;

  // Tier 2: Title dimension parsing
  const fromTitle = extractFromTitle(product);
  if (fromTitle) return fromTitle;

  // Tier 3: Material heuristics (lowest confidence)
  const fromHeuristics = extractFromHeuristics(product, projectUnit ?? null);
  if (fromHeuristics) return fromHeuristics;

  return null;
}

/**
 * Given a catalog product and a project's quantity/unit, compute the
 * normalized purchase quantity and costs.
 *
 * Returns null if coverage can't be determined — caller should fall back
 * to the raw (pre-normalization) behavior.
 */
export function normalizePricing(
  product: CatalogProduct,
  projectQty: number,
  projectUnit: string | null,
): NormalizedPricing | null {
  if (!product.price || product.price <= 0) return null;

  const coverage = extractCoverage(product, projectUnit);
  if (!coverage) return null;

  const normProjectUnit = normalizeUnit(projectUnit);
  const normCoverageUnit = normalizeUnit(coverage.coverageUnit);

  if (!normProjectUnit || !normCoverageUnit) return null;

  // Convert project qty to coverage unit if they differ
  let adjustedProjectQty = projectQty;
  if (normProjectUnit !== normCoverageUnit) {
    const converted = convertProjectUnit(normProjectUnit, normCoverageUnit, projectQty);
    if (converted == null) return null; // Incompatible units
    adjustedProjectQty = converted;
  }

  if (coverage.coverageValue <= 0) return null;

  const purchaseQty = Math.ceil(adjustedProjectQty / coverage.coverageValue);
  const effectiveUnitPrice = product.price / coverage.coverageValue;
  const totalCost = purchaseQty * product.price;

  return {
    purchaseQty,
    pricePerPurchaseUnit: product.price,
    effectiveUnitPrice: Math.round(effectiveUnitPrice * 10000) / 10000, // 4 decimal places
    totalCost: Math.round(totalCost * 100) / 100,
    coverage,
  };
}
