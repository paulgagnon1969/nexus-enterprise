/**
 * import-buildertrend.ts
 *
 * CLI entry point for Buildertrend → NCC migration.
 *
 * Usage:
 *   npx ts-node src/scripts/import-buildertrend.ts \
 *     --source-dir "/path/to/bt/export" \
 *     --company-id "cmjr9okjz000401s6rdkbatvr" \
 *     [--dry-run] \
 *     [--label "Tapout BIA"] \
 *     [--include-parent-media]
 *
 * Multiple source dirs can be provided:
 *   npx ts-node src/scripts/import-buildertrend.ts \
 *     --source-dir "/path/to/folder1" \
 *     --source-dir "/path/to/folder2" \
 *     --source-dir "/path/to/folder3" \
 *     --company-id "..." \
 *     --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { runBtImport } from "../modules/bt-import/bt-import.service";
import type { BtImportConfig } from "../modules/bt-import/bt-import.types";

// Load env from repo root
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

// ── CLI arg parser ──────────────────────────────────────────────────────

function parseArgs(): {
  sourceDirs: string[];
  companyId: string;
  dryRun: boolean;
  labels: string[];
  includeParentMedia: boolean;
} {
  const args = process.argv.slice(2);
  const sourceDirs: string[] = [];
  const labels: string[] = [];
  let companyId = "";
  let dryRun = false;
  let includeParentMedia = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--source-dir":
        sourceDirs.push(args[++i]);
        break;
      case "--company-id":
        companyId = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--label":
        labels.push(args[++i]);
        break;
      case "--include-parent-media":
        includeParentMedia = true;
        break;
      default:
        console.error(`Unknown arg: ${args[i]}`);
        process.exit(1);
    }
  }

  if (sourceDirs.length === 0) {
    console.error("Error: at least one --source-dir is required");
    process.exit(1);
  }
  if (!companyId) {
    console.error("Error: --company-id is required");
    process.exit(1);
  }

  return { sourceDirs, companyId, dryRun, labels, includeParentMedia };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { sourceDirs, companyId, dryRun, labels, includeParentMedia } = parseArgs();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      console.error(`Company not found: ${companyId}`);
      process.exit(1);
    }
    console.log(`\n🏢 Target company: ${company.name} (${company.id})\n`);

    // Find a user to attribute records to (first admin or owner)
    const membership = await prisma.companyMembership.findFirst({
      where: { companyId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    const fallbackUserId = membership?.userId;
    if (!fallbackUserId) {
      console.error("No OWNER or ADMIN found for this company. Cannot attribute records.");
      process.exit(1);
    }
    console.log(`👤 Fallback author: ${fallbackUserId}\n`);

    // Run import for each source dir
    for (let i = 0; i < sourceDirs.length; i++) {
      const sourceDir = sourceDirs[i];
      const label = labels[i]; // may be undefined

      console.log(`\n${"═".repeat(60)}`);
      console.log(`  Import ${i + 1}/${sourceDirs.length}: ${sourceDir}`);
      console.log(`${"═".repeat(60)}\n`);

      const config: BtImportConfig = {
        sourceDir,
        companyId,
        dryRun,
        skipFiles: true, // Skip file uploads for now
        projectGroupLabel: label,
        includeParentMedia,
        fallbackUserId,
        authorMap: {}, // No author mapping for initial import
      };

      const result = await runBtImport(prisma, config);

      console.log(`\n📊 Result for: ${sourceDir}`);
      console.log(`   ProjectGroup: ${result.projectGroupId || "(dry run)"}`);
      console.log(`   Projects: ${result.projects.length}`);
      for (const p of result.projects) {
        console.log(`     • ${p.name} (${p.id || "dry-run"}) — BT jobs: ${p.btJobNames.join(", ")}`);
      }
      console.log(`   Daily Logs: ${result.counts.dailyLogs}`);
      console.log(`   Bills: ${result.counts.bills}`);
      console.log(`   Invoices: ${result.counts.invoices}`);
      if (result.errors.length > 0) {
        console.log(`   ⚠ Errors: ${result.errors.length}`);
        for (const err of result.errors.slice(0, 10)) {
          console.log(`     - ${err}`);
        }
        if (result.errors.length > 10) {
          console.log(`     ... and ${result.errors.length - 10} more`);
        }
      }
    }

    console.log(`\n✅ All imports complete.\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
