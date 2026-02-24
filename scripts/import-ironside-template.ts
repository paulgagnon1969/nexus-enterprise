/**
 * Import Iron Side Construction job checklist CSV as:
 * 1. An OrgTemplate ("Iron Side Residential New Construction")
 * 2. 34 projects with the template applied
 *
 * Usage:
 *   COMPANY_ID=<tenantId> npx ts-node scripts/import-ironside-template.ts
 *
 * Requires DATABASE_URL in environment (or .env loaded by Prisma).
 */

import { PrismaClient, ProjectParticleType } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const CSV_PATH =
  "/Volumes/4T Data/NEXUS Dropbox/NEXUS TEAM Folder/Iron Side Construction FL/job checklist example.csv";

const PHASE_LABELS: Record<string, string> = {
  "1": "Phase 1 – Site Prep",
  "2": "Phase 2 – Structure",
  "3": "Phase 3 – Finishes",
  "4": "Phase 4 – Exterior",
};

async function main() {
  const companyId = process.env.COMPANY_ID;
  if (!companyId) {
    console.error("ERROR: Set COMPANY_ID env var to the target tenant ID");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // -----------------------------------------------------------------------
    // 1. Parse CSV
    // -----------------------------------------------------------------------
    const raw = fs.readFileSync(CSV_PATH, "utf-8");
    // CSV has BOM; csv-parse handles it with bom option.
    const rows: string[][] = parse(raw, { bom: true, relax_column_count: true });

    if (rows.length < 3) {
      console.error("CSV has fewer than 3 rows — expected header + model + data");
      process.exit(1);
    }

    const headerRow = rows[0]; // Row 1: addresses in columns C+ (index 2+)
    const modelRow = rows[1]; // Row 2: model types
    const dataRows = rows.slice(2); // Rows 3+: phase, activity, x marks

    // Extract project addresses (columns C onward, index 2+).
    const projects: { address: string; model: string; colIdx: number }[] = [];
    for (let col = 2; col < headerRow.length; col++) {
      const addr = (headerRow[col] ?? "").trim();
      if (!addr) continue;
      // Skip the summary row at the bottom (row 43 has shortened addresses).
      const model = (modelRow[col] ?? "").trim();
      projects.push({ address: addr, model, colIdx: col });
    }

    // Extract phases and activities.
    type Activity = { phase: string; name: string; rowIdx: number };
    const activities: Activity[] = [];
    for (let r = 0; r < dataRows.length; r++) {
      const row = dataRows[r];
      const phase = (row[0] ?? "").trim();
      const activityName = (row[1] ?? "").trim();
      if (!phase || !activityName) continue;
      if (!PHASE_LABELS[phase]) continue; // skip non-phase rows (e.g. summary)
      activities.push({ phase, name: activityName, rowIdx: r });
    }

    console.log(`Parsed ${projects.length} projects, ${activities.length} activities`);

    // -----------------------------------------------------------------------
    // 2. Create OrgTemplate
    // -----------------------------------------------------------------------
    const template = await prisma.orgTemplate.create({
      data: {
        companyId,
        name: "Iron Side Residential New Construction",
        description:
          "4-phase residential new construction template imported from Iron Side Construction FL job checklist.",
        vertical: "residential",
      },
    });
    console.log(`Created OrgTemplate: ${template.id} "${template.name}"`);

    // Create phase nodes.
    const phaseNodes = new Map<string, string>(); // phase code → node ID
    for (const [code, label] of Object.entries(PHASE_LABELS)) {
      const node = await prisma.orgTemplateNode.create({
        data: {
          templateId: template.id,
          name: label,
          sortOrder: parseInt(code, 10),
        },
      });
      phaseNodes.set(code, node.id);
    }

    // Create activity nodes under phases.
    let activitySortOrder = 0;
    for (const act of activities) {
      const parentNodeId = phaseNodes.get(act.phase) ?? null;
      await prisma.orgTemplateNode.create({
        data: {
          templateId: template.id,
          parentNodeId,
          name: act.name,
          sortOrder: activitySortOrder++,
        },
      });
    }
    console.log(
      `Created ${Object.keys(PHASE_LABELS).length} phase nodes + ${activities.length} activity nodes`,
    );

    // -----------------------------------------------------------------------
    // 3. Reload template with all nodes for applying to projects
    // -----------------------------------------------------------------------
    const fullTemplate = await prisma.orgTemplate.findUniqueOrThrow({
      where: { id: template.id },
      include: {
        nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });

    // Build lookup for applying % from CSV.
    // Map: activityName (lowercase) → node ID
    const activityNodeByName = new Map<string, string>();
    for (const node of fullTemplate.nodes) {
      if (node.parentNodeId) {
        activityNodeByName.set(node.name.toLowerCase().trim(), node.id);
      }
    }

    // Build parent map for recursive particle creation.
    const nodesByParent = new Map<string | null, typeof fullTemplate.nodes>();
    for (const node of fullTemplate.nodes) {
      const key = node.parentNodeId ?? "__root__";
      const list = nodesByParent.get(key) ?? [];
      list.push(node);
      nodesByParent.set(key, list);
    }

    // -----------------------------------------------------------------------
    // 4. Create projects and apply template
    // -----------------------------------------------------------------------
    let projectsCreated = 0;

    for (const proj of projects) {
      // Parse address for city/state defaults.
      const name = proj.address;
      const modelNote = proj.model ? ` (${proj.model})` : "";

      const project = await prisma.project.create({
        data: {
          companyId,
          name: `${name}${modelNote}`,
          addressLine1: name,
          city: "Dunnellon", // Default for Iron Side FL projects
          state: "FL",
          country: "US",
          orgTemplateId: template.id,
        },
      });

      // Create "Project Site" unit.
      const unit = await prisma.projectUnit.create({
        data: {
          companyId,
          projectId: project.id,
          label: "Project Site",
        },
      });

      // Create root particle.
      await prisma.projectParticle.create({
        data: {
          companyId,
          projectId: project.id,
          unitId: unit.id,
          type: ProjectParticleType.ROOM,
          name: "Project Site",
          fullLabel: "Project Site",
        },
      });

      // Build a map of activity name → has "x" for this project column.
      const activityCompletion = new Map<string, number>();
      for (const act of activities) {
        const cellValue = (dataRows[act.rowIdx][proj.colIdx] ?? "").trim().toLowerCase();
        activityCompletion.set(
          act.name.toLowerCase().trim(),
          cellValue === "x" ? 100 : 0,
        );
      }

      // Recursively create particles from template nodes.
      const createParticles = async (
        parentNodeId: string | null,
        parentParticleId: string | null,
      ) => {
        const key = parentNodeId ?? "__root__";
        const children = nodesByParent.get(key) ?? [];
        for (const node of children) {
          // Determine percent complete from CSV (leaf nodes only).
          const pct = activityCompletion.get(node.name.toLowerCase().trim()) ?? 0;

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
            },
          });

          await createParticles(node.id, particle.id);
        }
      };

      await createParticles(null, null);

      // Create membership for the importing user (if USER_ID is set).
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
          .catch(() => {}); // Ignore if already exists
      }

      projectsCreated++;
      console.log(
        `  [${projectsCreated}/${projects.length}] Created project "${project.name}" (${project.id})`,
      );
    }

    console.log(`\nDone! Created ${projectsCreated} projects with template "${template.name}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
