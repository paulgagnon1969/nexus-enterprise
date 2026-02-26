#!/usr/bin/env ts-node
/**
 * share-bwc-to-tenant.ts
 *
 * Shares BWC cabinet items from Master Costbook to a tenant's CompanyPriceList.
 *
 * Usage:
 *   npx ts-node scripts/share-bwc-to-tenant.ts [companyId]
 *
 * If no companyId provided, uses the first active company.
 */

import "dotenv/config";
import prisma from "../packages/database/src/client";
import { shareMasterItemsToTenant } from "../apps/api/src/modules/pricing/pricing.service";

async function main() {
  const args = process.argv.slice(2);
  let companyId = args[0];

  if (!companyId) {
    const company = await prisma.company.findFirst({
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!company) {
      console.error("❌ No active company found");
      process.exit(1);
    }
    companyId = company.id;
    console.log(`Using first active company: ${company.name} (${companyId})\n`);
  }

  console.log("Sharing BWC Cabinets to Tenant");
  console.log("==============================\n");
  console.log(`Company ID: ${companyId}`);
  console.log(`Source Category: BWC_CABINETS\n`);

  const result = await shareMasterItemsToTenant(companyId, {
    sourceCategory: "BWC_CABINETS",
  });

  console.log("\n✅ Share complete:");
  console.log(`   Company ID: ${result.companyId}`);
  console.log(`   Company Price List ID: ${result.companyPriceListId}`);
  console.log(`   Items shared (new): ${result.sharedCount}`);
  console.log(`   Items updated: ${result.updatedCount}`);
  console.log(`   Total Master items: ${result.totalMasterItems}`);

  console.log("\n📊 Tenant now has access to 406 BWC cabinet SKUs!");
  console.log("   View in UI: Company Settings → Cost Book → filter Group Code 'BWC'");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Share failed:", err);
    process.exit(1);
  });
