import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "../client";

function parseMoney(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).replace(/[,$]/g, "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function parseIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const raw = String(value).replace(/,/g, "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

async function importStateOesCsv(opts: {
  stateCode: string;
  year: number;
  csvPath: string;
}) {
  const absPath = path.resolve(opts.csvPath);
  const raw = await fs.readFile(absPath, "utf8");

  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
  }) as any[];

  const snapshot = await prisma.stateOccupationalWageSnapshot.upsert({
    where: {
      StateOccWageSnapshot_state_year_source_key: {
        stateCode: opts.stateCode,
        year: opts.year,
        source: "BLS_OES",
      },
    },
    update: {
      updatedAt: new Date(),
    },
    create: {
      stateCode: opts.stateCode,
      year: opts.year,
      source: "BLS_OES",
    },
    select: { id: true },
  });

  // Clear any existing rows for this snapshot so it exactly mirrors the CSV
  await prisma.stateOccupationalWage.deleteMany({
    where: { snapshotId: snapshot.id },
  });

  // Normalize header keys to be more robust to non-breaking spaces etc.
  const rows = records.map((raw) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      const normKey = k
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      r[normKey] = v;
    }

    const occStr = String(r["Occupation (SOC code)"] || "").trim();
    let socCode = "";
    let name = occStr;
    const match = occStr.match(/\((\d{2}-\d{4})\)$/);
    if (match) {
      socCode = match[1];
      name = occStr.replace(/\s*\(\d{2}-\d{4}\)\s*$/, "");
    }

    return {
      snapshotId: snapshot.id,
      socCode,
      occupationName: name,
      employment: parseIntOrNull(r["Employment (1)"]),
      hourlyMean: parseMoney(r["Hourly mean wage"]),
      annualMean: parseMoney(r["Annual mean wage (2)"]),
      hourlyP10: parseMoney(r["Hourly 10th percentile wage"]),
      hourlyP25: parseMoney(r["Hourly 25th percentile wage"]),
      hourlyMedian: parseMoney(r["Hourly median wage"]),
      hourlyP75: parseMoney(r["Hourly 75th percentile wage"]),
      hourlyP90: parseMoney(r["Hourly 90th percentile wage"]),
      annualP10: parseMoney(r["Annual 10th percentile wage (2)"]),
      annualP25: parseMoney(r["Annual 25th percentile wage (2)"]),
      annualMedian: parseMoney(r["Annual median wage (2)"]),
      annualP75: parseMoney(r["Annual 75th percentile wage (2)"]),
      annualP90: parseMoney(r["Annual 90th percentile wage (2)"]),
      employmentPerThousand: parseMoney(r["Employment per 1,000 jobs"]),
      locationQuotient: parseMoney(r["Location Quotient"]),
    };
  });

  const cleaned = rows.filter((row) => row.occupationName && row.socCode);

  if (cleaned.length === 0) {
    console.warn(
      `No occupational wage rows parsed for ${opts.stateCode} ${opts.year} from ${absPath}`,
    );
    return;
  }

  await prisma.stateOccupationalWage.createMany({
    data: cleaned,
  });

  console.log(
    `Imported ${cleaned.length} occupational wage rows for ${opts.stateCode} ${opts.year} from ${absPath}`,
  );
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (const part of argv.slice(2)) {
    const [key, value] = part.split("=");
    if (key && value) {
      args[key.replace(/^--/, "")] = value;
    }
  }
  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const stateCode = (args.state || args.stateCode || "").toUpperCase();
    const year = Number(args.year || new Date().getFullYear());
    const csvPath = args.file || args.csvPath;

    if (!stateCode) {
      throw new Error("--state=<STATE_CODE> is required (e.g. AZ, NM)");
    }
    if (!csvPath) {
      throw new Error("--file=<path/to/csv> is required");
    }

    await importStateOesCsv({ stateCode, year, csvPath });
  } catch (err) {
    console.error("Error importing state occupational wages:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
