/*
 * Import assets from a CSV file and optionally set their initial locations.
 *
 * Usage (from repo root):
 *   COMPANY_ID=... npx ts-node packages/database/src/scripts/import-assets-from-csv.ts path/to/asset-import.csv
 *
 * The CSV is expected to match docs/data/asset-import-template.csv:
 *   company_code,asset_code,asset_name,asset_type,description,base_unit,base_rate,is_trackable,is_consumable,initial_location_code
 */

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma, AssetType } from "../index";

async function main() {
  const companyId = process.env.COMPANY_ID;
  if (!companyId) {
    // eslint-disable-next-line no-console
    console.error("COMPANY_ID env var is required");
    process.exit(1);
  }

  const csvPath = process.argv[2];
  if (!csvPath) {
    // eslint-disable-next-line no-console
    console.error("Usage: npx ts-node import-assets-from-csv.ts <path-to-csv>");
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) {
    // eslint-disable-next-line no-console
    console.error(`CSV file not found: ${resolved}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(resolved, "utf8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<{
    company_code?: string;
    asset_code?: string;
    asset_name?: string;
    asset_type?: string;
    description?: string;
    base_unit?: string;
    base_rate?: string;
    is_trackable?: string;
    is_consumable?: string;
    initial_location_code?: string;
  }>;

  // eslint-disable-next-line no-console
  console.log(`Importing ${records.length} assets into company ${companyId} from ${resolved}`);

  for (const row of records) {
    const code = row.asset_code?.trim();
    const name = row.asset_name?.trim();
    const typeStr = row.asset_type?.trim()?.toUpperCase() as keyof typeof AssetType | undefined;

    if (!name) {
      // eslint-disable-next-line no-console
      console.warn("Skipping row without asset_name", row);
      continue;
    }

    if (!typeStr || !(typeStr in AssetType)) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping asset '${name}': invalid or missing asset_type '${row.asset_type}'`);
      continue;
    }

    const assetType = AssetType[typeStr];
    const description = row.description?.trim() || null;
    const baseUnit = row.base_unit?.trim() || null;
    const baseRate = row.base_rate ? Number(row.base_rate) : null;
    const isTrackable = row.is_trackable?.toLowerCase() === "true";
    const isConsumable = row.is_consumable?.toLowerCase() === "true";

    let locationCode = row.initial_location_code?.trim() || null;

    // If no explicit initial_location_code is provided, drop into a
    // type-specific pool so the asset is still visible in logistics:
    // - MATERIAL  -> MATERIALS_POOL
    // - LABOR     -> PEOPLE_POOL
    // - everything else -> EQUIPMENT_POOL
    if (!locationCode) {
      if (assetType === AssetType.MATERIAL) {
        locationCode = "MATERIALS_POOL";
      } else if (assetType === AssetType.LABOR) {
        locationCode = "PEOPLE_POOL";
      } else {
        locationCode = "EQUIPMENT_POOL";
      }
    }

    let currentLocationId: string | null = null;

    if (locationCode) {
      const loc = await prisma.location.findFirst({
        where: {
          companyId,
          code: locationCode,
        },
      });
      if (!loc) {
        // eslint-disable-next-line no-console
        console.warn(
          `No location found for initial_location_code='${locationCode}' (asset '${name}'); leaving currentLocationId null`,
        );
      } else {
        currentLocationId = loc.id;
      }
    }

    // Use (companyId, asset_code) as the primary identity when code is provided; fall back to name.
    const existing = code
      ? await prisma.asset.findFirst({ where: { companyId, code } })
      : await prisma.asset.findFirst({ where: { companyId, name } });

    if (existing) {
      // Update basic fields, but do not overwrite currentLocationId unless a new one is provided.
      await prisma.asset.update({
        where: { id: existing.id },
        data: {
          name,
          code: code || existing.code,
          description,
          assetType,
          baseUnit,
          baseRate: baseRate != null ? baseRate : existing.baseRate,
          isTrackable,
          isConsumable,
          currentLocationId: currentLocationId ?? existing.currentLocationId,
        },
      });
      // eslint-disable-next-line no-console
      console.log(`Updated asset '${name}' (${existing.id})`);
    } else {
      const created = await prisma.asset.create({
        data: {
          companyId,
          name,
          code: code || null,
          description,
          assetType,
          baseUnit,
          baseRate: baseRate != null ? baseRate : null,
          isTrackable,
          isConsumable,
          currentLocationId,
        },
      });
      // eslint-disable-next-line no-console
      console.log(`Created asset '${name}' (${created.id})`);
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  void prisma.$disconnect().finally(() => {
    process.exit(1);
  });
});
