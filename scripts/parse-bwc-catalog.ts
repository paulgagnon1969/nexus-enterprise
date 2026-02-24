/**
 * Parse BWC Product List CSV into a normalized catalog with structured columns:
 *   SKU, Color, CabinetType, Description, Width, Height, Depth
 *
 * Usage:  npx ts-node scripts/parse-bwc-catalog.ts
 * Output: docs/data/bwc-catalog-normalized.csv
 */

import * as fs from "fs";
import * as path from "path";

// ── Paths ────────────────────────────────────────────────────────────
const INPUT = path.resolve(
  __dirname,
  "../docs/data/REPO - Nexus Enterprise CSV Files for Import/BWC Product List - Copy of PWC 1.csv",
);
const OUTPUT = path.resolve(__dirname, "../docs/data/bwc-catalog-normalized.csv");

// ── Helpers ──────────────────────────────────────────────────────────

/** Normalize fancy/curly quotes and smart chars to plain ASCII. */
function normalizeQuotes(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2033\u2032\u2036\u2035]/g, '"')
    .replace(/\u2013/g, "-") // en-dash
    .replace(/\u2014/g, "-") // em-dash
    .replace(/\u00A0/g, " ") // non-breaking space
    .replace(/″/g, '"')
    .replace(/′/g, "'");
}

/**
 * Known color prefixes — LONGEST FIRST so "Charcoal Black Shaker" matches
 * before "Black Shaker", etc.
 */
const COLOR_PREFIXES = [
  "Charleston White Raised Panel",
  "Charcoal Black Shaker",
  "Dove White Slim Shaker",
  "Dorian Gray Shaker",
  "Frameless Gloss White",
  "Frameless Gloss Gray",
  "Slim Shaker Green",
  "Navy Blue Shaker",
  "Slim Oak Shaker",
  "Shaker Espresso",
  "Charcoal Black",
  "Black Shaker",
  "White Shaker",
  "Gray Shaker",
  "Frameless Gloss",
  "Charleston White",
  "Dove White",
  "Slim Oak",
] as const;

/**
 * SKU prefix → color name mapping.
 * Note: S- is ambiguous (Black Shaker / Dorian Gray Shaker / Charcoal Black Shaker)
 * so we rely on description-based matching for those and only use this as fallback.
 */
const SKU_COLOR_MAP: Record<string, string> = {
  SW: "White Shaker",
  GR: "Gray Shaker",
  NB: "Navy Blue Shaker",
  SE: "Shaker Espresso",
  CW: "Charleston White Raised Panel",
  SWO: "Slim Oak Shaker",
  SDW: "Dove White Slim Shaker",
  N: "Slim Shaker Green",
  HW: "Frameless Gloss White",
  HG: "Frameless Gloss Gray",
  // S is ambiguous — skip; description matching handles it
};

function extractColor(desc: string, sku: string): string {
  for (const prefix of COLOR_PREFIXES) {
    if (desc.startsWith(prefix)) return prefix;
  }
  // Fallback: derive from SKU prefix
  const skuPrefix = sku.split("-")[0];
  if (SKU_COLOR_MAP[skuPrefix]) return SKU_COLOR_MAP[skuPrefix];
  return "";
}

/**
 * Clean up a raw dimension string, preserving fractional notation.
 * "34-1/2" → "34-1/2",  " 12 3/4 " → "12 3/4",  "29.5" → "29.5"
 * Returns null when the input is empty/unparseable.
 */
function cleanDimension(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();
  if (!raw) return null;

  // Normalize mixed-fraction separator: "34-1/2" → "34-1/2" (keep as-is)
  // "12 3/4" → "12 3/4" (keep as-is)
  // Just verify it looks like a dimension value.
  if (/^\d+([\s-]\d+\/\d+|\.\d+|\/\d+)?$/.test(raw)) return raw;

  return null;
}

interface Dimensions {
  width: string | null;
  height: string | null;
  depth: string | null;
}

/**
 * Extract W × H × D from a description string.
 * Handles patterns like:
 *   33"W x 34-1/2"H x 24"D
 *   9"W x 34 1/2"H x 24"D
 *   30"W x 15"H x 12"D
 *   11"W x 15"H           (no depth)
 *   96"W x 4 1/2"H x 1/4"D
 */
function extractDimensions(desc: string): Dimensions {
  const dims: Dimensions = { width: null, height: null, depth: null };

  // Normalize all quote-like chars to a single "
  let s = normalizeQuotes(desc).replace(/""/g, '"');

  // Dimension regex: matches whole, decimal, or fractional values before "W/"H/"D.
  // Examples matched:  33"W   34-1/2"H   12 3/4"H   3.25"D   11/16"D
  // The pattern starts with \d+ to avoid greedily capturing separators like " - ".
  const DIM_RE = /(\d+(?:[\s-]\d+\/\d+|\.\d+|(?:\/\d+))?)"\s*/;

  const wMatch = s.match(new RegExp(DIM_RE.source + "W", "i"));
  if (wMatch) dims.width = cleanDimension(wMatch[1]);

  const hMatch = s.match(new RegExp(DIM_RE.source + "H", "i"));
  if (hMatch) dims.height = cleanDimension(hMatch[1]);

  const dMatch = s.match(new RegExp(DIM_RE.source + "D", "i"));
  if (dMatch) dims.depth = cleanDimension(dMatch[1]);

  return dims;
}

/**
 * Strip color prefix and dimension suffix to get the core cabinet type.
 * "White Shaker 30" H Double Door Wall Cabinet - 24"W x 30"H x 12"D"
 *  → "30\" H Double Door Wall Cabinet"
 */
