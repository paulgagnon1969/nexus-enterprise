import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import prisma from "./client";

interface LcpRow {
  project_code?: string;
  week_end_date?: string;
  first_name?: string;
  last_name?: string;
  ssn?: string;
  class_code?: string;
  Total_Hours_All_Projects?: string;
  total_hours_all_projects?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  ZIP?: string;
  phone?: string;
}

interface PayrollRow {
  Active?: string; // YES / NO
  "1099 First Name"?: string;
  "1099 Last Name"?: string;
  "Combined Name LN / FN"?: string;
  "Pay Rate / HR"?: string;
  "email"?: string;
  "Phone Number"?: string;
}

interface WorkerAgg {
  key: string; // ssn or fullName
  firstName: string;
  lastName: string;
  fullName: string;
  ssn?: string;
  primaryClassCode?: string;
  projectCodes: Set<string>;
  firstSeenWeekEnd?: Date;
  lastSeenWeekEnd?: Date;
  totalHoursCbs: number;
  totalHoursCct: number;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  defaultPayRate?: number;
  status?: "ACTIVE" | "INACTIVE";
}

interface WorkerWeekAgg {
  key: string; // same key as WorkerAgg (ssn or fullName)
  weekEndDate: Date;
  projectCode: string; // CBS or CCT
  totalHours: number;
  sourceFile?: string;
}

function parseWeekEndDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  // Expect mm/dd/yy, e.g. 11/27/25
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return new Date(Date.UTC(year, month - 1, day));
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isNaN(n) ? undefined : n;
}

