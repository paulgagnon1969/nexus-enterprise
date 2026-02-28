#!/usr/bin/env ts-node
/**
 * setup-stripe-products.ts
 *
 * Creates Stripe Products and Prices for premium modules, then updates
 * ModuleCatalog with the Stripe IDs.
 *
 * Prerequisites:
 * - STRIPE_SECRET_KEY in .env
 * - Stripe CLI installed (optional, for testing)
 *
 * Usage:
 *   npx ts-node scripts/setup-stripe-products.ts [--test-mode]
 *
 * Options:
 *   --test-mode: Use Stripe test keys (default: production)
 */

import "dotenv/config";
import prisma from "../packages/database/src/client";

// Check if Stripe is available
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY not found in .env");
  console.error("   Add your Stripe secret key to continue.");
  process.exit(1);
}

// Import Stripe (dynamically to handle if not installed)
let stripe: any;
try {
  const Stripe = require("stripe");
  stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
} catch {
  console.error("❌ Stripe package not installed");
  console.error("   Run: npm install stripe");
  process.exit(1);
}

interface ModuleConfig {
  code: string;
  label: string;
  description: string;
  price: number; // in cents
}

const MODULES: ModuleConfig[] = [
  {
    code: "MASTER_COSTBOOK",
    label: "Master Costbook Access",
    description:
      "Lifetime access to the Nexus Master Costbook with 50,000+ pre-priced line items including BWC Cabinets, Xactimate components, and construction materials. Includes all future updates.",
    price: 499900, // $4,999
  },
  {
    code: "GOLDEN_PETL",
    label: "Golden PETL Library",
    description:
      "Lifetime access to pre-built estimate templates (Golden PETL) for common project types: kitchen remodels, bathroom renovations, roofing, siding, and more. Includes all future templates.",
    price: 299900, // $2,999
  },
  {
    code: "GOLDEN_BOM",
    label: "Golden BOM Library",
    description:
      "Lifetime access to pre-built Bill of Materials templates for common scopes. Drag-and-drop BOMs for kitchens, baths, exterior work, and more. Includes all future BOMs.",
    price: 199900, // $1,999
  },
];

async function main() {
  const args = process.argv.slice(2);
  const isTestMode = args.includes("--test-mode");

  console.log("Stripe Product Setup");
  console.log("===================\n");
  console.log(`Mode: ${isTestMode ? "TEST" : "PRODUCTION"}`);
  console.log(`Stripe API Key: ${STRIPE_SECRET_KEY!.substring(0, 12)}...`);
  console.log();

  for (const module of MODULES) {
    console.log(`Processing ${module.code}...`);

    // Check if product already exists in our DB
    const existingModule = await prisma.moduleCatalog.findUnique({
      where: { code: module.code },
    });

    if (!existingModule) {
      console.error(`  ❌ Module ${module.code} not found in ModuleCatalog`);
      console.error(`     Run: npx ts-node scripts/seed-premium-modules.ts first`);
      continue;
    }

    // Check if Stripe IDs already exist
    if (existingModule.stripeProductId && existingModule.stripePriceId) {
      console.log(`  ✓ Stripe Product already exists`);
      console.log(`    Product ID: ${existingModule.stripeProductId}`);
      console.log(`    Price ID: ${existingModule.stripePriceId}`);
      continue;
    }

    try {
      // Create Stripe Product
      const product = await stripe.products.create({
        name: module.label,
        description: module.description,
        metadata: {
          moduleCode: module.code,
          type: "premium_module",
        },
      });

      console.log(`  ✅ Created Stripe Product: ${product.id}`);

      // Create Stripe Price (one-time payment)
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: module.price,
        currency: "usd",
        billing_scheme: "per_unit",
        // One-time payment (no recurring interval)
      });

      console.log(`  ✅ Created Stripe Price: ${price.id} ($${(module.price / 100).toFixed(2)})`);

      // Update ModuleCatalog with Stripe IDs
      await prisma.moduleCatalog.update({
        where: { code: module.code },
        data: {
          stripeProductId: product.id,
          stripePriceId: price.id,
        },
      });

      console.log(`  ✅ Updated ModuleCatalog with Stripe IDs`);
    } catch (err: any) {
      console.error(`  ❌ Failed to create Stripe product: ${err.message}`);
    }

    console.log();
  }

  console.log("✅ Stripe setup complete!\n");

  // Summary
  const modules = await prisma.moduleCatalog.findMany({
    where: { pricingModel: "ONE_TIME_PURCHASE" },
    select: {
      code: true,
      label: true,
      oneTimePurchasePrice: true,
      stripeProductId: true,
      stripePriceId: true,
    },
  });

  console.log("📊 Module Summary:\n");
  for (const mod of modules) {
    const hasStripe = mod.stripeProductId && mod.stripePriceId;
    console.log(`  ${mod.code}`);
    console.log(`    Price: $${((mod.oneTimePurchasePrice || 0) / 100).toFixed(2)}`);
    console.log(`    Stripe: ${hasStripe ? "✓ Configured" : "✗ Not configured"}`);
    if (hasStripe) {
      console.log(`    Product: ${mod.stripeProductId}`);
      console.log(`    Price: ${mod.stripePriceId}`);
    }
    console.log();
  }

  console.log("Next steps:");
  console.log("  1. Test purchase flow with Stripe test cards");
  console.log("  2. Configure webhook endpoint: POST /billing/webhooks/stripe");
  console.log("  3. Implement UI purchase flow");

  try {
    await (prisma as any).$disconnect();
  } catch {}
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
