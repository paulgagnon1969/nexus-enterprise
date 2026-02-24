/**
 * Seed Iron Side Construction checklist items into every tenant's Cost Book.
 *
 * Source: "job checklist example.csv" (Iron Side Construction FL)
 *   Column A = group code (1-4)
 *   Column B = activity name (40 items)
 *   Columns C+ = individual project addresses with "x" marks
 *
 * For each of the 40 checklist items, the script creates a CompanyPriceListItem
 * in every active tenant cost book with:
 *   CAT      = P01 / P02 / P03 / P04  (phase group)
 *   SEL      = initials of activity name (e.g. ST = Soil Test)
 *   Activity = Checklist
 *   Description = full activity name
 *   Unit     = EA
 *   UnitPrice = $500 (placeholder — editable in Cost Book later)
 *
 * Optionally, if COMPANY_ID is set, also creates projects from the CSV columns
 * and applies the stock PO template to each.
 *
 * Usage:
 *   npx ts-node scripts/seed-checklist-costbook.ts                  # cost book only (all tenants)
 *   COMPANY_ID=xxx npx ts-node scripts/seed-checklist-costbook.ts   # + create projects for tenant
 *
 * Requires DATABASE_URL in environment (or .env loaded by Prisma).
 */

import * as path from "node:path";
require("dotenv").config({ path: path.resolve(__dirname, "../packages/database/.env") });