export async function importBiaWorkers(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "../../..");
  const biaBaseDir = path.join(
    repoRoot,
    "docs",
    "data",
    "20251231 - BIA Time sheerts split to CSV",
  );
  const lcpDir = path.join(biaBaseDir, "Revised LCP - TG");

  const files = fs
    .readdirSync(lcpDir)
    .filter(
      (f) =>
        f.startsWith("LCPUpload Template WW") &&
        f.toLowerCase().endsWith(".csv") &&
        !f.includes("LEGEND"),
    )
    .sort();

  if (files.length === 0) {
    console.warn("No LCPUpload Template WW*.csv files found in", lcpDir);
  }

  const workers = new Map<string, WorkerAgg>();
  const workerWeeks = new Map<string, WorkerWeekAgg>();

  for (const file of files) {
    const fullPath = path.join(lcpDir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    const rows: LcpRow[] = parse(content, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const row of rows) {
      const projectCode = String(row.project_code ?? "").trim();
      const firstName = String(row.first_name ?? "").trim();
      const lastName = String(row.last_name ?? "").trim();
      const ssn = String(row.ssn ?? "").trim();
      const classCode = String(row.class_code ?? "").trim();
      const weekEndRaw = String(row.week_end_date ?? "").trim();

      if (!firstName && !lastName) continue;
      if (!weekEndRaw && !projectCode && !classCode) continue; // skip legend/empty

      const fullName = `${firstName} ${lastName}`.trim();
      const key = ssn || fullName;
      let agg = workers.get(key);
      if (!agg) {
        agg = {
          key,
          firstName,
          lastName,
          fullName,
          ssn: ssn || undefined,
          primaryClassCode: classCode || undefined,
          projectCodes: new Set<string>(),
          firstSeenWeekEnd: undefined,
          lastSeenWeekEnd: undefined,
          totalHoursCbs: 0,
          totalHoursCct: 0,
          addressLine1: row.address1?.trim() || undefined,
          addressLine2: row.address2?.trim() || undefined,
          city: row.city?.trim() || undefined,
          state: row.state?.trim() || undefined,
          postalCode: row.ZIP?.trim() || undefined,
          phone: row.phone?.trim() || undefined,
          email: undefined,
          defaultPayRate: undefined,
        };
        workers.set(key, agg);
      }

      if (!agg.primaryClassCode && classCode) agg.primaryClassCode = classCode;
      if (projectCode) agg.projectCodes.add(projectCode);

      const dt = parseWeekEndDate(weekEndRaw);
      if (dt) {
        if (!agg.firstSeenWeekEnd || dt < agg.firstSeenWeekEnd) {
          agg.firstSeenWeekEnd = dt;
        }
        if (!agg.lastSeenWeekEnd || dt > agg.lastSeenWeekEnd) {
          agg.lastSeenWeekEnd = dt;
        }
      }

      // Sum hours by scope
      const hoursStr =
        (row.Total_Hours_All_Projects ?? row.total_hours_all_projects ?? "").trim();
      const hours = parseNumber(hoursStr) ?? 0;
      if (projectCode === "CBS") agg.totalHoursCbs += hours;
      else if (projectCode === "CCT") agg.totalHoursCct += hours;

      // Accumulate weekly totals per worker + project code for WorkerWeek facts.
      if (projectCode && dt && hours > 0) {
        const weekKey = `${key}|${dt.toISOString()}|${projectCode}`;
        let ww = workerWeeks.get(weekKey);
        if (!ww) {
          ww = {
            key,
            weekEndDate: dt,
            projectCode,
            totalHours: 0,
            sourceFile: file,
          };
          workerWeeks.set(weekKey, ww);
        }
        ww.totalHours += hours;
      }

      // Prefer first non-empty address/phone if not already set
      if (!agg.addressLine1 && row.address1) agg.addressLine1 = row.address1.trim();
      if (!agg.addressLine2 && row.address2) agg.addressLine2 = row.address2.trim();
      if (!agg.city && row.city) agg.city = row.city.trim();
      if (!agg.state && row.state) agg.state = row.state.trim();
      if (!agg.postalCode && row.ZIP) agg.postalCode = row.ZIP.trim();
      if (!agg.phone && row.phone) agg.phone = row.phone.trim();
    }
  }

  // Enrich from Payroll Admin 1.csv if present.
  const payrollPath = path.join(biaBaseDir, "Payroll Admin 1.csv");
  if (fs.existsSync(payrollPath)) {
    const content = fs.readFileSync(payrollPath, "utf8");
    const rows: PayrollRow[] = parse(content, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const row of rows) {
      const combined = String(row["Combined Name LN / FN"] ?? "").trim();
      if (!combined) continue;

      const [last, first] = combined.split(",").map((s) => s.trim());
      const firstName = (row["1099 First Name"] ?? first ?? "").toString().trim();
      const lastName = (row["1099 Last Name"] ?? last ?? "").toString().trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const email = String(row.email ?? "").trim();
      const phone = String(row["Phone Number"] ?? "").trim();
      const payRateHr = parseNumber(row["Pay Rate / HR"]);

      const key = fullName;
      const agg = workers.get(key);
      if (!agg) {
        // New worker only seen in payroll admin
        const activeRaw = String(row.Active ?? "").trim().toUpperCase();
        const status: "ACTIVE" | "INACTIVE" | undefined =
          activeRaw === "NO" ? "INACTIVE" : activeRaw === "YES" ? "ACTIVE" : undefined;

        workers.set(key, {
          key,
          firstName,
          lastName,
          fullName,
          ssn: undefined,
          primaryClassCode: undefined,
          projectCodes: new Set<string>(),
          firstSeenWeekEnd: undefined,
          lastSeenWeekEnd: undefined,
          totalHoursCbs: 0,
          totalHoursCct: 0,
          addressLine1: undefined,
          addressLine2: undefined,
          city: undefined,
          state: undefined,
          postalCode: undefined,
          phone: phone || undefined,
          email: email || undefined,
          defaultPayRate: payRateHr,
          status,
        });
      } else {
        if (!agg.email && email) agg.email = email;
        if (!agg.phone && phone) agg.phone = phone;
        if (!agg.defaultPayRate && payRateHr != null) {
          agg.defaultPayRate = payRateHr;
        }
        const activeRaw = String(row.Active ?? "").trim().toUpperCase();
        const status: "ACTIVE" | "INACTIVE" | undefined =
          activeRaw === "NO" ? "INACTIVE" : activeRaw === "YES" ? "ACTIVE" : undefined;
        if (status) agg.status = status;
      }
    }
  }

  console.log(`Found ${workers.size} distinct workers from LCP + payroll data.`);

  let created = 0;
  let updated = 0;

  const fullNameToWorkerId = new Map<string, string>();

  for (const agg of workers.values()) {
    const defaultProjectCode =
      agg.projectCodes.size === 0
        ? null
        : agg.projectCodes.size === 1
        ? Array.from(agg.projectCodes)[0]
        : "BOTH";

    const data = {
      firstName: agg.firstName || agg.fullName.split(" ")[0] || "",
      lastName:
        agg.lastName ||
        agg.fullName.split(" ").slice(1).join(" ") ||
        agg.firstName ||
        "",
      fullName: agg.fullName || `${agg.firstName} ${agg.lastName}`.trim(),
      ssnHash: agg.ssn ? `last4:${agg.ssn.slice(-4)}` : null,
      email: agg.email ?? null,
      phone: agg.phone ?? null,
      addressLine1: agg.addressLine1 ?? null,
      addressLine2: agg.addressLine2 ?? null,
      city: agg.city ?? null,
      state: agg.state ?? null,
      postalCode: agg.postalCode ?? null,
      gender: null,
      ethnicity: null,
      primaryClassCode: agg.primaryClassCode ?? null,
      defaultProjectCode,
      dateHired: null,
      status: agg.status ?? "ACTIVE",
      isForeman:
        (agg.primaryClassCode ?? "").toLowerCase().includes("foreman") ||
        (agg.primaryClassCode ?? "").toLowerCase().includes("supervisor"),
      defaultPayRate: agg.defaultPayRate ?? null,
      unionLocal: null,
      firstSeenWeekEnd: agg.firstSeenWeekEnd ?? null,
      lastSeenWeekEnd: agg.lastSeenWeekEnd ?? null,
      totalHoursCbs: agg.totalHoursCbs || 0,
      totalHoursCct: agg.totalHoursCct || 0,
      notes: null,
    } as const;

    // Upsert keyed by fullName for now (unique constraint on Worker.fullName).
    const existing = await prisma.worker.findUnique({
      where: { fullName: data.fullName },
    });

    if (!existing) {
      const createdWorker = await prisma.worker.create({ data });
      fullNameToWorkerId.set(createdWorker.fullName, createdWorker.id);
      created += 1;
    } else {
      const updatedWorker = await prisma.worker.update({
        where: { id: existing.id },
        data,
      });
      fullNameToWorkerId.set(updatedWorker.fullName, updatedWorker.id);
      updated += 1;
    }
  }

  console.log(`Workers import complete. Created: ${created}, Updated: ${updated}.`);

  // Persist WorkerWeek facts based on aggregated weekly hours.
  let wwCreated = 0;
  let wwUpdated = 0;

  for (const ww of workerWeeks.values()) {
    const agg = workers.get(ww.key);
    if (!agg) continue;
    const workerId = fullNameToWorkerId.get(agg.fullName);
    if (!workerId) continue;

    await prisma.workerWeek
      .upsert({
        where: {
          workerId_weekEndDate_projectCode: {
            workerId,
            weekEndDate: ww.weekEndDate,
            projectCode: ww.projectCode,
          },
        },
        update: {
          totalHours: ww.totalHours,
          sourceFile: ww.sourceFile ?? null,
        },
        create: {
          workerId,
          weekEndDate: ww.weekEndDate,
          projectCode: ww.projectCode,
          totalHours: ww.totalHours,
          sourceFile: ww.sourceFile ?? null,
        },
      })
      .then((existing: any) => {
        if (existing) {
          // upsert returns the row; we can't distinguish create vs update
          // from the return alone, so we conservatively bump "updated".
          wwUpdated += 1;
        } else {
          wwCreated += 1;
        }
      });
  }

  console.log(
    `WorkerWeek import complete. Upserted ${workerWeeks.size} weekly aggregates (approx. Created: ${wwCreated}, Updated: ${wwUpdated}).`,
  );
}