function extractCabinetType(desc: string, color: string): string {
  let type = desc;

  // Remove color prefix
  if (color && type.startsWith(color)) {
    type = type.slice(color.length).trim();
  }

  // Remove dimension suffix after " - "
  const dashIdx = type.indexOf(" - ");
  if (dashIdx > 0) {
    type = type.slice(0, dashIdx).trim();
  }

  return type;
}

// ── CSV Parsing (lightweight, handles quoted fields with embedded quotes) ─

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead: escaped quote ("") or end of field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const raw = fs.readFileSync(INPUT, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Skip header rows (lines 0-2 are junk headers)
  const dataLines = lines.slice(3);

  interface CatalogRow {
    sku: string;
    color: string;
    cabinetType: string;
    description: string;
    width: string;
    height: string;
    depth: string;
  }

  const rows: CatalogRow[] = [];
  let currentCategory = "";

  for (let i = 0; i < dataLines.length; i++) {
    // Parse the raw CSV line FIRST, then normalize quotes on each field.
    // Applying normalizeQuotes before parsing would turn \u2033 (″) into "
    // which the CSV parser then misinterprets as a field delimiter.
    const rawFields = parseCSVLine(dataLines[i]);
    const [col1, col2] = rawFields.map((f) => normalizeQuotes(f));

    if (!col1) continue;

    const desc = (col1 || "").trim();
    const sku = (col2 || "").trim();

    // Determine if this is a category header or a product variant.
    // Category headers have no SKU *and* no dimension pattern.
    // Some rows have SKU on the category line (swapped) — detect these.
    const hasDimensions = /\d+"\s*[WHD]/i.test(desc);
    const hasSkuPattern = /^[A-Z]{2}-[A-Z0-9]/.test(sku);

    if (!hasDimensions && !hasSkuPattern) {
      // Pure category header (no SKU, no dimensions)
      currentCategory = desc;
      continue;
    }

    // Handle swapped rows: SKU on category line, dimensions on next line with no SKU.
    // e.g. line 47: "White Shaker Tall Fluted Filler,SW-FF396"
    //      line 48: "White Shaker Tall Fluted Filler - 3"W x 96"H x 3/4"D,"
    if (hasSkuPattern && !hasDimensions) {
      // This is a category line that also carries the SKU.
      // Check if the NEXT line has dimensions but no SKU.
      if (i + 1 < dataLines.length) {
        const nextRaw = parseCSVLine(dataLines[i + 1]);
        const [nextCol1, nextCol2] = nextRaw.map((f) => normalizeQuotes(f));
        const nextDesc = (nextCol1 || "").trim();
        const nextSku = (nextCol2 || "").trim();
        const nextHasDims = /\d+"\s*[WHD]/i.test(nextDesc);

        if (nextHasDims && !nextSku) {
          // Merge: use next line's description + this line's SKU
          const mergedDesc = nextDesc;
          const mergedSku = sku;
          const color = extractColor(mergedDesc, mergedSku);
          const dims = extractDimensions(mergedDesc);
          const cabinetType = extractCabinetType(mergedDesc, color);

          rows.push({
            sku: mergedSku,
            color,
            cabinetType,
            description: mergedDesc,
            width: dims.width ?? "",
            height: dims.height ?? "",
            depth: dims.depth ?? "",
          });
          i++; // skip the next line since we consumed it
          continue;
        }
      }

      // No merge needed — treat as category header with a SKU but no variant dims.
      // This is an item without explicit dimensions (e.g., Touch Up Kit, Sample Door without dims).
      const color = extractColor(desc, sku);
      const cabinetType = extractCabinetType(desc, color);
      rows.push({
        sku,
        color,
        cabinetType,
        description: desc,
        width: "",
        height: "",
        depth: "",
      });
      continue;
    }

    // Normal product variant row: description with dimensions + SKU
    const color = extractColor(desc, sku);
    const dims = extractDimensions(desc);
    const cabinetType = extractCabinetType(desc, color);

    // No SKU = category header, regardless of dimensions in the name.
    if (!sku) {
      currentCategory = desc;
      continue;
    }

    rows.push({
      sku: sku || "",
      color,
      cabinetType,
      description: desc,
      width: dims.width ?? "",
      height: dims.height ?? "",
      depth: dims.depth ?? "",
    });
  }

  // ── Write CSV ──────────────────────────────────────────────────────
  const csvHeader = "SKU,Color,CabinetType,Description,Width_in,Height_in,Depth_in";
  const csvLines = rows.map((r) => {
    const escape = (s: string) => {
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    return [
      escape(r.sku),
      escape(r.color),
      escape(r.cabinetType),
      escape(r.description),
      r.width,
      r.height,
      r.depth,
    ].join(",");
  });

  const output = [csvHeader, ...csvLines].join("\n") + "\n";
  fs.writeFileSync(OUTPUT, output, "utf-8");

  // ── Summary stats ──────────────────────────────────────────────────
  const colorCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  let withDims = 0;
  let withoutDims = 0;

  for (const r of rows) {
    colorCounts[r.color || "(unknown)"] = (colorCounts[r.color || "(unknown)"] || 0) + 1;
    const baseType = r.cabinetType.replace(/^\d+"\s*[WHD]?\s*/, "").trim();
    typeCounts[baseType] = (typeCounts[baseType] || 0) + 1;
    if (r.width || r.height || r.depth) withDims++;
    else withoutDims++;
  }

  console.log(`\n✅ Wrote ${rows.length} rows to ${OUTPUT}\n`);
  console.log("── By color ──");
  for (const [color, count] of Object.entries(colorCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${color}: ${count}`);
  }
  console.log(`\n── Dimensions ──`);
  console.log(`  With W/H/D: ${withDims}`);
  console.log(`  Without:    ${withoutDims}`);
}

main();
