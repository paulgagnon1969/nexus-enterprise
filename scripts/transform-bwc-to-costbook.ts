#!/usr/bin/env ts-node
/**
 * transform-bwc-to-costbook.ts
 *
 * Reads docs/data/bwc-price-comparison.csv and produces
 * docs/data/bwc-costbook-import.csv in the standard Nexus costbook format
 * (same columns as Golden PETL) ready for Master Costbook import.
 *
 * Usage:
 *   npx ts-node scripts/transform-bwc-to-costbook.ts
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "docs/data/bwc-price-comparison.csv");
const OUTPUT = path.join(ROOT, "docs/data/bwc-costbook-import.csv");

interface BwcRow {
  SKU: string;
  Color: string;
  CabinetType: string;
  Width_in: string;
  Height_in: string;
  Depth_in: string;
  RTA_Price: string;
  USKitchen_Price: string;
  Best_Retailer: string;
}

interface CostbookRow {
  Cat: string;
  Sel: string;
  Activity: string;
  Desc: string;
  "Unit Cost": string;
  Unit: string;
  "Group Code": string;
  "Group Description": string;
  Owner: string;
  "Original Vendor": string;
  Date: string;
  Coverage: string;
}

function parsePrice(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isNaN(n) ? null : n;
}

function buildDescription(row: BwcRow): string {
  const dims: string[] = [];
  if (row.Width_in) dims.push(`${row.Width_in}W`);
  if (row.Height_in) dims.push(`${row.Height_in}H`);
  if (row.Depth_in) dims.push(`${row.Depth_in}D`);
  const dimStr = dims.length ? ` (${dims.join(" x ")})` : "";
  return `${row.Color} - ${row.CabinetType}${dimStr}`;
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Input file not found: ${INPUT}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT, "utf8");
  const rows: BwcRow[] = parse(raw, { columns: true, skip_empty_lines: true });

  const today = new Date().toISOString().slice(0, 10);
  const output: CostbookRow[] = [];
  let skippedNoPrice = 0;

  for (const row of rows) {
    const rtaPrice = parsePrice(row.RTA_Price);
    const uskPrice = parsePrice(row.USKitchen_Price);

    if (rtaPrice === null && uskPrice === null) {
      skippedNoPrice++;
      continue;
    }

    // Pick best (lowest) price, prefer USKitchen when tied.
    let bestPrice: number;
    let vendor: string;
    if (rtaPrice !== null && uskPrice !== null) {
      if (uskPrice <= rtaPrice) {
        bestPrice = uskPrice;
        vendor = "USKitchen";
      } else {
        bestPrice = rtaPrice;
        vendor = "RTA Cabinet Store";
      }
    } else if (uskPrice !== null) {
      bestPrice = uskPrice;
      vendor = "USKitchen";
    } else {
      bestPrice = rtaPrice!;
      vendor = "RTA Cabinet Store";
    }

    output.push({
      Cat: "KIT",
      Sel: row.SKU,
      Activity: "M",
      Desc: buildDescription(row),
      "Unit Cost": bestPrice.toFixed(2),
      Unit: "EA",
      "Group Code": "BWC",
      "Group Description": "Buy Wholesale Cabinets",
      Owner: "",
      "Original Vendor": vendor,
      Date: today,
      Coverage: "",
    });
  }

  // Build CSV manually (csv-stringify not installed at root).
  const header = "Cat,Sel,Activity,Desc,Unit Cost,Unit,Group Code,Group Description,Owner,Original Vendor,Date,Coverage";
  const csvLines = [header];
  for (const r of output) {
    const escape = (v: string) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    csvLines.push([
      r.Cat, r.Sel, r.Activity, escape(r.Desc),
      r["Unit Cost"], r.Unit, r["Group Code"], escape(r["Group Description"]),
      r.Owner, escape(r["Original Vendor"]), r.Date, r.Coverage,
    ].join(","));
  }
  fs.writeFileSync(OUTPUT, csvLines.join("\n") + "\n");

  console.log(`Transformed ${output.length} priced SKUs → ${OUTPUT}`);
  console.log(`Skipped ${skippedNoPrice} SKUs with no price data`);
  console.log(`Total input rows: ${rows.length}`);
}

main();
