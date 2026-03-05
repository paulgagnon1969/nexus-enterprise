/**
 * seed-module-catalog.ts
 *
 * Creates Stripe Products + monthly recurring Prices for each NCC module,
 * then upserts the corresponding ModuleCatalog rows in the database.
 *
 * Usage:
 *   npx ts-node src/scripts/seed-module-catalog.ts
 *
 * Requires: DATABASE_URL, STRIPE_SECRET_KEY in .env
 */

import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as path from "path";

// Load env from repo root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-02-25.clover",
});

// ── Module definitions ──────────────────────────────────────────────────
interface ModuleDef {
  code: string;
  label: string;
  description: string;
  monthlyPrice: number; // cents (e.g. 4900 = $49)
  pricingModel: "MONTHLY" | "PER_PROJECT" | "PER_USE";
  billingInterval?: "month" | "year"; // Stripe recurring interval; defaults to "month"
  projectUnlockPrice?: number; // cents — PER_PROJECT only
  isCore: boolean;
  sortOrder: number;
}

const MODULES: ModuleDef[] = [
  // ── Monthly subscription modules ──────────────────────────────────
  {
    code: "CORE",
    label: "Core Platform",
    description:
      "Company settings, user management, dashboard, basic project views. Always included.",
    monthlyPrice: 0,
    pricingModel: "MONTHLY",
    isCore: true,
    sortOrder: 0,
  },
  {
    code: "ESTIMATING",
    label: "Estimating & Cost Books",
    description:
      "PETL (Price Extrapolation & Tax Localization), cost books, line-item management.",
    monthlyPrice: 7900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 1,
  },
  {
    code: "SCHEDULING",
    label: "Scheduling & Daily Logs",
    description:
      "Project scheduling, Gantt views, daily log entries, weather integration.",
    monthlyPrice: 4900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 2,
  },
  {
    code: "FINANCIALS",
    label: "Financial Management",
    description:
      "Invoicing, payment tracking, project billing, financial reporting, payment applications.",
    monthlyPrice: 6900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 3,
  },
  {
    code: "DOCUMENTS",
    label: "Document Management",
    description:
      "Document import, OCR scanning, templates, tenant/system document library, plan sheets.",
    monthlyPrice: 3900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 4,
  },
  {
    code: "TIMEKEEPING",
    label: "Timekeeping & Payroll",
    description:
      "Daily timecards, crew time tracking, payroll export, overtime rules.",
    monthlyPrice: 4900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 5,
  },
  {
    code: "MESSAGING",
    label: "Messaging & Notifications",
    description:
      "Internal messaging, push notifications, email notifications, SMS alerts.",
    monthlyPrice: 2900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 6,
  },
  {
    code: "BIDDING",
    label: "Supplier Bidding",
    description:
      "Bid packages, supplier invitations, bid comparison, award management.",
    monthlyPrice: 3900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 7,
  },
  {
    code: "WORKFORCE",
    label: "Workforce Management",
    description:
      "Candidate pipeline, skills tracking, reputation scoring, referrals, onboarding.",
    monthlyPrice: 5900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 8,
  },
  {
    code: "COMPLIANCE",
    label: "Compliance & Safety",
    description:
      "OSHA sync, safety certifications, ICC code lookup, regulatory monitoring.",
    monthlyPrice: 3900,
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 9,
  },

  {
    code: "SUPPLIER_INDEX",
    label: "Supplier Index",
    description:
      "Local supplier discovery and lifecycle management. Geographic supplier scraping, status tracking, and map integration.",
    monthlyPrice: 20000, // $200/yr billed as recurring annual
    pricingModel: "MONTHLY",
    billingInterval: "year",
    isCore: false,
    sortOrder: 11,
  },
  {
    code: "NEXFIND",
    label: "NexFIND — Supplier Discovery & Network Intelligence",
    description:
      "Crowdsourced supplier discovery via Google Places, product search, directions capture, and global supplier network sharing.",
    monthlyPrice: 4900, // $49/mo
    pricingModel: "MONTHLY",
    isCore: false,
    sortOrder: 12,
  },

  // ── Per-project unlock features ───────────────────────────────────
  {
    code: "XACT_IMPORT",
    label: "Xactimate CSV Import",
    description:
      "Import Xactimate CSV estimates into a project. One-time unlock per project.",
    monthlyPrice: 0,
    pricingModel: "PER_PROJECT",
    projectUnlockPrice: 4900, // $49 per project
    isCore: false,
    sortOrder: 20,
  },
  {
    code: "DOCUMENT_AI",
    label: "Document AI Processing",
    description:
      "AI-powered document scanning, OCR, and data extraction. One-time unlock per project.",
    monthlyPrice: 0,
    pricingModel: "PER_PROJECT",
    projectUnlockPrice: 2900, // $29 per project
    isCore: false,
    sortOrder: 21,
  },
  {
    code: "DRAWINGS_BOM",
    label: "Drawings → BOM Pipeline",
    description:
      "Upload architectural drawings and generate a bill of materials. One-time unlock per project.",
    monthlyPrice: 0,
    pricingModel: "PER_PROJECT",
    projectUnlockPrice: 3900, // $39 per project
    isCore: false,
    sortOrder: 22,
  },
];

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 Seeding module catalog...\n");

  for (const mod of MODULES) {
    console.log(`  ${mod.code}: ${mod.label}`);

    let stripeProductId: string | null = null;
    let stripePriceId: string | null = null;

    // Create Stripe resources for paid modules (monthly or per-project)
    const needsStripe = mod.monthlyPrice > 0 || (mod.projectUnlockPrice && mod.projectUnlockPrice > 0);

    if (needsStripe) {
      // Check if product already exists (by metadata lookup)
      const existing = await stripe.products.search({
        query: `metadata["nexus_module_code"]:"${mod.code}"`,
      });

      let product: Stripe.Product;

      if (existing.data.length > 0) {
        product = existing.data[0];
        console.log(`    ↳ Stripe Product exists: ${product.id}`);
      } else {
        product = await stripe.products.create({
          name: `NCC – ${mod.label}`,
          description: mod.description,
          metadata: { nexus_module_code: mod.code },
        });
        console.log(`    ↳ Created Stripe Product: ${product.id}`);
      }

      stripeProductId = product.id;

      // Create recurring price for MONTHLY modules only
      if (mod.pricingModel === "MONTHLY" && mod.monthlyPrice > 0) {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          type: "recurring",
          limit: 1,
        });

        if (prices.data.length > 0) {
          stripePriceId = prices.data[0].id;
          console.log(`    ↳ Stripe Price exists: ${stripePriceId}`);
        } else {
          const interval = mod.billingInterval ?? "month";
          const price = await stripe.prices.create({
            product: product.id,
            unit_amount: mod.monthlyPrice,
            currency: "usd",
            recurring: { interval },
            metadata: { nexus_module_code: mod.code },
          });
          stripePriceId = price.id;
          const label = interval === "year" ? `$${(mod.monthlyPrice / 100).toFixed(2)}/yr` : `$${(mod.monthlyPrice / 100).toFixed(2)}/mo`;
          console.log(`    ↳ Created Stripe Price: ${price.id} (${label})`);
        }
      } else {
        console.log(`    ↳ PER_PROJECT feature — one-time charges via PaymentIntent ($${((mod.projectUnlockPrice || 0) / 100).toFixed(2)}/project)`);
      }
    } else {
      console.log(`    ↳ Core module — no Stripe billing`);
    }

    // Upsert into ModuleCatalog
    await prisma.moduleCatalog.upsert({
      where: { code: mod.code },
      update: {
        label: mod.label,
        description: mod.description,
        stripeProductId,
        stripePriceId,
        monthlyPrice: mod.monthlyPrice,
        pricingModel: mod.pricingModel,
        projectUnlockPrice: mod.projectUnlockPrice ?? null,
        isCore: mod.isCore,
        sortOrder: mod.sortOrder,
        active: true,
      },
      create: {
        code: mod.code,
        label: mod.label,
        description: mod.description,
        stripeProductId,
        stripePriceId,
        monthlyPrice: mod.monthlyPrice,
        pricingModel: mod.pricingModel,
        projectUnlockPrice: mod.projectUnlockPrice ?? null,
        isCore: mod.isCore,
        sortOrder: mod.sortOrder,
        active: true,
      },
    });
  }

  console.log(`\n✅ Seeded ${MODULES.length} modules into ModuleCatalog`);
  console.log("   Run 'curl http://localhost:8001/membership/catalog | jq' to verify\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
