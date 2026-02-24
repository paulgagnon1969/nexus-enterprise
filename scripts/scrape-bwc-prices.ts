/**
 * BWC Cabinet Price Scraper
 *
 * Scrapes retail prices from:
 *   - rtacabinetstore.com  (RTA)
 *   - uskitchencabinet.com (USKitchen) — with cross-prefix matching
 *     for Black Shaker (S-ONB-/S-MSL- → BS-) and Navy Blue (NB- → DB-)
 *
 * Reads the normalized catalog at docs/data/bwc-catalog-normalized.csv,
 * enriches each SKU with pricing from both retailers, and outputs a
 * comparison CSV at docs/data/bwc-price-comparison.csv.
 *
 * Usage:
 *   npx ts-node scripts/scrape-bwc-prices.ts [--sample N] [--resume]
 *
 *   --sample N   Only scrape the first N SKUs (for testing)
 *   --start N    Start at row N (0-indexed)
 *   --resume     Resume from the last written row in the output CSV
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ── Paths ───────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(
  REPO_ROOT,
  "docs/data/bwc-catalog-normalized.csv",
);
const OUTPUT_PATH = path.join(REPO_ROOT, "docs/data/bwc-price-comparison.csv");
const SITEMAP_CACHE = path.join(REPO_ROOT, ".cache/uskitchen-sitemap.json");

// ── Config ──────────────────────────────────────────────────────────
const DELAY_MS = 1_200; // ~1.2 s between requests (polite crawling)
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const MAX_RETRIES = 2;

// ── Types ───────────────────────────────────────────────────────────
interface CatalogRow {
  SKU: string;
  Color: string;
  CabinetType: string;
  Description: string;
  Width_in: string;
  Height_in: string;
  Depth_in: string;
}

interface PriceResult {
  price: number | null;
  url: string;
  error?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function readCatalog(): CatalogRow[] {
  const raw = fs.readFileSync(CATALOG_PATH, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const header = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCSVLine(line);
    const row: any = {};
    header.forEach((h, i) => (row[h] = vals[i] ?? ""));
    return row as CatalogRow;
  });
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": UA },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.status === 404) return null;
      if (!resp.ok) {
        if (attempt < retries) {
          await sleep(2_000 * (attempt + 1));
          continue;
        }
        return null;
      }
      return await resp.text();
    } catch (e: any) {
      if (attempt < retries) {
        await sleep(2_000 * (attempt + 1));
        continue;
      }
      return null;
    }
  }
  return null;
}

// ── Price extractors ────────────────────────────────────────────────

function extractRTAPrice(html: string): number | null {
  // Schema.org: <meta itemprop=price content=307.99>
  const schemaMatch = html.match(
    /itemprop=["']?price["']?\s+content=["']?([\d.]+)/i,
  );
  if (schemaMatch) return parseFloat(schemaMatch[1]);

  // dataLayer: productValue:"307.99"
  const dlMatch = html.match(/productValue\s*:\s*"([\d.]+)"/);
  if (dlMatch) return parseFloat(dlMatch[1]);

  return null;
}

function extractUSKitchenPrice(html: string): number | null {
  // Open Graph: <meta property="product:price:amount" content="187.66">
  const ogMatch = html.match(
    /product:price:amount["']\s+content=["']([\d.]+)/i,
  );
  if (ogMatch) return parseFloat(ogMatch[1]);

  // JSON-LD: "price":"187.66"
  const ldMatch = html.match(/"price"\s*:\s*"([\d.]+)"/);
  if (ldMatch) return parseFloat(ldMatch[1]);

  return null;
}


// ── USKitchen sitemap → SKU map ─────────────────────────────────────

async function buildUSKitchenUrlMap(): Promise<Map<string, string>> {
  // Check cache first
  if (fs.existsSync(SITEMAP_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(SITEMAP_CACHE, "utf-8"));
    console.log(
      `  Loaded ${Object.keys(cached).length} USKitchen URLs from cache`,
    );
    return new Map(Object.entries(cached));
  }

  console.log("  Downloading USKitchen sitemaps...");
  const allUrls: string[] = [];

  for (let i = 1; i <= 5; i++) {
    const xml = await fetchWithRetry(
      `https://uskitchencabinet.com/product-sitemap${i}.xml`,
    );
    if (!xml) continue;
    const locs = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
    for (const loc of locs) {
      const url = loc.replace("<loc>", "").replace("</loc>", "");
      if (url.includes("/shop/") || url.includes("/uskc-cabinets/")) continue;
      allUrls.push(url);
    }
    await sleep(500);
  }

  console.log(`  Found ${allUrls.length} product URLs in sitemaps`);

  // Extract SKU from the URL slug
  // URL ends like: .../white-shaker-wall-cabinet-sw-w3036/
  // SKU patterns: SW-xxx, GR-xxx, NB-xxx, SE-xxx, CW-xxx, S-xxx,
  //               SWO-xxx, SDW-xxx, N-xxx, HW-xxx, HG-xxx, DB-xxx
  const skuPrefixes = [
    "sw-",
    "gr-",
    "nb-",
    "se-",
    "cw-",
    "swo-",
    "sdw-",
    "hw-",
    "hg-",
    "db-",
    "bs-",
    "s-",
    "n-",
  ];
  const map = new Map<string, string>();

  for (const url of allUrls) {
    const slug = url.replace(/\/$/, "").split("/").pop() || "";

    // Try to find the SKU in the slug
    for (const prefix of skuPrefixes) {
      const idx = slug.lastIndexOf(prefix);
      if (idx >= 0) {
        const skuPart = slug.substring(idx).replace(/-/g, (m, offset) => {
          // First dash is part of the SKU prefix (e.g., SW-)
          // We need to reconstruct properly
          return "-";
        });
        // The SKU in URL is lowercased and dash-separated
        // Reconstruct: take from the prefix match to end
        const rawSku = slug.substring(idx).toUpperCase();
        // URL dashes vs SKU dashes: SW-W3036 in URL is "sw-w3036"
        // But multi-dash SKUs like SW-3DB12 would be "sw-3db12"
        map.set(rawSku, url);
        break;
      }
    }
  }

  // Cache it
  fs.mkdirSync(path.dirname(SITEMAP_CACHE), { recursive: true });
  fs.writeFileSync(
    SITEMAP_CACHE,
    JSON.stringify(Object.fromEntries(map), null, 2),
  );
  console.log(`  Mapped ${map.size} SKUs to USKitchen URLs (cached)`);
  return map;
}

// ── USKitchen cross-prefix mapping ──────────────────────────────────
// Some BWC color prefixes differ from USKitchen's catalog:
//   Our "S-ONB-" / "S-MSL-" (Black Shaker) → USKitchen uses "BS-"
//   Our "NB-" (Navy Blue)                  → USKitchen uses "DB-" (Dark Blue)
// Keys are our prefixes (stripped), values are USKitchen prefixes to try.
const USK_PREFIX_ALTERNATES: Record<string, string[]> = {
  "S-ONB-": ["BS-"],
  "S-MSL-": ["BS-"],
  "NB-": ["DB-"],
};

function findUSKitchenUrl(
  sku: string,
  urlMap: Map<string, string>,
): string | null {
  const skuUpper = sku.toUpperCase();
  const skuLower = sku.toLowerCase().replace(/[()]/g, "");

  // Direct key match
  const direct = urlMap.get(skuUpper);
  if (direct) return direct;

  // URL slug match — the slug must END with the SKU (no trailing chars)
  // to avoid e.g. SW-W3036 matching the SW-W3036GD URL
  for (const [, url] of urlMap) {
    const slug = url.replace(/\/$/, "").split("/").pop() || "";
    if (slug.endsWith(skuLower)) return url;
  }

  // Try alternate prefixes (e.g., S-W3036 → BS-W3036)
  for (const [ourPrefix, altPrefixes] of Object.entries(USK_PREFIX_ALTERNATES)) {
    if (skuUpper.startsWith(ourPrefix)) {
      const modelPart = skuUpper.substring(ourPrefix.length);
      for (const altPrefix of altPrefixes) {
        const altSku = altPrefix + modelPart;
        const altLower = altSku.toLowerCase();
        const altDirect = urlMap.get(altSku);
        if (altDirect) return altDirect;
        for (const [, url] of urlMap) {
          const slug = url.replace(/\/$/, "").split("/").pop() || "";
          if (slug.endsWith(altLower)) return url;
        }
      }
    }
  }

  return null;
}

// Check if a SKU would use cross-prefix matching
function isCrossPrefixMatch(sku: string): boolean {
  const skuUpper = sku.toUpperCase();
  return Object.keys(USK_PREFIX_ALTERNATES).some((prefix) =>
    skuUpper.startsWith(prefix),
  );
}

// ── Fetch prices ────────────────────────────────────────────────────

async function fetchRTAPrice(sku: string): Promise<PriceResult> {
  const url = `https://www.rtacabinetstore.com/RTA-Kitchen-Cabinets/item/${sku}`;
  const html = await fetchWithRetry(url);
  if (!html) return { price: null, url, error: "fetch_failed" };

  const price = extractRTAPrice(html);
  return { price, url, error: price === null ? "no_price_found" : undefined };
}

async function fetchUSKitchenPrice(
  sku: string,
  urlMap: Map<string, string>,
): Promise<PriceResult> {
  const url = findUSKitchenUrl(sku, urlMap);
  if (!url) return { price: null, url: "", error: "no_url_in_sitemap" };

  const html = await fetchWithRetry(url);
  if (!html) return { price: null, url, error: "fetch_failed" };

  const price = extractUSKitchenPrice(html);
  return { price, url, error: price === null ? "no_price_found" : undefined };
}

// ── CSV output ──────────────────────────────────────────────────────

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const CSV_HEADER = [
  "SKU",
  "Color",
  "CabinetType",
  "Width_in",
  "Height_in",
  "Depth_in",
  "RTA_Price",
  "USKitchen_Price",
  "Diff_Dollar",
  "Diff_Pct",
  "Best_Retailer",
  "RTA_URL",
  "USKitchen_URL",
  "USK_Matched_SKU",
  "Notes",
].join(",");

function formatRow(
  row: CatalogRow,
  rta: PriceResult,
  usk: PriceResult,
): string {
  const diff =
    rta.price !== null && usk.price !== null ? rta.price - usk.price : null;
  const diffPct =
    rta.price !== null && usk.price !== null && rta.price > 0
      ? (((rta.price - usk.price) / rta.price) * 100).toFixed(1)
      : "";

  // Determine best retailer when both have prices
  let best = "";
  if (rta.price !== null && usk.price !== null) {
    best = rta.price <= usk.price ? "RTA" : "USKitchen";
  } else if (rta.price !== null) {
    best = "RTA";
  } else if (usk.price !== null) {
    best = "USKitchen";
  }

  // Show the USKitchen URL slug for cross-prefix matches (helps verify the mapping)
  const uskSlug = usk.url ? (usk.url.replace(/\/$/, "").split("/").pop() || "") : "";

  const notes: string[] = [];
  if (rta.error) notes.push(`RTA: ${rta.error}`);
  if (usk.error) notes.push(`USK: ${usk.error}`);

  return [
    escapeCSV(row.SKU),
    escapeCSV(row.Color),
    escapeCSV(row.CabinetType),
    row.Width_in,
    row.Height_in,
    row.Depth_in,
    rta.price !== null ? rta.price.toFixed(2) : "",
    usk.price !== null ? usk.price.toFixed(2) : "",
    diff !== null ? diff.toFixed(2) : "",
    diffPct,
    best,
    escapeCSV(rta.url),
    escapeCSV(usk.url),
    escapeCSV(uskSlug),
    escapeCSV(notes.join("; ")),
  ].join(",");
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const sampleIdx = args.indexOf("--sample");
  const sampleN = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1], 10) : 0;
  const startArgIdx = args.indexOf("--start");
  const startOffset = startArgIdx >= 0 ? parseInt(args[startArgIdx + 1], 10) : 0;
  const resume = args.includes("--resume");

  console.log("BWC Cabinet Price Scraper");
  console.log("========================\n");

  // 1. Read catalog
  console.log("1. Reading normalized catalog...");
  let catalog = readCatalog();
  console.log(`   ${catalog.length} SKUs loaded\n`);

  if (startOffset > 0 || sampleN > 0) {
    const end = sampleN > 0 ? startOffset + sampleN : catalog.length;
    catalog = catalog.slice(startOffset, end);
    console.log(`   (scraping rows ${startOffset}-${Math.min(end, startOffset + catalog.length) - 1}, ${catalog.length} SKUs)\n`);
  }

  // 2. Build USKitchen URL map from sitemaps
  console.log("2. Building USKitchen URL map from sitemaps...");
  const uskUrlMap = await buildUSKitchenUrlMap();
  console.log();

  // 3. Check how many catalog SKUs have USKitchen URLs
  let uskMatches = 0;
  for (const row of catalog) {
    if (findUSKitchenUrl(row.SKU, uskUrlMap)) uskMatches++;
  }
  console.log(
    `   ${uskMatches}/${catalog.length} catalog SKUs found on USKitchen\n`,
  );

  // 4. Resume support
  let startIdx = 0;
  if (resume && fs.existsSync(OUTPUT_PATH)) {
    const existing = fs.readFileSync(OUTPUT_PATH, "utf-8").split("\n");
    startIdx = existing.filter((l) => l.trim() && !l.startsWith("SKU,")).length;
    console.log(`   Resuming from row ${startIdx}\n`);
  } else {
    // Write header
    fs.writeFileSync(OUTPUT_PATH, CSV_HEADER + "\n");
  }

  // 5. Scrape
  console.log("3. Scraping prices...\n");
  const startTime = Date.now();
  let rtaHits = 0,
    uskHits = 0,
    crossPrefixHits = 0,
    errors = 0;

  for (let i = startIdx; i < catalog.length; i++) {
    const row = catalog[i];
    const progress = `[${i + 1}/${catalog.length}]`;

    // Fetch RTA price
    process.stdout.write(`${progress} ${row.SKU} — RTA...`);
    const rta = await fetchRTAPrice(row.SKU);
    if (rta.price !== null) rtaHits++;
    await sleep(DELAY_MS);

    // Fetch USKitchen price (includes cross-prefix matching)
    process.stdout.write(` USK...`);
    const usk = await fetchUSKitchenPrice(row.SKU, uskUrlMap);
    if (usk.price !== null) {
      uskHits++;
      // Check if this was a cross-prefix match
      if (usk.url && isCrossPrefixMatch(row.SKU)) crossPrefixHits++;
    }
    if (usk.url) await sleep(DELAY_MS);
    if (rta.error || usk.error) errors++;

    // Format result
    const diff =
      rta.price !== null && usk.price !== null
        ? `Δ$${(rta.price - usk.price).toFixed(2)}`
        : "—";
    console.log(
      ` RTA: $${rta.price ?? "N/A"} | USK: $${usk.price ?? "N/A"} | ${diff}`,
    );

    // Append to CSV
    fs.appendFileSync(OUTPUT_PATH, formatRow(row, rta, usk) + "\n");

    // Progress summary every 50 rows
    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      console.log(
        `\n   --- Progress: ${i + 1}/${catalog.length} | RTA: ${rtaHits} | USK: ${uskHits} (${crossPrefixHits} cross-prefix) | Elapsed: ${elapsed}m ---\n`,
      );
    }
  }

  // 6. Summary
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Done! Scraped ${catalog.length} SKUs in ${totalTime} minutes`);
  console.log(`  RTA prices found:       ${rtaHits}/${catalog.length}`);
  console.log(`  USKitchen prices found:  ${uskHits}/${catalog.length} (${crossPrefixHits} via cross-prefix)`);
  console.log(`  Errors:                  ${errors}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
