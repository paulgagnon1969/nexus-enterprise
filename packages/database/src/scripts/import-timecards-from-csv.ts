import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "../client";
import { rebuildPayrollWeekForProject } from "../payroll-from-timecards";

interface TimecardCsvRow {
  company_id?: string;
  project_code?: string;
  week_end_date?: string; // YYYY-MM-DD
  worker_name?: string;
  location_code?: string;
  // Daily hours (Sunday-Saturday)
  st_sun?: string; ot_sun?: string; dt_sun?: string;
  st_mon?: string; ot_mon?: string; dt_mon?: string;
  st_tue?: string; ot_tue?: string; dt_tue?: string;
  st_wed?: string; ot_wed?: string; dt_wed?: string;
  st_thu?: string; ot_thu?: string; dt_thu?: string;
  st_fri?: string; ot_fri?: string; dt_fri?: string;
  st_sat?: string; ot_sat?: string; dt_sat?: string;
}

function parseNumber(raw?: string): number {
  if (!raw) return 0;
  const t = String(raw).trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function ensureIsoDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const csvPathEnv = process.env.TIMECARD_CSV_PATH;
  const repoRoot = path.resolve(__dirname, "../../../..");
  const defaultCsvPath = path.join(repoRoot, "docs", "timecards", "import-timecards.csv");

  const csvPath = csvPathEnv && csvPathEnv.trim().length > 0 ? csvPathEnv : defaultCsvPath;

  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `Timecard CSV not found at ${csvPath}. Set TIMECARD_CSV_PATH or place a file at docs/timecards/import-timecards.csv`,
    );
  }

  console.log(`Loading timecards from ${csvPath}`);
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as TimecardCsvRow[];

  console.log(`Parsed ${rows.length} rows from CSV`);

  const defaultCompanyId = process.env.TIMECARD_COMPANY_ID || "cmjr9okjz000401s6rdkbatvr"; // Fortified default

  type WeekKey = string; // companyId|projectId|weekEndDate
  const touchedWeeks = new Set<WeekKey>();

  for (const [index, row] of rows.entries()) {
    const line = index + 2; // header is line 1

    const companyId = (row.company_id || defaultCompanyId).trim();
    const projectCode = (row.project_code || "").trim();
    const workerName = (row.worker_name || "").trim();
    const locationCode = (row.location_code || "").trim() || null;
    const weekEndIso = row.week_end_date ? ensureIsoDate(row.week_end_date) : null;

    if (!companyId || !projectCode || !workerName || !weekEndIso) {
      console.warn(
        `Line ${line}: missing required fields (company_id, project_code, worker_name, week_end_date). Skipping.`,
      );
      continue;
    }

    // Build arrays of ST/OT/DT per day (Sun-Sat)
    const st = [
      parseNumber(row.st_sun),
      parseNumber(row.st_mon),
      parseNumber(row.st_tue),
      parseNumber(row.st_wed),
      parseNumber(row.st_thu),
      parseNumber(row.st_fri),
      parseNumber(row.st_sat),
    ];
    const ot = [
      parseNumber(row.ot_sun),
      parseNumber(row.ot_mon),
      parseNumber(row.ot_tue),
      parseNumber(row.ot_wed),
      parseNumber(row.ot_thu),
      parseNumber(row.ot_fri),
      parseNumber(row.ot_sat),
    ];
    const dt = [
      parseNumber(row.dt_sun),
      parseNumber(row.dt_mon),
      parseNumber(row.dt_tue),
      parseNumber(row.dt_wed),
      parseNumber(row.dt_thu),
      parseNumber(row.dt_fri),
      parseNumber(row.dt_sat),
    ];

    const totalForWeek = st.reduce((sum, v, i) => sum + v + ot[i] + dt[i], 0);
    if (!totalForWeek) {
      console.warn(`Line ${line}: no hours for any day. Skipping.`);
      continue;
    }

    // Find project by companyId + projectCode
    const project = await prisma.project.findFirst({
      where: {
        companyId,
        code: projectCode,
      },
    });

    if (!project) {
      console.warn(
        `Line ${line}: project not found for companyId=${companyId} project_code=${projectCode}. Skipping.`,
      );
      continue;
    }

    // Find worker by fullName within this company
    const worker = await prisma.worker.findFirst({
      where: {
        companyId,
        fullName: workerName,
      },
    });

    if (!worker) {
      console.warn(
        `Line ${line}: worker not found for companyId=${companyId} worker_name="${workerName}". Skipping.`,
      );
      continue;
    }

    // Compute week start (Sunday) from weekEnd (Saturday) assuming 7-day window
    const weekStartIso = shiftDate(weekEndIso, -6);

    const dayOffsets = [0, 1, 2, 3, 4, 5, 6]; // Sun..Sat

    for (let i = 0; i < 7; i += 1) {
      const stHours = st[i];
      const otHours = ot[i];
      const dtHours = dt[i];
      if (!stHours && !otHours && !dtHours) continue;

      const dateIso = shiftDate(weekStartIso, dayOffsets[i]);

      // Upsert DailyTimecard, then upsert a single DailyTimeEntry for this worker/date
      const card = await prisma.dailyTimecard.upsert({
        where: {
          companyId_projectId_date: {
            companyId,
            projectId: project.id,
            date: dateIso,
          },
        },
        update: {},
        create: {
          companyId,
          projectId: project.id,
          date: dateIso,
          createdByUserId: null,
        },
      });

      // For now, we delete any existing entry for this worker on that card and recreate.
      await prisma.dailyTimeEntry.deleteMany({
        where: {
          timecardId: card.id,
          workerId: worker.id,
        },
      });

      await prisma.dailyTimeEntry.create({
        data: {
          timecardId: card.id,
          workerId: worker.id,
          locationCode,
          stHours,
          otHours,
          dtHours,
        },
      });
    }

    const key: WeekKey = `${companyId}|${project.id}|${weekEndIso}`;
    touchedWeeks.add(key);
  }

  console.log(`Finished importing raw timecards. Touching ${touchedWeeks.size} week(s) for rollup.`);

  for (const key of touchedWeeks) {
    const [companyId, projectId, weekEndIso] = key.split("|");
    const weekEndDate = new Date(`${weekEndIso}T00:00:00`);
    console.log(
      `Rebuilding PayrollWeekRecord for companyId=${companyId} projectId=${projectId} weekEndDate=${weekEndIso}`,
    );
    await rebuildPayrollWeekForProject({
      companyId,
      projectId,
      weekEndDate,
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
