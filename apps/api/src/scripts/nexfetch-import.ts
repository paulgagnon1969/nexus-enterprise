/**
 * nexfetch-import.ts — NexFetch Receipt Import CLI
 *
 * Reads .emlx files from a directory, parses receipts, matches to projects,
 * screenshots the HTML, and creates ProjectBills + EmailReceipts in the DB.
 *
 * Usage:
 *   npx ts-node src/scripts/nexfetch-import.ts \
 *     --dir "/Volumes/4T Data/20260301 - HD Receipts Consolidation" \
 *     --company-id <cuid> \
 *     [--dry-run] \
 *     [--skip-screenshots] \
 *     [--vendor home_depot|lowes]
 *
 * Requires: DATABASE_URL in .env (or sourced from ~/.nexus-prod-env)
 */

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

import { readEmlxFile } from "../modules/nexfetch/emlx-reader";
import { parseHomeDepotReceipt } from "../modules/nexfetch/parsers/home-depot.parser";
import { parseLowesReceipt } from "../modules/nexfetch/parsers/lowes.parser";
import { matchReceiptToProject } from "../modules/nexfetch/matcher";
import { createBillFromReceipt } from "../modules/nexfetch/bill-creator";
import { screenshotReceiptHtml } from "../modules/nexfetch/screenshot";
import type { ParsedReceipt } from "../modules/nexfetch/parsers/types";

// ── Env & DB ─────────────────────────────────────────────────────────

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

