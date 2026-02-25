/**
 * Unified production script: Create projects + apply org template + seed PETL.
 *
 * For each project column in the Iron Side CSV:
 *   1. Creates the project (if not already existing)
 *   2. Applies the "Iron Side New Construction" stock PO template (org tree)
 *   3. Creates full PETL chain: EstimateVersion → Sow → RawXactRow → SowLogicalItem → SowItem
 *   4. Links PETL items to org tree particles with % complete from CSV x marks
 *
 * Usage:
 *   COMPANY_ID=xxx DATABASE_URL=postgres://... npx ts-node scripts/seed-projects-with-petl.ts
 *
 *   Optional: USER_ID=yyy  (auto-assigns project membership)
 *
 * Idempotent:
 *   - Skips projects that already exist (by addressLine1 + companyId)
 *   - Skips PETL creation for projects that already have SowItems
 */

import * as path from "node:path";
require("dotenv").config({ path: path.resolve(__dirname, "../packages/database/.env") });

import { PrismaClient, ProjectParticleType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { parse } from "csv-parse/sync";
import * as fs from "node:fs";

const CSV_PATH =
  "/Volumes/4T Data/NEXUS Dropbox/NEXUS TEAM Folder/Iron Side Construction FL/job checklist example.csv";

// ---------------------------------------------------------------------------
// Checklist items — matches seed-checklist-costbook.ts exactly
// ---------------------------------------------------------------------------

interface ChecklistItem {
  group: string;
  name: string;
  sel: string;
  cat?: string;
  activity?: string;
  description?: string;
  unit?: string;
  unitPrice?: number;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  // Group 1
  { group: "1", name: "Soil Test",          sel: "ST" },
  { group: "1", name: "Boundary Survey",    sel: "ENG",    cat: "FEE", activity: "Replace", description: "Engineering fees (Bid Item)", unit: "EA", unitPrice: 0 },
  { group: "1", name: "Land Clearing",      sel: "BIDITM", cat: "LND", activity: "Replace", description: "Landscaping (Bid Item)", unit: "EA", unitPrice: 0 },
  { group: "1", name: "Fill Dirt 8 Loads",  sel: "EFILL",  cat: "EXC", activity: "Replace", description: "Engineered fill (per CY)", unit: "CY", unitPrice: 0 },
  { group: "1", name: "Rough Plumbing",     sel: "RP" },
  { group: "1", name: "House Pad",          sel: "SL4",    cat: "CNC", activity: "Remove and Replace", description: 'Concrete slab on grade - 4" - finished in place', unit: "SF", unitPrice: 14.65 },
  { group: "1", name: "Slab",              sel: "SLAB" },
  { group: "1", name: "Termit Pre-treat",   sel: "BIDITM", cat: "LND", activity: "Replace", description: "Landscaping Treatment (Bid Item)", unit: "EA", unitPrice: 0 },
  // Group 2
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
  // Group 3
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
  // Group 4
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

function groupToCat(group: string): string {
  return `P${group.padStart(2, "0")}`;
}

// Build PETL mapping by lowercase activity name for quick lookup.
interface PetlMapping {
  cat: string;
  sel: string;
  activity: string;
  description: string;
  unit: string;
  unitPrice: number;
  group: string;
}

const petlByName = new Map<string, PetlMapping>();
for (const item of CHECKLIST_ITEMS) {
  const key = item.name.toLowerCase().trim();
  if (!petlByName.has(key)) {
    petlByName.set(key, {
      cat: item.cat ?? groupToCat(item.group),
      sel: item.sel,
      activity: item.activity ?? "Checklist",
      description: item.description ?? item.name,
      unit: item.unit ?? "EA",
      unitPrice: item.unitPrice ?? 500,
      group: item.group,
    });
  }
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
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      console.error(`Company ${companyId} not found.`);
      process.exit(1);
    }
    console.log(`\n=== ${company.name} (${companyId}) ===\n`);

    // ── Parse CSV ─────────────────────────────────────────────────────
    if (!fs.existsSync(CSV_PATH)) {
      console.error(`CSV not found at: ${CSV_PATH}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(CSV_PATH, "utf-8");
    const rows: string[][] = parse(raw, { bom: true, relax_column_count: true });

    if (rows.length < 3) {
      console.error("CSV has fewer than 3 rows.");
      process.exit(1);
    }

    const headerRow = rows[0];
    const modelRow = rows[1];
    const dataRows = rows.slice(2);

    // Extract project columns.
    const projectCols: { address: string; model: string; colIdx: number }[] = [];
    for (let col = 2; col < headerRow.length; col++) {
      const addr = (headerRow[col] ?? "").trim();
      if (!addr) continue;
      const model = (modelRow[col] ?? "").trim();
      projectCols.push({ address: addr, model, colIdx: col });
    }

    // Parse checklist activities.
    const activities: { phase: string; name: string; rowIdx: number }[] = [];
    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const phase = (row[0] ?? "").trim();
      const actName = (row[1] ?? "").trim();
      if (!phase || !actName || !["1", "2", "3", "4"].includes(phase)) continue;
      activities.push({ phase, name: actName, rowIdx: r });
    }

    console.log(`Parsed ${projectCols.length} projects, ${activities.length} activities\n`);

    // ── Find stock template ───────────────────────────────────────────
    const stockTemplate = await prisma.orgTemplate.findFirst({
      where: { isStock: true, isActive: true, name: "Iron Side New Construction" },
      include: { nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });

    if (!stockTemplate) {
      console.error('Stock template "Iron Side New Construction" not found.');
      process.exit(1);
    }

    const nodesByParent = new Map<string, typeof stockTemplate.nodes>();
    for (const node of stockTemplate.nodes) {
      const key = node.parentNodeId ?? "__root__";
      const list = nodesByParent.get(key) ?? [];
      list.push(node);
      nodesByParent.set(key, list);
    }

    // ── Process each project ──────────────────────────────────────────
    let created = 0;
    let skipped = 0;
    let petlCreated = 0;

    for (const proj of projectCols) {
      const modelNote = proj.model ? ` (${proj.model})` : "";
      const projectName = `${proj.address}${modelNote}`;

      // Check existing.
      let project = await prisma.project.findFirst({
        where: { companyId, addressLine1: proj.address },
      });

      if (project) {
        // Project exists — check if PETL already done.
        const sowCount = await prisma.sowItem.count({
          where: { sow: { projectId: project.id } },
        });
        if (sowCount > 0) {
          console.log(`  SKIP "${projectName}" — already has ${sowCount} PETL items`);
          skipped++;
          continue;
        }
        console.log(`  EXISTS "${projectName}" — will add PETL`);
      } else {
        // Create project.
        project = await prisma.project.create({
          data: {
            companyId,
            name: projectName,
            addressLine1: proj.address,
            buildingModelType: proj.model || null,
            city: "Dunnellon",
            state: "FL",
            country: "US",
            orgTemplateId: stockTemplate.id,
          },
        });

        // Create root unit + particle.
        const unit = await prisma.projectUnit.create({
          data: { companyId, projectId: project.id, label: "Project Site" },
        });
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

        // Build completion map from CSV x marks.
        const completionMap = new Map<string, number>();
        for (const act of activities) {
          const cellValue = (dataRows[act.rowIdx][proj.colIdx] ?? "").trim().toLowerCase();
          completionMap.set(act.name.toLowerCase().trim(), cellValue === "x" ? 100 : 0);
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
            const pct = completionMap.get(node.name.toLowerCase().trim()) ?? 0;

            const particle = await prisma.projectParticle.create({
              data: {
                companyId,
                projectId: project!.id,
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

        // Auto-assign membership.
        const userId = process.env.USER_ID;
        if (userId) {
          await prisma.projectMembership
            .create({ data: { userId, projectId: project.id, companyId, role: "OWNER" } })
            .catch(() => {});
        }

        created++;
      }

      // ── Create PETL for this project ──────────────────────────────
      // Load all particles for this project.
      const particles = await prisma.projectParticle.findMany({
        where: { projectId: project.id },
      });

      // Find leaf particles (no children).
      const childCountMap = new Map<string, number>();
      for (const p of particles) {
        if (p.parentParticleId) {
          childCountMap.set(p.parentParticleId, (childCountMap.get(p.parentParticleId) ?? 0) + 1);
        }
      }
      const activityParticles = particles.filter(
        (p: any) => p.name !== "Project Site" && !childCountMap.has(p.id),
      );

      if (activityParticles.length === 0) {
        console.log(`    WARN: "${projectName}" — no activity particles, skipping PETL`);
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
        const mapping = petlByName.get(particle.name.toLowerCase().trim());
        if (!mapping) {
          console.log(`    WARN: No PETL mapping for "${particle.name}"`);
          continue;
        }

        lineNo++;
        const qty = 1;
        const itemAmount = qty * mapping.unitPrice;
        sowTotal += itemAmount;
        const pct = typeof particle.percentComplete === "number" ? particle.percentComplete : 0;

        // RawXactRow
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

        // SowLogicalItem
        const logicalItem = await prisma.sowLogicalItem.create({
          data: {
            projectId: project.id,
            projectParticleId: particle.id,
            signatureHash: `checklist-${mapping.cat}-${mapping.sel}-${lineNo}`,
          },
        });

        // SowItem
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

      petlCreated++;
      console.log(
        `  [${created + skipped + (project ? 0 : 0)}] "${projectName}" — ${lineNo} PETL items, $${sowTotal.toFixed(2)}`,
      );
    }

    console.log(`\n=== Summary ===`);
    console.log(`  Projects created: ${created}`);
    console.log(`  Projects skipped: ${skipped}`);
    console.log(`  Projects with PETL seeded: ${petlCreated}`);
    console.log(`  Template: ${stockTemplate.name}`);
    console.log(`  Company: ${company.name}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
