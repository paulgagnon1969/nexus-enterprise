#!/usr/bin/env ts-node
/**
 * seed-premium-modules.ts
 *
 * Seeds the ModuleCatalog with premium one-time purchase modules:
 * - MASTER_COSTBOOK: Lifetime access to 50K+ line items
 * - GOLDEN_PETL: Pre-built estimate templates
 * - GOLDEN_BOM: Pre-built BOM templates
 *
 * Usage:
 *   npx ts-node scripts/seed-premium-modules.ts
 */

import "dotenv/config";
import prisma from "../packages/database/src/client";

interface PremiumModule {
  code: string;
  label: string;
  description: string;
  oneTimePurchasePrice: number; // in cents
  sortOrder: number;
}

const PREMIUM_MODULES: PremiumModule[] = [
  {
    code: "MASTER_COSTBOOK",
    label: "Master Costbook Access",
    description:
      "Lifetime access to the Nexus Master Costbook with 50,000+ pre-priced line items including BWC Cabinets, Xactimate components, and construction materials. Includes all future updates. Never build a cost book from scratch again.",
    oneTimePurchasePrice: 499900, // $4,999 one-time
    sortOrder: 100,
  },
  {
    code: "GOLDEN_PETL",
    label: "Golden PETL Library",
    description:
      "Lifetime access to pre-built estimate templates (Golden PETL) for common project types: kitchen remodels, bathroom renovations, roofing, siding, and more. Import and customize for fast estimate creation. Includes all future templates.",
    oneTimePurchasePrice: 299900, // $2,999 one-time
    sortOrder: 101,
  },
  {
    code: "GOLDEN_BOM",
    label: "Golden BOM Library",
    description:
      "Lifetime access to pre-built Bill of Materials templates for common scopes. Drag-and-drop BOMs for kitchens, baths, exterior work, and more. Includes material specs, quantities, and vendor recommendations. Includes all future BOMs.",
    oneTimePurchasePrice: 199900, // $1,999 one-time
    sortOrder: 102,
  },
];

async function main() {
  console.log("Seeding Premium Modules to ModuleCatalog\n");
  console.log("=========================================\n");

  for (const module of PREMIUM_MODULES) {
    const existing = await prisma.moduleCatalog.findUnique({
      where: { code: module.code },
    });

    if (existing) {
      console.log(`✓ ${module.code} already exists (ID: ${existing.id})`);
      // Update pricing if changed
      if (existing.oneTimePurchasePrice !== module.oneTimePurchasePrice) {
        await prisma.moduleCatalog.update({
          where: { id: existing.id },
          data: {
            oneTimePurchasePrice: module.oneTimePurchasePrice,
            label: module.label,
            description: module.description,
          },
        });
        console.log(`  → Updated price to $${(module.oneTimePurchasePrice / 100).toFixed(2)}`);
      }
    } else {
      const created = await prisma.moduleCatalog.create({
        data: {
          code: module.code,
          label: module.label,
          description: module.description,
          pricingModel: "ONE_TIME_PURCHASE",
          oneTimePurchasePrice: module.oneTimePurchasePrice,
          isCore: false,
          sortOrder: module.sortOrder,
          active: true,
        },
      });
      console.log(`✅ Created ${module.code} (ID: ${created.id})`);
      console.log(`   Price: $${(module.oneTimePurchasePrice / 100).toFixed(2)} lifetime`);
    }
  }

  console.log("\n📊 Module Catalog Summary:\n");

  const allModules = await prisma.moduleCatalog.findMany({
    where: { pricingModel: "ONE_TIME_PURCHASE" },
    orderBy: { sortOrder: "asc" },
  });

  for (const mod of allModules) {
    console.log(`  ${mod.code}: $${((mod.oneTimePurchasePrice || 0) / 100).toFixed(2)}`);
  }

  console.log("\n✅ Premium modules ready for purchase!");
  console.log("\nNext steps:");
  console.log("  1. Create Stripe Products for each module");
  console.log("  2. Add purchase flow in UI (Settings → Modules)");
  console.log("  3. Implement entitlement checks in API endpoints");

  try {
    await (prisma as any).$disconnect();
  } catch {}
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
