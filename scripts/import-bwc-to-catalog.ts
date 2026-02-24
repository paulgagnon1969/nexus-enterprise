#!/usr/bin/env ts-node
/**
 * import-bwc-to-catalog.ts
 *
 * Reads docs/data/bwc-price-comparison.csv and populates:
 *   1. VendorRegistry — seeds RTA + USKitchen (idempotent)
 *   2. CatalogItem — one per unique product spec (via specHash)
 *   3. VendorQuote — one per vendor×product with price + URL
 *
 * Usage:
 *   npx ts-node scripts/import-bwc-to-catalog.ts
 */

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "../packages/database/src/client";
import { parseBwcToCatalogSpec } from "../packages/database/src/catalog/spec-hash";

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(ROOT, "docs/data/bwc-price-comparison.csv");

interface BwcRow {
  SKU: string;
  Color: string;
  CabinetType: string;
  Width_in: string;
  Height_in: string;
  Depth_in: string;
  RTA_Price: string;
  USKitchen_Price: string;
  RTA_URL: string;
  USKitchen_URL: string;
  USK_Matched_SKU: string;
}

function parsePrice(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isNaN(n) ? null : n;
}

async function ensureVendor(
  code: string,
  name: string,
  websiteUrl: string,
  providerType: "WEB_SCRAPER" | "SERPAPI",
) {
  const existing = await prisma.vendorRegistry.findUnique({ where: { code } });
  if (existing) return existing;
  return prisma.vendorRegistry.create({
    data: { code, name, websiteUrl, providerType, isEnabled: true },
  });
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Input not found: ${INPUT}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT, "utf8");
  const rows: BwcRow[] = parse(raw, { columns: true, skip_empty_lines: true });

  // 1. Seed vendors.
  const rtaVendor = await ensureVendor(
    "RTA",
    "RTA Cabinet Store",
    "https://www.rtacabinetstore.com",
    "WEB_SCRAPER",
  );
  const uskVendor = await ensureVendor(
    "USKITCHEN",
    "US Kitchen Cabinet",
    "https://uskitchencabinet.com",
    "WEB_SCRAPER",
  );

  let catalogCreated = 0;
  let catalogExisted = 0;
  let quotesCreated = 0;
  let quotesUpdated = 0;
  let skippedNoPrice = 0;

  const now = new Date();

  for (const row of rows) {
    const rtaPrice = parsePrice(row.RTA_Price);
    const uskPrice = parsePrice(row.USKitchen_Price);

    if (rtaPrice === null && uskPrice === null) {
      skippedNoPrice++;
      continue;
    }

    // 2. Upsert CatalogItem.
    const spec = parseBwcToCatalogSpec(row);

    let catalogItem = await prisma.catalogItem.findUnique({
      where: { specHash: spec.specHash },
    });

    if (!catalogItem) {
      catalogItem = await prisma.catalogItem.create({
        data: {
          specHash: spec.specHash,
          category: spec.category,
          productType: spec.productType,
          description: spec.description,
          unit: spec.unit,
          width: spec.width,
          height: spec.height,
          depth: spec.depth,
          finish: spec.finish,
        },
      });
      catalogCreated++;
    } else {
      catalogExisted++;
    }

    // 3. Upsert VendorQuotes.
    if (rtaPrice !== null) {
      const result = await prisma.vendorQuote.upsert({
        where: {
          catalogItemId_vendorId_vendorSku: {
            catalogItemId: catalogItem.id,
            vendorId: rtaVendor.id,
            vendorSku: row.SKU,
          },
        },
        update: {
          unitPrice: rtaPrice,
          productUrl: row.RTA_URL || null,
          scrapedAt: now,
        },
        create: {
          catalogItemId: catalogItem.id,
          vendorId: rtaVendor.id,
          vendorSku: row.SKU,
          unitPrice: rtaPrice,
          productUrl: row.RTA_URL || null,
          scrapedAt: now,
        },
      });
      // Detect create vs update by checking createdAt proximity to now.
      if (Math.abs(result.createdAt.getTime() - now.getTime()) < 2000) {
        quotesCreated++;
      } else {
        quotesUpdated++;
      }
    }

    if (uskPrice !== null) {
      const uskSku = row.USK_Matched_SKU || row.SKU;
      const result = await prisma.vendorQuote.upsert({
        where: {
          catalogItemId_vendorId_vendorSku: {
            catalogItemId: catalogItem.id,
            vendorId: uskVendor.id,
            vendorSku: uskSku,
          },
        },
        update: {
          unitPrice: uskPrice,
          productUrl: row.USKitchen_URL || null,
          scrapedAt: now,
        },
        create: {
          catalogItemId: catalogItem.id,
          vendorId: uskVendor.id,
          vendorSku: uskSku,
          unitPrice: uskPrice,
          productUrl: row.USKitchen_URL || null,
          scrapedAt: now,
        },
      });
      if (Math.abs(result.createdAt.getTime() - now.getTime()) < 2000) {
        quotesCreated++;
      } else {
        quotesUpdated++;
      }
    }
  }

  console.log("BWC → Catalog import complete:");
  console.log(`  CatalogItems created: ${catalogCreated}`);
  console.log(`  CatalogItems existed: ${catalogExisted}`);
  console.log(`  VendorQuotes created: ${quotesCreated}`);
  console.log(`  VendorQuotes updated: ${quotesUpdated}`);
  console.log(`  Skipped (no price):   ${skippedNoPrice}`);
  console.log(`  Total input rows:     ${rows.length}`);

  try { await (prisma as any).$disconnect(); } catch {}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