function initPrisma(): PrismaClient {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// ── CLI Args ─────────────────────────────────────────────────────────

interface CliArgs {
  dir: string;
  companyId: string;
  dryRun: boolean;
  skipScreenshots: boolean;
  vendor: "home_depot" | "lowes" | null;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();
  const flags = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      flags.add("dryRun");
    } else if (args[i] === "--skip-screenshots") {
      flags.add("skipScreenshots");
    } else if (args[i].startsWith("--") && i + 1 < args.length) {
      map.set(args[i].replace("--", ""), args[i + 1]);
      i++;
    }
  }

  const dir = map.get("dir");
  const companyId = map.get("company-id");

  if (!dir || !companyId) {
    console.error("Usage: nexfetch-import --dir <path> --company-id <id> [--dry-run] [--skip-screenshots] [--vendor home_depot|lowes]");
    process.exit(1);
  }

  const vendor = map.get("vendor") as CliArgs["vendor"] || null;

  return {
    dir,
    companyId,
    dryRun: flags.has("dryRun"),
    skipScreenshots: flags.has("skipScreenshots"),
    vendor,
  };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const prisma = initPrisma();

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║         NexFetch — Receipt Import CLI        ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Directory:   ${args.dir}`);
  console.log(`  Company ID:  ${args.companyId}`);
  console.log(`  Dry run:     ${args.dryRun}`);
  console.log(`  Screenshots: ${!args.skipScreenshots}`);
  console.log(`  Vendor:      ${args.vendor || "auto-detect"}`);
  console.log("");

  // ── Validate company exists ────────────────────────────
  const company = await prisma.company.findUnique({
    where: { id: args.companyId },
    select: { id: true, name: true },
  });

  if (!company) {
    console.error(`❌ Company ${args.companyId} not found`);
    process.exit(1);
  }
  console.log(`  Company:     ${company.name}\n`);

  // ── Collect .emlx files ────────────────────────────────
  const files = fs
    .readdirSync(args.dir)
    .filter((f) => f.endsWith(".emlx"))
    .sort();

  console.log(`Found ${files.length} .emlx file(s)\n`);

  if (files.length === 0) {
    console.log("Nothing to import.");
    await prisma.$disconnect();
    return;
  }

  // ── Stats ──────────────────────────────────────────────
  const stats = {
    total: files.length,
    parsed: 0,
    parseFailed: 0,
    matched: 0,
    autoAssigned: 0,
    suggested: 0,
    unassigned: 0,
    billsCreated: 0,
    skippedDryRun: 0,
    skippedDuplicate: 0,
  };

  // ── Process each file ──────────────────────────────────
  for (let i = 0; i < files.length; i++) {
    const fileName = files[i];
    const filePath = path.join(args.dir, fileName);
    const progress = `[${i + 1}/${files.length}]`;

    try {
      // 1. Read .emlx
      const emlx = await readEmlxFile(filePath);

      // Check vendor filter
      if (args.vendor && emlx.vendor !== args.vendor.toUpperCase()) continue;

      // 2. Check for duplicate (by messageId)
      if (emlx.messageId) {
        const existing = await prisma.emailReceipt.findUnique({
          where: { messageId: emlx.messageId },
          select: { id: true },
        });
        if (existing) {
          console.log(`${progress} SKIP (duplicate) ${fileName}`);
          stats.skippedDuplicate++;
          continue;
        }
      }

      // 3. Parse receipt HTML
      let receipt: ParsedReceipt;
      if (emlx.vendor === "HOME_DEPOT") {
        receipt = parseHomeDepotReceipt(emlx.html);
      } else if (emlx.vendor === "LOWES") {
        receipt = parseLowesReceipt(emlx.html);
      } else {
        console.log(`${progress} SKIP (unknown vendor) ${fileName}`);
        stats.parseFailed++;
        continue;
      }

      stats.parsed++;

      // 4. Match to project
      const match = await matchReceiptToProject(receipt, args.companyId, prisma);

      // 5. Screenshot (optional)
      let screenshotBuffer: Buffer | null = null;
      if (!args.skipScreenshots && match.projectId) {
        try {
          const ssResult = await screenshotReceiptHtml(emlx.html);
          screenshotBuffer = ssResult.buffer;
        } catch (err) {
          console.warn(`${progress} ⚠ Screenshot failed: ${(err as Error).message}`);
        }
      }

      // 6. Persist (unless dry-run)
      if (args.dryRun) {
        const conf = Math.round(match.confidence * 100);
        const proj = match.projectName || "—";
        console.log(`${progress} DRY ${match.status} ${conf}% → ${proj} | ${fileName}`);
        stats.skippedDryRun++;
      } else {
        const result = await createBillFromReceipt(
          {
            receipt,
            match,
            companyId: args.companyId,
            screenshotBuffer,
            senderEmail: emlx.from,
            subject: emlx.subject,
            receivedAt: emlx.date || new Date(),
            messageId: emlx.messageId,
            sourceFilePath: filePath,
          },
          prisma,
        );

        const conf = Math.round(match.confidence * 100);
        const proj = match.projectName || "—";
        console.log(`${progress} ${result.status} ${conf}% → ${proj} | ${fileName}`);

        if (result.projectBillId) stats.billsCreated++;
      }

      // Update stats
      switch (match.status) {
        case "ASSIGNED":
          stats.autoAssigned++;
          stats.matched++;
          break;
        case "MATCHED":
          stats.suggested++;
          stats.matched++;
          break;
        default:
          stats.unassigned++;
      }
    } catch (err) {
      console.error(`${progress} ❌ FAILED ${fileName}: ${(err as Error).message}`);
      stats.parseFailed++;
    }
  }

  // ── Summary ────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║              Import Summary                  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`  Total files:      ${stats.total}`);
  console.log(`  Parsed:           ${stats.parsed}`);
  console.log(`  Parse failures:   ${stats.parseFailed}`);
  console.log(`  Duplicates:       ${stats.skippedDuplicate}`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Auto-assigned:    ${stats.autoAssigned} (≥95% confidence → bill created)`);
  console.log(`  Suggested (PM):   ${stats.suggested} (50–94% → needs review)`);
  console.log(`  Unassigned:       ${stats.unassigned} (<50% → manual)`);
  console.log(`  Bills created:    ${stats.billsCreated}`);
  if (args.dryRun) {
    console.log(`  ⚠ DRY RUN — no records were written to the database`);
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
