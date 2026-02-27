/**
 * Parse a raw Home Depot Pro Xtra purchase history CSV export and produce a
 * standardized "HD Import CSV" ready for Nexus ingestion.
 *
 * Usage (from repo root):
 *   npx ts-node scripts/hd-import/parse-hd-csv.ts <path-to-raw-hd-csv> [output-path]
 *
 * If output-path is omitted, writes to the same directory as the input with
 * a "-standardized.csv" suffix.
 *
 * What it does:
 *   1. Strips the 6-line HD metadata header.
 *   2. Parses CSV (handles embedded quotes / commas).
 *   3. Normalizes job names via job-name-map.json.
 *   4. Strips $ signs, computes line_total = qty × net_unit_price.
 *   5. Flags rows as PURCHASE or RETURN.
 *   6. Writes a clean, standardized CSV.
 *   7. Prints summary stats to stdout.
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

// ---------------------------------------------------------------------------
// Job name normalizer
// ---------------------------------------------------------------------------

interface MappingRule {
  pattern: string;
  normalized: string;
}

interface JobNameMap {
  rules: MappingRule[];
  exact_overrides: Record<string, string>;
}

const mapPath = path.join(__dirname, "job-name-map.json");
const jobNameMap: JobNameMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));

// Pre-compile regex rules once
const compiledRules = jobNameMap.rules.map((r) => ({
  regex: new RegExp(r.pattern, "i"),
  normalized: r.normalized,
}));

function normalizeJobName(raw: string): string {
  const trimmed = raw.trim();

  // Check exact overrides first (case-sensitive match on original)
  if (trimmed in jobNameMap.exact_overrides) {
    return jobNameMap.exact_overrides[trimmed];
  }

  // Check exact overrides case-insensitively
  const lower = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(jobNameMap.exact_overrides)) {
    if (key.toLowerCase() === lower) return val;
  }

  // Try regex rules (case-insensitive, evaluated in order)
  for (const rule of compiledRules) {
    if (rule.regex.test(trimmed)) {
      return rule.normalized;
    }
  }

  // Fallback: uppercase the raw value so it's at least consistent
  return trimmed.toUpperCase() || "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Dollar parsing helper
// ---------------------------------------------------------------------------

function parseDollar(val: string | undefined): number {
  if (!val) return 0;
  // Strip $, commas, spaces — keep minus sign and decimal
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npx ts-node scripts/hd-import/parse-hd-csv.ts <hd-csv-path> [output-path]");
    process.exit(1);
  }

  const resolved = path.resolve(inputPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const outputPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : resolved.replace(/\.csv$/i, "-standardized.csv");

  // Read and strip the 6-line metadata header
  const rawContent = fs.readFileSync(resolved, "utf8");
  const lines = rawContent.split(/\r?\n/);

  // Find the header row (starts with "Date,Store Number,...")
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (lines[i].startsWith("Date,Store Number,")) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    console.error("Could not locate the CSV header row. Expected a row starting with 'Date,Store Number,...'");
    process.exit(1);
  }

  // Extract metadata for reference
  const companyName = lines[0]?.split(",").slice(1).join(",").trim() || "UNKNOWN";
  const dateRange = lines[3]?.split(",").slice(1).join(",").trim() || "";
  const exportDate = lines[4]?.split(",").slice(1).join(",").trim() || "";

  console.log(`\n📦 HD Purchase History Import`);
  console.log(`   Company:     ${companyName}`);
  console.log(`   Date Range:  ${dateRange}`);
  console.log(`   Exported:    ${exportDate}`);
  console.log(`   Source:      ${resolved}\n`);

  // Re-join from header onward and parse
  const csvContent = lines.slice(headerIndex).join("\n");

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as Array<Record<string, string>>;

  console.log(`   Raw rows:    ${records.length}`);

  // ---------------------------------------------------------------------------
  // Transform rows
  // ---------------------------------------------------------------------------

  interface OutputRow {
    date: string;
    store_id: string;
    transaction_id: string;
    register: string;
    job_name_raw: string;
    job_name: string;
    sku: string;
    hd_internet_sku: string;
    description: string;
    qty: number;
    unit_price: number;
    net_unit_price: number;
    line_total: number;
    department: string;
    category: string;
    subcategory: string;
    program_discount: number;
    other_discount: number;
    total_discount: number;
    type: "PURCHASE" | "RETURN";
    purchaser: string;
  }

  const outputRows: OutputRow[] = [];
  const unmappedJobs = new Set<string>();

  for (const r of records) {
    const qty = parseDollar(r["Quantity"]); // qty can be negative for returns
    const unitPrice = parseDollar(r["Unit price"]);
    const netUnitPrice = parseDollar(r["Net Unit Price"]);
    const extRetail = parseDollar(r["Extended Retail (before discount)"]);
    const programDiscount = parseDollar(r["Program Discount Amount"]);
    const otherDiscount = parseDollar(r["Other Discount Amount"]);

    const rawJobName = (r["Job Name"] || "").trim();
    const normalizedJob = normalizeJobName(rawJobName);

    // Track unmapped values (those that fell through to the uppercase fallback)
    if (
      normalizedJob === rawJobName.toUpperCase() &&
      rawJobName !== "" &&
      !(rawJobName in jobNameMap.exact_overrides)
    ) {
      // Check if it matched a regex rule
      const matched = compiledRules.some((rule) => rule.regex.test(rawJobName));
      if (!matched) unmappedJobs.add(rawJobName);
    }

    // line_total: use extended retail (which is qty * net_unit_price already in the HD data)
    // but verify: if extRetail is available, use it; otherwise compute
    const lineTotal = extRetail !== 0 ? extRetail : Math.round(qty * netUnitPrice * 100) / 100;

    const isReturn = qty < 0 || unitPrice < 0 || lineTotal < 0;

    outputRows.push({
      date: (r["Date"] || "").trim(),
      store_id: (r["Store Number"] || "").trim(),
      transaction_id: (r["Transaction ID"] || "").trim(),
      register: (r["Register Number"] || "").trim(),
      job_name_raw: rawJobName,
      job_name: normalizedJob,
      sku: (r["SKU Number"] || "").trim(),
      hd_internet_sku: (r["Internet SKU"] || "").trim(),
      description: (r["SKU Description"] || "").trim(),
      qty: Math.abs(qty),
      unit_price: Math.abs(unitPrice),
      net_unit_price: Math.abs(netUnitPrice),
      line_total: Math.abs(lineTotal),
      department: (r["Department Name"] || "").trim(),
      category: (r["Class Name"] || "").trim(),
      subcategory: (r["Subclass Name"] || "").trim(),
      program_discount: Math.abs(programDiscount),
      other_discount: Math.abs(otherDiscount),
      total_discount: Math.abs(programDiscount) + Math.abs(otherDiscount),
      type: isReturn ? "RETURN" : "PURCHASE",
      purchaser: (r["Purchaser"] || "").trim(),
    });
  }

  // ---------------------------------------------------------------------------
  // Write standardized CSV
  // ---------------------------------------------------------------------------

  const csvHeaders = [
    "date",
    "store_id",
    "transaction_id",
    "register",
    "job_name_raw",
    "job_name",
    "sku",
    "hd_internet_sku",
    "description",
    "qty",
    "unit_price",
    "net_unit_price",
    "line_total",
    "department",
    "category",
    "subcategory",
    "program_discount",
    "other_discount",
    "total_discount",
    "type",
    "purchaser",
  ];

  const csvLines = [csvHeaders.join(",")];

  for (const row of outputRows) {
    const vals = csvHeaders.map((h) => {
      const v = (row as unknown as Record<string, unknown>)[h];
      if (typeof v === "number") return v.toFixed(2);
      // Escape quotes in strings and wrap in quotes
      const s = String(v ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    });
    csvLines.push(vals.join(","));
  }

  fs.writeFileSync(outputPath, csvLines.join("\n"), "utf8");
  console.log(`\n✅ Standardized CSV written to:\n   ${outputPath}\n`);

  // ---------------------------------------------------------------------------
  // Summary stats
  // ---------------------------------------------------------------------------

  const purchases = outputRows.filter((r) => r.type === "PURCHASE");
  const returns = outputRows.filter((r) => r.type === "RETURN");
  const purchaseTotal = purchases.reduce((acc, r) => acc + r.line_total, 0);
  const returnTotal = returns.reduce((acc, r) => acc + r.line_total, 0);

  console.log(`── Summary ─────────────────────────────────────────`);
  console.log(`   Total rows:       ${outputRows.length}`);
  console.log(`   Purchases:        ${purchases.length}  ($${purchaseTotal.toFixed(2)})`);
  console.log(`   Returns:          ${returns.length}  (-$${returnTotal.toFixed(2)})`);
  console.log(`   Net total:        $${(purchaseTotal - returnTotal).toFixed(2)}`);
  console.log(``);

  // By project
  const byProject = new Map<string, { count: number; total: number }>();
  for (const row of outputRows) {
    const key = row.job_name;
    const existing = byProject.get(key) || { count: 0, total: 0 };
    const sign = row.type === "RETURN" ? -1 : 1;
    existing.count += 1;
    existing.total += sign * row.line_total;
    byProject.set(key, existing);
  }

  const sorted = [...byProject.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log(`── Spend by Project (Top 25) ────────────────────────`);
  for (const [name, data] of sorted.slice(0, 25)) {
    const pad = name.padEnd(28);
    console.log(`   ${pad} ${String(data.count).padStart(5)} items   $${data.total.toFixed(2)}`);
  }
  console.log(``);

  // By department
  const byDept = new Map<string, { count: number; total: number }>();
  for (const row of purchases) {
    const key = row.department || "(none)";
    const existing = byDept.get(key) || { count: 0, total: 0 };
    existing.count += 1;
    existing.total += row.line_total;
    byDept.set(key, existing);
  }

  const deptSorted = [...byDept.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log(`── Spend by Department ──────────────────────────────`);
  for (const [name, data] of deptSorted) {
    const pad = name.padEnd(28);
    console.log(`   ${pad} ${String(data.count).padStart(5)} items   $${data.total.toFixed(2)}`);
  }
  console.log(``);

  // Warn about unmapped job names
  if (unmappedJobs.size > 0) {
    console.log(`── ⚠️  Unmapped Job Names (${unmappedJobs.size}) ─────────────────────`);
    console.log(`   These fell through to UPPERCASE fallback. Consider adding to job-name-map.json:`);
    for (const j of [...unmappedJobs].sort()) {
      console.log(`   - "${j}"`);
    }
    console.log(``);
  }
}

main();
