/**
 * Backfill PETL line items (SowItems) for Iron Side checklist projects.
 *
 * For each project owned by COMPANY_ID that has the Iron Side template applied:
 *   1. Creates an EstimateVersion + Sow (one per project)
 *   2. For each activity-level particle (leaf nodes like "Soil Test"):
 *      - Finds the matching cost book item (by name → CHECKLIST_ITEMS mapping)
 *      - Creates RawXactRow, SowLogicalItem, SowItem
 *      - Sets percentComplete from the particle's existing value (CSV x → 100%)
 *
 * Usage:
 *   COMPANY_ID=xxx npx ts-node scripts/seed-checklist-petl.ts
 *
 * Idempotent: skips projects that already have SowItems.
 */

import * as path from "node:path";
require("dotenv").config({ path: path.resolve(__dirname, "../packages/database/.env") });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Checklist → cost book mapping (must match seed-checklist-costbook.ts)
// ---------------------------------------------------------------------------

interface CostBookMapping {
  name: string;       // activity name (matches particle name)
  group: string;      // "1" | "2" | "3" | "4"
  cat: string;        // Xactimate CAT or P01-P04
  sel: string;        // Xactimate SEL
  activity: string;   // "Checklist" or Xactimate activity
  description: string;
  unit: string;
  unitPrice: number;
}

