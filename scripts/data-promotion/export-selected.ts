#!/usr/bin/env ts-node

/**
 * Export selected slices of data (e.g. projects + daily logs) from the current
 * DATABASE_URL into JSON files under a given output directory.
 *
 * This is intended for **manual, selective promotion** of real data from one
 * environment to another (dev → prod, prod → staging, etc.).
 *
 * Usage example:
 *
 *   cd scripts/data-promotion
 *   npx tsx export-selected.ts \
 *     --projects cmProjectId1,cmProjectId2 \
 *     --output-dir ../../promotion/2026-01-02
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PrismaClient } from "@prisma/client";

interface CliArgs {
  projects: string[];
  outputDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (const item of argv) {
    const m = item.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }

  const projectsRaw = args["projects"] || "";
  const projects = projectsRaw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const outputDir = args["output-dir"] || "";

  if (!projects.length) {
    throw new Error("--projects must list at least one Project.id (comma-separated)");
  }
  if (!outputDir) {
    throw new Error("--output-dir is required");
  }

  return { projects, outputDir };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Export it before running this script.");
  }

  const { projects, outputDir } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    // 1) Ensure output directory exists
    const absOut = path.resolve(outputDir);
    await fs.mkdir(absOut, { recursive: true });

    console.log("[export-selected] Using DATABASE_URL=*** (hidden)");
    console.log("[export-selected] Projects:", projects.join(", "));
    console.log("[export-selected] Output dir:", absOut);

    // 2) Export projects
    const projectRows = await prisma.project.findMany({
      where: { id: { in: projects } },
    });

    console.log(`[export-selected] Exporting ${projectRows.length} projects...`);
    await fs.writeFile(
      path.join(absOut, "projects.json"),
      JSON.stringify(projectRows, null, 2),
      "utf8",
    );

    // 3) Export related daily logs
    const dailyLogs = await prisma.dailyLog.findMany({
      where: { projectId: { in: projects } },
    });

    console.log(`[export-selected] Exporting ${dailyLogs.length} daily logs...`);
    await fs.writeFile(
      path.join(absOut, "daily-logs.json"),
      JSON.stringify(dailyLogs, null, 2),
      "utf8",
    );

    console.log("[export-selected] Done. Review files in:", absOut);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error("[export-selected] ERROR", err);
  process.exit(1);
});
