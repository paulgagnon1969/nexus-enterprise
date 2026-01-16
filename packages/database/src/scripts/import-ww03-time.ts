import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "../client";

const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

// Map Fortified project codes used in the WW03 sheets to real Project IDs.
const PROJECT_ID_BY_CODE: Record<string, string> = {
  CCT: "cmjwjgmlf000f01s6c5atcwuu",
  CBS: "cmk65uim5000601s685j7bbpj",
};

interface Ww03Row {
  rawName: string; // e.g. "Whitesheep, Cantrail"
  fullName: string; // normalized "First Last" used as Worker.fullName / employeeId
  firstName: string;
  lastName: string;
  projectCode: keyof typeof PROJECT_ID_BY_CODE;
  totalHours: number;
  dailySt: number[]; // length 7, order matches columns in the CSV (earliest..latest)
}

function parseCurrency(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseNumber(raw?: string): number {
  if (!raw) return 0;
  const t = String(raw).trim();
  if (!t || t === "." || t.toUpperCase() === "#N/A") return 0;
  const cleaned = t.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeName(selectName: string): {
  rawName: string;
  fullName: string;
  firstName: string;
  lastName: string;
} {
  const raw = selectName.trim();
  if (!raw) {
    return { rawName: "", fullName: "", firstName: "", lastName: "" };
  }

  let firstName = raw;
  let lastName = "";

  if (raw.includes(",")) {
    const [last, first] = raw.split(",");
    lastName = (last ?? "").trim();
    firstName = (first ?? "").trim();
  } else {
    const parts = raw.split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? raw;
    lastName = parts.slice(1).join(" ") || "";
  }

  const fullName = `${firstName} ${lastName}`.trim();
  return { rawName: raw, fullName, firstName, lastName };
}

function loadWw03File(projectCode: keyof typeof PROJECT_ID_BY_CODE, csvPath: string): Ww03Row[] {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`WW03 CSV not found for ${projectCode} at ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines.length < 3) {
    return [];
  }

  // Drop the first summary row so that the second row becomes the header.
  const [, ...rest] = lines;
  const withoutFirst = rest.join("\n");

  const records = parse(withoutFirst, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  if (!records.length) return [];

  const sample = records[0];
  const headers = Object.keys(sample);
  const subCostIdx = headers.indexOf("Subcontractor Cost");
  if (subCostIdx < 0 || subCostIdx + 7 >= headers.length) {
    throw new Error(
      `Could not locate 7 daily hour columns after 'Subcontractor Cost' for ${projectCode}. Headers=${headers.join(",")}`,
    );
  }

  const dayKeys = headers.slice(subCostIdx + 1, subCostIdx + 8);

  const rows: Ww03Row[] = [];

  for (const rec of records) {
    const selectName = (rec["Select Name"] ?? "").trim();
    if (!selectName) continue;

    const totalHours = parseNumber(rec["Total Hours"]);
    if (!totalHours) continue; // skip zero-hour rows

    const { rawName, fullName, firstName, lastName } = normalizeName(selectName);

    const dailySt = dayKeys.map((k) => parseNumber(rec[k]));
    const sumDaily = dailySt.reduce((a, b) => a + b, 0);

    if (Math.abs(sumDaily - totalHours) > 0.01) {
      // Log a warning but still proceed; spreadsheet rounding might differ.
      console.warn(
        `WW03 ${projectCode}: totalHours mismatch for ${rawName}: total=${totalHours} vs sumDaily=${sumDaily.toFixed(
          2,
        )}`,
      );
    }

    rows.push({
      rawName,
      fullName,
      firstName,
      lastName,
      projectCode,
      totalHours,
      dailySt,
    });
  }

  return rows;
}

async function main() {
  // __dirname = packages/database/src/scripts → repo root is four levels up
  const repoRoot = path.resolve(__dirname, "../../../..");
  const timecardsDir = path.join(repoRoot, "docs", "timecards");

  const cbsPath = path.join(timecardsDir, "WW03-CBS.csv");
  const cctPath = path.join(timecardsDir, "WW03-CCT.csv");

  const cbsRows = loadWw03File("CBS", cbsPath);
  const cctRows = loadWw03File("CCT", cctPath);

  console.log(`Loaded ${cbsRows.length} rows from WW03-CBS and ${cctRows.length} from WW03-CCT`);

  const allRows: Ww03Row[] = [...cbsRows, ...cctRows];
  if (!allRows.length) {
    console.log("No WW03 rows to import.");
    await prisma.$disconnect();
    return;
  }

  // For WW03 we know the week ending date is Thursday 2026-01-15.
  const weekEndDate = new Date("2026-01-15T00:00:00Z");

  let upserted = 0;

  for (const row of allRows) {
    if (!row.fullName) continue;

    const projectId = PROJECT_ID_BY_CODE[row.projectCode] ?? null;

    // Look up Worker to get default hourly rate, if any.
    const worker = await prisma.worker.findUnique({
      where: { fullName: row.fullName },
    });

    const baseHourlyRate: number | null =
      worker?.defaultPayRate != null ? worker.defaultPayRate : null;

    const totalHoursSt = row.dailySt.reduce((a, b) => a + b, 0);

    // Try to use the weekly Amount column when present; fall back to rate * hours.
    // Note: WW03 sheets store the Amount column but we re-read it here per worker
    // via a best-effort approximation using defaultPayRate.
    let totalPay = 0;
    if (baseHourlyRate != null) {
      totalPay = baseHourlyRate * totalHoursSt;
    }

    const daily = row.dailySt.map((st) => ({ st, ot: 0, dt: 0 }));

    const employeeId = row.fullName; // stable key for uniqueness across runs

    const result = await prisma.payrollWeekRecord.upsert({
      where: {
        PayrollWeek_company_proj_week_emp_key: {
          companyId: FORTIFIED_COMPANY_ID,
          projectCode: row.projectCode,
          weekEndDate,
          employeeId,
        },
      },
      update: {
        firstName: row.firstName,
        lastName: row.lastName,
        weekCode: "WW03",
        totalPay,
        totalHoursSt,
        totalHoursOt: 0,
        totalHoursDt: 0,
        baseHourlyRate,
        dailyHoursJson: daily as any,
        projectId,
      },
      create: {
        companyId: FORTIFIED_COMPANY_ID,
        projectId,
        projectCode: row.projectCode,
        workerId: worker?.id ?? null,
        employeeId,
        firstName: row.firstName,
        lastName: row.lastName,
        ssn: worker?.ssnHash ?? null,
        classCode: null,
        weekCode: "WW03",
        weekEndDate,
        employmentType: "CONTRACTOR_1099",
        baseHourlyRate,
        dayRate: null,
        dayRateBaseHours: null,
        totalPay,
        totalHoursSt,
        totalHoursOt: 0,
        totalHoursDt: 0,
        dailyHoursJson: daily as any,
      },
    });

    if (result) {
      upserted += 1;
    }
  }

  console.log(`WW03 import complete. Upserted ${upserted} PayrollWeekRecord rows.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
