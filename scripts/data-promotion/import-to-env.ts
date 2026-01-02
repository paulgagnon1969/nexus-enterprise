#!/usr/bin/env ts-node

/**
 * Import previously exported JSON files (projects + daily logs) into the
 * current DATABASE_URL environment.
 *
 * This is the counterpart to export-selected.ts. It assumes you have manually
 * reviewed / sanitized the JSON files.
 *
 * Usage example:
 *
 *   cd scripts/data-promotion
 *   npx tsx import-to-env.ts --input-dir ../../promotion/2026-01-02
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";

interface CliArgs {
  inputDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const item of argv) {
    const m = item.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }

  const inputDir = args["input-dir"] || "";
  if (!inputDir) {
    throw new Error("--input-dir is required");
  }
  return { inputDir };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Export it before running this script.");
  }

  const { inputDir } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const absIn = path.resolve(inputDir);
  console.log("[import-to-env] Using DATABASE_URL=*** (hidden)");
  console.log("[import-to-env] Input dir:", absIn);

  const projectsPath = path.join(absIn, "projects.json");
  const logsPath = path.join(absIn, "daily-logs.json");

  const [projectsJson, logsJson] = await Promise.all([
    fs.readFile(projectsPath, "utf8"),
    fs.readFile(logsPath, "utf8").catch(() => "[]"),
  ]);

  const projects = JSON.parse(projectsJson) as any[];
  const dailyLogs = JSON.parse(logsJson) as any[];

  console.log(`[import-to-env] Will insert ${projects.length} projects and ${dailyLogs.length} daily logs`);

  try {
    await prisma.$transaction(async tx => {
      // NOTE: This intentionally does **not** delete anything first.
      // If you want a full replace, extend this script to delete rows for the
      // selected ids before inserting.

      if (projects.length) {
        console.log("[import-to-env] Inserting projects...");
        for (const p of projects) {
          // Upsert by id so you can safely re-run imports.
          await tx.project.upsert({
            where: { id: p.id },
            update: p,
            create: p,
          });
        }
      }

      if (dailyLogs.length) {
        console.log("[import-to-env] Inserting daily logs...");
        for (const d of dailyLogs) {
          await tx.dailyLog.upsert({
            where: { id: d.id },
            update: d,
            create: d,
          });
        }
      }
    });

    console.log("[import-to-env] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error("[import-to-env] ERROR", err);
  process.exit(1);
});
