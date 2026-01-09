import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "../client";

const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

interface Ww02Row {
  Number?: string;
  Name?: string;
  "Purpose / Site Supervisor"?: string;
  "Time-In"?: string;
  "Time-Out"?: string;
  Location?: string; // CBS / CCT
  Date?: string; // e.g. 20260107
  Duration?: string; // e.g. 10:00
}

function parseDurationToHours(raw?: string): number {
  if (!raw) return 0;
  const v = raw.trim();
  if (!v) return 0;
  // Handle "10", "10.5", "10:00", "6:30" etc.
  if (/^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isNaN(h) && !Number.isNaN(min)) {
      return h + min / 60;
    }
  }
  return 0;
}

function parseDateKey(raw?: string): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{8}$/.test(t)) {
    const y = t.slice(0, 4);
    const m = t.slice(4, 6);
    const d = t.slice(6, 8);
    return `${y}-${m}-${d}`; // YYYY-MM-DD
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function main() {
  // __dirname = packages/database/src/scripts → repo root is four levels up
  const repoRoot = path.resolve(__dirname, "../../../..");
  const csvPath = path.join(
    repoRoot,
    "docs",
    "NEXUS TIME ACCOUNTING",
    "WW02 - CCT and CBS scanned.csv",
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(`WW02 CSV not found at ${csvPath}. Please export the Excel file as CSV with this exact name.`);
  }

  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Ww02Row[];

  console.log(`Loaded ${rows.length} rows from WW02 CSV`);

  type AggKey = string; // projectCode|NAME_UPPER
  interface Agg {
    name: string;
    firstName: string;
    lastName: string;
    projectCode: string; // CBS / CCT
    dateHours: Map<string, number>; // YYYY-MM-DD -> hours
  }

  const aggs = new Map<AggKey, Agg>();
  let maxDateKey: string | null = null;

  for (const row of rows) {
    const nameRaw = (row.Name ?? "").trim();
    if (!nameRaw) continue;

    const locationRaw = (row.Location ?? "").trim();
    const projectCode = locationRaw || "CBS"; // default to CBS if missing

    const hours = parseDurationToHours(row.Duration);
    if (!hours) continue;

    const dateKey = parseDateKey(row.Date);
    if (!dateKey) continue;

    if (!maxDateKey || dateKey > maxDateKey) {
      maxDateKey = dateKey;
    }

    const key: AggKey = `${projectCode}|${nameRaw.toUpperCase()}`;

    let agg = aggs.get(key);
    if (!agg) {
      const parts = nameRaw.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? nameRaw;
      const lastName = parts.slice(1).join(" ") || null;
      agg = {
        name: nameRaw,
        firstName,
        lastName: lastName ?? "",
        projectCode,
        dateHours: new Map(),
      };
      aggs.set(key, agg);
    }

    const prev = agg.dateHours.get(dateKey) ?? 0;
    agg.dateHours.set(dateKey, prev + hours);
  }

  if (!maxDateKey) {
    console.log("No valid rows found in WW02 CSV; nothing to import.");
    await prisma.$disconnect();
    return;
  }

  const weekEndDate = new Date(`${maxDateKey}T00:00:00Z`);

  console.log(`Using weekEndDate=${weekEndDate.toISOString().slice(0, 10)} for WW02`);

  let created = 0;
  let updated = 0;

  for (const agg of aggs.values()) {
    const dayKeys = Array.from(agg.dateHours.keys()).sort();

    // Build 7-day array of S/T hours; OT/DT are zero for now.
    const daily: { st: number; ot: number; dt: number }[] = Array.from(
      { length: 7 },
      () => ({ st: 0, ot: 0, dt: 0 }),
    );

    dayKeys.forEach((dk, idx) => {
      if (idx < 7) {
        daily[idx].st = agg.dateHours.get(dk) ?? 0;
      }
    });

    const totalHoursSt = dayKeys.reduce(
      (sum, dk) => sum + (agg.dateHours.get(dk) ?? 0),
      0,
    );

    // Look up Worker to get default hourly rate, if any.
    const worker = await prisma.worker.findUnique({
      where: { fullName: agg.name },
    });

    const baseHourlyRate: number | null =
      worker?.defaultPayRate != null ? worker.defaultPayRate : null;

    const totalPay = baseHourlyRate != null ? baseHourlyRate * totalHoursSt : 0;

    const employeeId = agg.name; // stable key for uniqueness

    const result = await prisma.payrollWeekRecord.upsert({
      where: {
        PayrollWeek_company_proj_week_emp_key: {
          companyId: FORTIFIED_COMPANY_ID,
          projectCode: agg.projectCode,
          weekEndDate,
          employeeId,
        },
      },
      update: {
        firstName: agg.firstName,
        lastName: agg.lastName,
        weekCode: "WW02",
        totalPay,
        totalHoursSt,
        totalHoursOt: 0,
        totalHoursDt: 0,
        baseHourlyRate,
        dailyHoursJson: daily as any,
      },
      create: {
        companyId: FORTIFIED_COMPANY_ID,
        projectId: null,
        projectCode: agg.projectCode,
        workerId: null,
        employeeId,
        firstName: agg.firstName,
        lastName: agg.lastName,
        ssn: null,
        classCode: null,
        weekCode: "WW02",
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

    // upsert always returns a row; we can't distinguish create vs update from the return.
    // We'll conservatively count everything as "updated" after the first run.
    if (result) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log(
    `WW02 import complete. Upserted ${aggs.size} PayrollWeekRecord rows (approx. Created: ${created}, Updated: ${updated}).`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