const ITEMS: CostBookMapping[] = [
  // Group 1
  { name: "Soil Test",          group: "1", cat: "P01", sel: "ST",     activity: "Checklist", description: "Soil Test",          unit: "EA", unitPrice: 500 },
  { name: "Boundary Survey",    group: "1", cat: "FEE", sel: "ENG",    activity: "Replace",   description: "Engineering fees (Bid Item)", unit: "EA", unitPrice: 0 },
  { name: "Land Clearing",      group: "1", cat: "LND", sel: "BIDITM", activity: "Replace",   description: "Landscaping (Bid Item)",      unit: "EA", unitPrice: 0 },
  { name: "Fill Dirt 8 Loads",  group: "1", cat: "EXC", sel: "EFILL",  activity: "Replace",   description: "Engineered fill (per CY)",    unit: "CY", unitPrice: 0 },
  { name: "Rough Plumbing",     group: "1", cat: "P01", sel: "RP",     activity: "Checklist", description: "Rough Plumbing",     unit: "EA", unitPrice: 500 },
  { name: "House Pad",          group: "1", cat: "CNC", sel: "SL4",    activity: "Remove and Replace", description: 'Concrete slab on grade - 4" - finished in place', unit: "SF", unitPrice: 14.65 },
  { name: "Slab",               group: "1", cat: "P01", sel: "SLAB",   activity: "Checklist", description: "Slab",              unit: "EA", unitPrice: 500 },
  { name: "Termit Pre-treat",   group: "1", cat: "LND", sel: "BIDITM", activity: "Replace",   description: "Landscaping Treatment (Bid Item)", unit: "EA", unitPrice: 0 },
  // Group 2
  { name: "Pump Service",        group: "2", cat: "PLM", sel: "PUMP",  activity: "Remove and Replace", description: "Well pump - 5 HP - 150' deep", unit: "EA", unitPrice: 6126.88 },
  { name: "Block",               group: "2", cat: "P02", sel: "BLCK",  activity: "Checklist", description: "Block",             unit: "EA", unitPrice: 500 },
  { name: "Pump Lintels",        group: "2", cat: "CNC", sel: "PUMP",  activity: "Replace",   description: "Concrete pump truck (per hour)", unit: "HR", unitPrice: 296.21 },
  { name: "Framing",             group: "2", cat: "P02", sel: "FRMG",  activity: "Checklist", description: "Framing",           unit: "EA", unitPrice: 500 },
  { name: "Window Install",      group: "2", cat: "P02", sel: "WI",    activity: "Checklist", description: "Window Install",    unit: "EA", unitPrice: 500 },
  { name: "2nd Rough Plumbing",  group: "2", cat: "P02", sel: "2RP",   activity: "Checklist", description: "2nd Rough Plumbing", unit: "EA", unitPrice: 500 },
  { name: "Rough HVAC",          group: "2", cat: "P02", sel: "RHVC",  activity: "Checklist", description: "Rough HVAC",        unit: "EA", unitPrice: 500 },
  { name: "Door Installation",   group: "2", cat: "P02", sel: "DI",    activity: "Checklist", description: "Door Installation", unit: "EA", unitPrice: 500 },
  { name: "Roof",                group: "2", cat: "P02", sel: "ROOF",  activity: "Checklist", description: "Roof",              unit: "EA", unitPrice: 500 },
  { name: "Soffit Install",      group: "2", cat: "P02", sel: "SI",    activity: "Checklist", description: "Soffit Install",    unit: "EA", unitPrice: 500 },
  { name: "Stucco",              group: "2", cat: "P02", sel: "STCO",  activity: "Checklist", description: "Stucco",            unit: "EA", unitPrice: 500 },
  { name: "Stucco Grade",        group: "2", cat: "STU", sel: "PDB",   activity: "Replace",   description: "Stucco & Exterior Plaster (Paid Bill)", unit: "EA", unitPrice: 0 },
  { name: "Septic Install",      group: "2", cat: "PLM", sel: "SEWF>", activity: "Remove and Replace", description: "Sewage filtration/septic tank - 2000 gl.", unit: "EA", unitPrice: 9486.88 },
  // Group 3
  { name: "Drywall",             group: "3", cat: "P03", sel: "DRWL",  activity: "Checklist", description: "Drywall",           unit: "EA", unitPrice: 500 },
  { name: "Cabinet Assembly",    group: "3", cat: "P03", sel: "CA",    activity: "Checklist", description: "Cabinet Assembly",  unit: "EA", unitPrice: 500 },
  { name: "HVAC Trim",           group: "3", cat: "P03", sel: "HT",    activity: "Checklist", description: "HVAC Trim",         unit: "EA", unitPrice: 500 },
  { name: "Plumbing Trim",       group: "3", cat: "P03", sel: "PT",    activity: "Checklist", description: "Plumbing Trim",     unit: "EA", unitPrice: 500 },
  // Note: "Soffit Install" in group 3 shares the same particle name as group 2 — use group 3 cat
  { name: "Well Install",        group: "3", cat: "PLM", sel: "PUMP",  activity: "Remove and Replace", description: "Well pump - 5 HP - 150' deep", unit: "EA", unitPrice: 6126.88 },
  { name: "Mirrors & Shelving",  group: "3", cat: "HSW", sel: "HSWM",  activity: "Replace",   description: "Mirrors - Enter price", unit: "EA", unitPrice: 0 },
  { name: "Bathroom Hardware",   group: "3", cat: "P03", sel: "BH",    activity: "Checklist", description: "Bathroom Hardware", unit: "EA", unitPrice: 500 },
  { name: "Shelving",            group: "3", cat: "P03", sel: "SHLV",  activity: "Checklist", description: "Shelving",          unit: "EA", unitPrice: 500 },
  { name: "Lighting",            group: "3", cat: "P03", sel: "LTNG",  activity: "Checklist", description: "Lighting",          unit: "EA", unitPrice: 500 },
  // Group 4
  { name: "DriveWay Pour",            group: "4", cat: "P04", sel: "DWP",    activity: "Checklist", description: "DriveWay Pour",           unit: "EA", unitPrice: 500 },
  { name: "Final Grade",              group: "4", cat: "LND", sel: "PDB",    activity: "Replace",   description: "Landscaping (Paid Bill)",  unit: "EA", unitPrice: 0 },
  { name: "Fill Dirt - Truck #421",   group: "4", cat: "EXC", sel: "EFILL",  activity: "Replace",   description: "Engineered fill (per CY)", unit: "CY", unitPrice: 0 },
  { name: "BPI Certified Testing",    group: "4", cat: "FEE", sel: "LDEXRC", activity: "Replace",   description: "LEED for existing building - recertification review fee", unit: "EA", unitPrice: 1200 },
  { name: "Sod installation",         group: "4", cat: "LND", sel: "LSOD",   activity: "Replace",   description: "Lawn - sod",              unit: "SF", unitPrice: 1.08 },
  { name: "Tree Service",             group: "4", cat: "LND", sel: "TRBID",  activity: "Replace",   description: "Tree replacement - (Bid Item)", unit: "EA", unitPrice: 0 },
  { name: "Painting",                 group: "4", cat: "P04", sel: "PNTG",   activity: "Checklist", description: "Painting",                unit: "EA", unitPrice: 500 },
  { name: "Flooring labor",           group: "4", cat: "P04", sel: "FL",     activity: "Checklist", description: "Flooring labor",           unit: "EA", unitPrice: 500 },
  { name: "Trim labor",               group: "4", cat: "P04", sel: "TL",     activity: "Checklist", description: "Trim labor",               unit: "EA", unitPrice: 500 },
];

