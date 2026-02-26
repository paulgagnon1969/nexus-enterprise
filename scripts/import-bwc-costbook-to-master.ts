#!/usr/bin/env ts-node
/**
 * import-bwc-costbook-to-master.ts
 *
 * Imports BWC cabinet costbook (docs/data/bwc-costbook-import.csv) into
 * the Nexus System Master Costbook (PriceList kind=MASTER).
 *
 * Items are tagged with sourceCategory="BWC_CABINETS" for filtering and
 * tenant sharing.
 *
 * Usage:
 *   npx ts-node scripts/import-bwc-costbook-to-master.ts [--mode merge|replace]
 *
 * Options:
 *   --mode merge     (default) Merge with existing Master items
 *   --mode replace   Replace all Master items (WARNING: destructive)
 */

import "dotenv/config";
import path from "node:path";
import { importMasterCostbookFromFile } from "../apps/api/src/modules/pricing/pricing.service";

const COSTBOOK_PATH = path.resolve(
  __dirname,
  "../docs/data/bwc-costbook-import.csv",
);

async function main() {
  const args = process.argv.slice(2);
  const modeIdx = args.indexOf("--mode");
  const mode = modeIdx >= 0 && args[modeIdx + 1] === "replace" ? "replace" : "merge";

  console.log("BWC Cabinet Costbook → Master Import");
  console.log("=====================================\n");
  console.log(`CSV: ${COSTBOOK_PATH}`);
  console.log(`Mode: ${mode}`);
  console.log(`Source Category: BWC_CABINETS\n`);

  if (mode === "replace") {
    console.warn("⚠️  REPLACE mode will WIPE all existing Master Costbook items.");
    console.warn("   Press Ctrl+C within 5 seconds to cancel...\n");
    await new Promise((r) => setTimeout(r, 5000));
  }

  const result = await importMasterCostbookFromFile(COSTBOOK_PATH, {
    sourceCategory: "BWC_CABINETS",
    mode,
  });

  console.log("\n✅ Import complete:");
  console.log(`   Price List ID: ${result.priceListId}`);
  console.log(`   Revision: ${result.revision}`);
  console.log(`   Total items: ${result.itemCount}`);
  console.log(`   Source category: ${result.sourceCategory}`);

  if (result.mergeStats) {
    console.log(`\n   Merge stats:`);
    console.log(`     • Added: ${result.mergeStats.addedCount}`);
    console.log(`     • Updated: ${result.mergeStats.updatedCount}`);
    console.log(`     • Unchanged: ${result.mergeStats.unchangedCount}`);
  }

  console.log("\nNext steps:");
  console.log("  1. Share to tenant: API POST /pricing/master-costbook/share");
  console.log("     with body: { filters: { sourceCategory: 'BWC_CABINETS' } }");
  console.log("  2. Verify in UI: Master Costbook page → filter by Group Code 'BWC'");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Import failed:", err);
    process.exit(1);
  });
