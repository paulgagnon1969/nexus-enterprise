/**
 * Canonical product identity utilities.
 *
 * The specHash uniquely identifies a real-world product regardless of which
 * vendor sells it.  It's computed from normalized product attributes so that
 * "White Shaker Base Cabinet 24×34.5×24" resolves to the same hash whether
 * it comes from RTA, USKitchen, or Home Depot.
 */

import { createHash } from "node:crypto";

// ── Dimension normalisation ────────────────────────────────────────

/**
 * Normalise a raw dimension string to a canonical decimal form.
 *   "34-1/2"  → "34.5"
 *   "34 1/2"  → "34.5"
 *   "34.5"    → "34.5"
 *   "3/4"     → "0.75"
 *   ""        → ""
 */
export function normalizeDimension(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";

  // Handle "34-1/2" or "34 1/2" (whole + fraction separated by dash or space).
  const mixedMatch = s.match(
    /^(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/,
  );
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    return den > 0 ? String(whole + num / den) : String(whole);
  }

  // Handle bare fraction: "3/4".
  const fracMatch = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    return den > 0 ? String(num / den) : "0";
  }

  // Already a number: "34.5", "24".
  const n = parseFloat(s);
  if (!Number.isNaN(n)) return String(n);

  // Fallback: return trimmed uppercase.
  return s.toUpperCase();
}

// ── Spec hash ──────────────────────────────────────────────────────

/**
 * Build the canonical spec hash for a product.
 *
 * SHA-256 of:
 *   upper(category) | upper(productType) | normDim(width) | normDim(height) | normDim(depth) | upper(finish)
 *
 * @returns 64-char lowercase hex SHA-256 hash.
 */
export function buildSpecHash(params: {
  category: string;
  productType: string;
  width?: string | null;
  height?: string | null;
  depth?: string | null;
  finish?: string | null;
}): string {
  const parts = [
    (params.category || "").trim().toUpperCase(),
    (params.productType || "").trim().toUpperCase(),
    normalizeDimension(params.width),
    normalizeDimension(params.height),
    normalizeDimension(params.depth),
    (params.finish || "").trim().toUpperCase(),
  ];
  const canonical = parts.join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

// ── BWC-specific helpers ───────────────────────────────────────────

/**
 * Extract the color/finish from a BWC Color field.
 * E.g. "White Shaker" → "White Shaker"
 */
function normalizeBwcFinish(color: string): string {
  return (color || "").trim();
}

/**
 * Derive a clean product type from BWC CabinetType + key dimensions.
 * Strips quoted dimension prefixes that are already captured in width/height.
 * E.g. `"30" H Double Door Wall Cabinet"` → `"Double Door Wall Cabinet"`
 */
function normalizeBwcProductType(cabinetType: string): string {
  let t = (cabinetType || "").trim();
  // Strip leading dimension patterns like `30" H `, `24" W `
  t = t.replace(/^\d+["″]\s*[HhWwDd]\s+/, "");
  // Strip leading dimension patterns like `12" x 27" `
  t = t.replace(/^\d+["″]\s*x\s*\d+["″]\s*/, "");
  return t.trim();
}

export interface BwcCsvRow {
  SKU: string;
  Color: string;
  CabinetType: string;
  Width_in: string;
  Height_in: string;
  Depth_in: string;
}

/**
 * Parse a BWC CSV row into CatalogItem-compatible attributes + specHash.
 */
export function parseBwcToCatalogSpec(row: BwcCsvRow) {
  const category = "KIT";
  const productType = normalizeBwcProductType(row.CabinetType);
  const finish = normalizeBwcFinish(row.Color);
  const width = normalizeDimension(row.Width_in);
  const height = normalizeDimension(row.Height_in);
  const depth = normalizeDimension(row.Depth_in);

  const specHash = buildSpecHash({
    category,
    productType,
    width: width || null,
    height: height || null,
    depth: depth || null,
    finish: finish || null,
  });

  const description = [
    finish,
    productType,
    width || height || depth
      ? `(${[width ? `${width}W` : "", height ? `${height}H` : "", depth ? `${depth}D` : ""].filter(Boolean).join(" × ")})`
      : "",
  ]
    .filter(Boolean)
    .join(" - ");

  return {
    specHash,
    category,
    productType,
    description,
    unit: "EA",
    width: width || null,
    height: height || null,
    depth: depth || null,
    finish: finish || null,
  };
}