// Build a lookup by lowercase name (first match wins for duplicates like "Soffit Install").
const itemByName = new Map<string, CostBookMapping>();
for (const item of ITEMS) {
  const key = item.name.toLowerCase().trim();
  if (!itemByName.has(key)) itemByName.set(key, item);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const companyId = process.env.COMPANY_ID;
  if (!companyId) {
    console.error("Set COMPANY_ID env var.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    // Find all projects for this company that have the template applied.
    const projects = await prisma.project.findMany({
      where: { companyId, orgTemplateId: { not: null } },
      select: { id: true, name: true },
    });

    console.log(`Found ${projects.length} projects with PO template.\n`);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const project of projects) {
      // Skip if project already has SowItems.
      const existingItems = await prisma.sowItem.count({
        where: { sow: { projectId: project.id } },
      });
      if (existingItems > 0) {
        console.log(`  SKIP "${project.name}" — ${existingItems} PETL items already exist`);
        totalSkipped++;
        continue;
      }

      // Get all particles for this project.
      const particles = await prisma.projectParticle.findMany({
        where: { projectId: project.id },
      });

      // Find leaf particles (no children) — these are the activity-level items.
      const childCountMap = new Map<string, number>();
      for (const p of particles) {
        if (p.parentParticleId) {
          childCountMap.set(p.parentParticleId, (childCountMap.get(p.parentParticleId) ?? 0) + 1);
        }
      }
      const activityParticles = particles.filter(
        (p: any) => p.name !== "Project Site" && !childCountMap.has(p.id)
      );

      if (activityParticles.length === 0) {
        console.log(`  SKIP "${project.name}" — no activity particles found`);
        totalSkipped++;
        continue;
      }

      // Create EstimateVersion.
      const estimateVersion = await prisma.estimateVersion.create({
        data: {
          projectId: project.id,
          sourceType: "CHECKLIST",
          fileName: "iron-side-checklist.csv",
          storedPath: "seed/iron-side-checklist",
          estimateKind: "CHECKLIST",
          sequenceNo: 1,
          defaultPayerType: "OWNER",
          description: "Iron Side construction checklist import",
          status: "COMPLETE",
          importedAt: new Date(),
        },
      });

      // Create Sow.
      const sow = await prisma.sow.create({
        data: {
          projectId: project.id,
          estimateVersionId: estimateVersion.id,
          sourceType: "CHECKLIST",
          totalAmount: 0,
        },
      });

      let lineNo = 0;
      let sowTotal = 0;

      for (const particle of activityParticles) {
        const mapping = itemByName.get(particle.name.toLowerCase().trim());
        if (!mapping) {
          console.log(`    WARN: No cost book mapping for "${particle.name}"`);
          continue;
        }

        lineNo++;
        const qty = 1;
        const itemAmount = qty * mapping.unitPrice;
        sowTotal += itemAmount;
        const pct = typeof particle.percentComplete === "number" ? particle.percentComplete : 0;

        // Create RawXactRow.
        const rawRow = await prisma.rawXactRow.create({
          data: {
            estimateVersionId: estimateVersion.id,
            lineNo,
            groupCode: mapping.group,
            groupDescription: `Phase ${mapping.group}`,
            desc: mapping.description,
            qty,
            itemAmount,
            unitCost: mapping.unitPrice,
            unit: mapping.unit,
            activity: mapping.activity,
            cat: mapping.cat,
            sel: mapping.sel,
            rcv: itemAmount,
            acv: itemAmount,
            sourceName: "IRON_SIDE_CHECKLIST",
          },
        });

        // Create SowLogicalItem.
        const logicalItem = await prisma.sowLogicalItem.create({
          data: {
            projectId: project.id,
            projectParticleId: particle.id,
            signatureHash: `checklist-${mapping.cat}-${mapping.sel}-${lineNo}`,
          },
        });

        // Create SowItem.
        await prisma.sowItem.create({
          data: {
            sowId: sow.id,
            estimateVersionId: estimateVersion.id,
            rawRowId: rawRow.id,
            logicalItemId: logicalItem.id,
            projectParticleId: particle.id,
            lineNo,
            sourceLineNo: lineNo,
            description: mapping.description,
            qty,
            originalQty: qty,
            unit: mapping.unit,
            unitCost: mapping.unitPrice,
            itemAmount,
            rcvAmount: itemAmount,
            categoryCode: mapping.cat,
            selectionCode: mapping.sel,
            activity: mapping.activity,
            payerType: "OWNER",
            percentComplete: pct,
            performed: pct >= 100,
          },
        });
      }

      // Update Sow total.
      await prisma.sow.update({
        where: { id: sow.id },
        data: { totalAmount: sowTotal },
      });

      totalCreated++;
      console.log(
        `  [${totalCreated}] "${project.name}" — ${lineNo} PETL items, $${sowTotal.toFixed(2)} total`,
      );
    }

    console.log(
      `\nDone! ${totalCreated} projects seeded with PETL, ${totalSkipped} skipped.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