import { PrismaClient, ProjectParticleType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { parse } from "csv-parse/sync";
import * as crypto from "node:crypto";
import * as fs from "node:fs";

const CSV_PATH =
  "/Volumes/4T Data/NEXUS Dropbox/NEXUS TEAM Folder/Iron Side Construction FL/job checklist example.csv";

// ---------------------------------------------------------------------------
// 40 checklist items — exact match to CSV nomenclature and sequence.
// SEL codes = initials of each word; single words get first 4 chars.
// ---------------------------------------------------------------------------

interface ChecklistItem {
  group: string;   // "1" | "2" | "3" | "4"
  name: string;    // exact CSV column B (used for PO template matching)
  sel: string;     // cost book SEL code
  // Optional Xactimate overrides (when present, replace default P0x / Checklist / $500)
  cat?: string;           // Xactimate CAT code (default: P01-P04 from group)
  activity?: string;      // Xactimate activity (default: "Checklist")
  description?: string;   // Xactimate description (default: item name)
  unit?: string;          // Unit of measure (default: "EA")
  unitPrice?: number;     // Unit price (default: 500)
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  // ── Group 1 ─────────────────────────────────────────────────────────
  { group: "1", name: "Soil Test",          sel: "ST" },
  { group: "1", name: "Boundary Survey",    sel: "ENG",    cat: "FEE", activity: "Replace", description: "Engineering fees (Bid Item)", unit: "EA", unitPrice: 0 },
  { group: "1", name: "Land Clearing",      sel: "BIDITM", cat: "LND", activity: "Replace", description: "Landscaping (Bid Item)", unit: "EA", unitPrice: 0 },
  { group: "1", name: "Fill Dirt 8 Loads",  sel: "EFILL",  cat: "EXC", activity: "Replace", description: "Engineered fill (per CY)", unit: "CY", unitPrice: 0 },
  { group: "1", name: "Rough Plumbing",     sel: "RP" },
  { group: "1", name: "House Pad",          sel: "SL4",    cat: "CNC", activity: "Remove and Replace", description: 'Concrete slab on grade - 4" - finished in place', unit: "SF", unitPrice: 14.65 },
  { group: "1", name: "Slab",              sel: "SLAB" },
  { group: "1", name: "Termit Pre-treat",   sel: "BIDITM", cat: "LND", activity: "Replace", description: "Landscaping Treatment (Bid Item)", unit: "EA", unitPrice: 0 },
  // ── Group 2 ─────────────────────────────────────────────────────────
  { group: "2", name: "Pump Service",        sel: "PUMP",  cat: "PLM", activity: "Remove and Replace", description: "Well pump - 5 HP - 150' deep", unit: "EA", unitPrice: 6126.88 },
  { group: "2", name: "Block",              sel: "BLCK" },
  { group: "2", name: "Pump Lintels",       sel: "PUMP",  cat: "CNC", activity: "Replace", description: "Concrete pump truck (per hour)", unit: "HR", unitPrice: 296.21 },
  { group: "2", name: "Framing",            sel: "FRMG" },
  { group: "2", name: "Window Install",     sel: "WI" },
  { group: "2", name: "2nd Rough Plumbing", sel: "2RP" },
  { group: "2", name: "Rough HVAC",         sel: "RHVC" },
  { group: "2", name: "Door Installation",  sel: "DI" },
  { group: "2", name: "Roof",              sel: "ROOF" },
  { group: "2", name: "Soffit Install",     sel: "SI" },
  { group: "2", name: "Stucco",            sel: "STCO" },
  { group: "2", name: "Stucco Grade",       sel: "PDB",   cat: "STU", activity: "Replace", description: "Stucco & Exterior Plaster (Paid Bill)", unit: "EA", unitPrice: 0 },
  { group: "2", name: "Septic Install",     sel: "SEWF>", cat: "PLM", activity: "Remove and Replace", description: "Sewage filtration/septic tank - 2000 gl.", unit: "EA", unitPrice: 9486.88 },
  // ── Group 3 ─────────────────────────────────────────────────────────
  { group: "3", name: "Drywall",            sel: "DRWL" },
  { group: "3", name: "Cabinet Assembly",   sel: "CA" },
  { group: "3", name: "HVAC Trim",          sel: "HT" },
  { group: "3", name: "Plumbing Trim",      sel: "PT" },
  { group: "3", name: "Soffit Install",     sel: "SI" },
  { group: "3", name: "Well Install",       sel: "PUMP",   cat: "PLM", activity: "Remove and Replace", description: "Well pump - 5 HP - 150' deep", unit: "EA", unitPrice: 6126.88 },
  { group: "3", name: "Mirrors & Shelving", sel: "HSWM",   cat: "HSW", activity: "Replace", description: "Mirrors - Enter price", unit: "EA", unitPrice: 0 },
  { group: "3", name: "Bathroom Hardware",  sel: "BH" },
  { group: "3", name: "Shelving",           sel: "SHLV" },
  { group: "3", name: "Lighting",           sel: "LTNG" },
  // ── Group 4 ─────────────────────────────────────────────────────────
  { group: "4", name: "DriveWay Pour",           sel: "DWP" },
  { group: "4", name: "Final Grade",             sel: "PDB",    cat: "LND", activity: "Replace", description: "Landscaping (Paid Bill)", unit: "EA", unitPrice: 0 },
  { group: "4", name: "Fill Dirt - Truck #421",  sel: "EFILL",  cat: "EXC", activity: "Replace", description: "Engineered fill (per CY)", unit: "CY", unitPrice: 0 },
  { group: "4", name: "BPI Certified Testing",   sel: "LDEXRC", cat: "FEE", activity: "Replace", description: "LEED for existing building - recertification review fee", unit: "EA", unitPrice: 1200 },
  { group: "4", name: "Sod installation",        sel: "LSOD",   cat: "LND", activity: "Replace", description: "Lawn - sod", unit: "SF", unitPrice: 1.08 },
  { group: "4", name: "Tree Service",            sel: "TRBID",  cat: "LND", activity: "Replace", description: "Tree replacement - (Bid Item)", unit: "EA", unitPrice: 0 },
  { group: "4", name: "Painting",                sel: "PNTG" },
  { group: "4", name: "Flooring labor",          sel: "FL" },
  { group: "4", name: "Trim labor",              sel: "TL" },
];

/** Map group code to CAT prefix: "1" → "P01", "2" → "P02", etc. */
function groupToCat(group: string): string {
  return `P${group.padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Canonical key hash (must match apps/api pricing.service.ts)
// ---------------------------------------------------------------------------

function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function buildCanonicalKeyHash(
  cat: string | null,
  sel: string | null,
  activity: string | null,
  description: string | null,
): string {
  const canonicalKeyString = [
    normalizeKeyPart(cat),
    normalizeKeyPart(sel),
    normalizeKeyPart(activity),
    normalizeKeyPart(description),
  ].join("||");

  return crypto
    .createHash("sha256")
    .update(canonicalKeyString, "utf8")
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    // ------------------------------------------------------------------
    // 1. Seed cost book items into ALL tenant cost books
    // ------------------------------------------------------------------
    console.log("=== Seeding checklist cost book items ===\n");

    // Find all active companies (tenants).
    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });
    console.log(`Found ${companies.length} active tenants.\n`);

    let totalItemsCreated = 0;
    let totalItemsSkipped = 0;

    for (const company of companies) {
      // Ensure tenant has a CompanyPriceList.
      let costBook = await prisma.companyPriceList.findFirst({
        where: { companyId: company.id, isActive: true },
        orderBy: { revision: "desc" },
      });

      if (!costBook) {
        // Create a minimal cost book if none exists.
        costBook = await prisma.companyPriceList.create({
          data: {
            companyId: company.id,
            label: "Tenant Cost Book",
            revision: 1,
            isActive: true,
          },
        });
        console.log(`  Created new cost book for "${company.name}"`);
      }

      // Load existing canonical hashes for fast dedup.
      const existingItems = await prisma.companyPriceListItem.findMany({
        where: { companyPriceListId: costBook.id },
        select: { canonicalKeyHash: true },
      });
      const existingHashes = new Set(
        existingItems.map((i) => i.canonicalKeyHash).filter(Boolean),
      );

      let created = 0;
      let skipped = 0;

      for (let idx = 0; idx < CHECKLIST_ITEMS.length; idx++) {
        const item = CHECKLIST_ITEMS[idx];
        const cat = item.cat ?? groupToCat(item.group);
        const sel = item.sel;
        const activity = item.activity ?? "Checklist";
        const description = item.description ?? item.name;
        const unit = item.unit ?? "EA";
        const unitPrice = item.unitPrice ?? 500;
        const hash = buildCanonicalKeyHash(cat, sel, activity, description);

        if (existingHashes.has(hash)) {
          skipped++;
          continue;
        }

        await prisma.companyPriceListItem.create({
          data: {
            companyPriceListId: costBook.id,
            canonicalKeyHash: hash,
            lineNo: idx + 1,
            groupCode: item.group,
            groupDescription: `Phase ${item.group}`,
            cat,
            sel,
            activity,
            description,
            unit,
            unitPrice,
            lastKnownUnitPrice: unitPrice,
            sourceVendor: "IRON_SIDE_CHECKLIST",
          },
        });
        created++;
      }

      totalItemsCreated += created;
      totalItemsSkipped += skipped;
      console.log(
        `  [${company.name}] ${created} items created, ${skipped} already existed`,
      );
    }

    console.log(
      `\nCost book seeding complete: ${totalItemsCreated} items created, ${totalItemsSkipped} skipped across ${companies.length} tenants.\n`,
    );

    // ------------------------------------------------------------------
    // 2. Optionally create projects from CSV (if COMPANY_ID is set)
    // ------------------------------------------------------------------
    const companyId = process.env.COMPANY_ID;
    if (!companyId) {
      console.log(
        "Set COMPANY_ID env var to also create projects from CSV columns.\n",
      );
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      console.error(`Company ${companyId} not found.`);
      process.exit(1);
    }

    console.log(`=== Creating projects for "${company.name}" ===\n`);

    // Parse CSV.
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`CSV not found at: ${CSV_PATH}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(CSV_PATH, "utf-8");
    const rows: string[][] = parse(raw, {
      bom: true,
      relax_column_count: true,
    });

    if (rows.length < 3) {
      console.error("CSV has fewer than 3 rows.");
      process.exit(1);
    }

    const headerRow = rows[0]; // addresses in columns C+ (index 2+)
    const modelRow = rows[1]; // model types
    const dataRows = rows.slice(2); // checklist data

    // Extract project addresses.
    const projectCols: {
      address: string;
      model: string;
      colIdx: number;
    }[] = [];
    for (let col = 2; col < headerRow.length; col++) {
      const addr = (headerRow[col] ?? "").trim();
      if (!addr) continue;
      const model = (modelRow[col] ?? "").trim();
      projectCols.push({ address: addr, model, colIdx: col });
    }

    // Find the stock template (already seeded by the API on startup).
    const stockTemplate = await prisma.orgTemplate.findFirst({
      where: { isStock: true, isActive: true, name: "Iron Side New Construction" },
      include: {
        nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });

    if (!stockTemplate) {
      console.error(
        'Stock template "Iron Side New Construction" not found. Start the API first to seed it.',
      );
      process.exit(1);
    }

    // Build node tree for applying template.
    const nodesByParent = new Map<string, typeof stockTemplate.nodes>();
    for (const node of stockTemplate.nodes) {
      const key = node.parentNodeId ?? "__root__";
      const list = nodesByParent.get(key) ?? [];
      list.push(node);
      nodesByParent.set(key, list);
    }

    // Parse checklist activities from data rows.
    const activities: { phase: string; name: string; rowIdx: number }[] = [];
    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const phase = (row[0] ?? "").trim();
      const actName = (row[1] ?? "").trim();
      if (!phase || !actName || !["1", "2", "3", "4"].includes(phase)) continue;
      activities.push({ phase, name: actName, rowIdx: r });
    }

    console.log(
      `Parsed ${projectCols.length} projects, ${activities.length} activities\n`,
    );

    let projectsCreated = 0;

    for (const proj of projectCols) {
      const modelNote = proj.model ? ` (${proj.model})` : "";

      // Check if project already exists (by address + company).
      const existing = await prisma.project.findFirst({
        where: {
          companyId,
          addressLine1: proj.address,
        },
      });
      if (existing) {
        console.log(`  SKIP "${proj.address}" — project already exists`);
        continue;
      }

      // Create the project.
      const project = await prisma.project.create({
        data: {
          companyId,
          name: `${proj.address}${modelNote}`,
          addressLine1: proj.address,
          buildingModelType: proj.model || null,
          city: "Dunnellon",
          state: "FL",
          country: "US",
          orgTemplateId: stockTemplate.id,
        },
      });

      // Create "Project Site" unit.
      const unit = await prisma.projectUnit.create({
        data: { companyId, projectId: project.id, label: "Project Site" },
      });

      // Create root particle.
      const rootParticle = await prisma.projectParticle.create({
        data: {
          companyId,
          projectId: project.id,
          unitId: unit.id,
          type: ProjectParticleType.ROOM,
          name: "Project Site",
          fullLabel: "Project Site",
        },
      });

      // Build completion map from CSV x marks for this project column.
      const completionMap = new Map<string, number>();
      for (const act of activities) {
        const cellValue = (dataRows[act.rowIdx][proj.colIdx] ?? "")
          .trim()
          .toLowerCase();
        completionMap.set(
          act.name.toLowerCase().trim(),
          cellValue === "x" ? 100 : 0,
        );
      }

      // Recursively create particles from template nodes.
      const createParticles = async (
        parentNodeId: string | null,
        parentParticleId: string | null,
        inheritedGroupCode: string | null,
      ) => {
        const key = parentNodeId ?? "__root__";
        const children = nodesByParent.get(key) ?? [];
        for (const node of children) {
          const groupCode = node.code ?? inheritedGroupCode;
          const pct =
            completionMap.get(node.name.toLowerCase().trim()) ?? 0;

          const particle = await prisma.projectParticle.create({
            data: {
              companyId,
              projectId: project.id,
              unitId: unit.id,
              type: ProjectParticleType.ROOM,
              name: node.name,
              fullLabel: node.name,
              parentParticleId,
              percentComplete: pct,
              externalGroupCode: groupCode,
              externalGroupDescription: node.name,
            },
          });

          await createParticles(node.id, particle.id, groupCode);
        }
      };

      await createParticles(null, rootParticle.id, null);

      // Auto-assign project membership if USER_ID is set.
      const userId = process.env.USER_ID;
      if (userId) {
        await prisma.projectMembership
          .create({
            data: {
              userId,
              projectId: project.id,
              companyId,
              role: "OWNER",
            },
          })
          .catch(() => {});
      }

      projectsCreated++;
      console.log(
        `  [${projectsCreated}/${projectCols.length}] Created "${project.name}" (${project.id})`,
      );
    }

    console.log(
      `\nDone! Created ${projectsCreated} projects with template "${stockTemplate.name}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
