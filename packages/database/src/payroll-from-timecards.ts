import prisma from "./client";

const FORTIFIED_COMPANY_ID = "cmjr9okjz000401s6rdkbatvr";

export interface RebuildPayrollWeekParams {
  companyId: string;
  projectId: string;
  weekEndDate: Date;
}

/**
 * Recompute PayrollWeekRecord rows for a given company + project + week
 * from DailyTimecard / DailyTimeEntry data.
 */
export async function rebuildPayrollWeekForProject(
  params: RebuildPayrollWeekParams,
): Promise<{ updated: number }> {
  const { companyId, projectId, weekEndDate } = params;

  // Compute week start as 6 days before weekEnd (simple 7-day window).
  const weekEnd = new Date(weekEndDate);
  const weekStart = new Date(weekEndDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, companyId: true, /* optional */ },
  });

  if (!project || project.companyId !== companyId) {
    throw new Error(`Project ${projectId} not found for company ${companyId}`);
  }

  // Load all timecards for this project/week window.
  const timecards = await prisma.dailyTimecard.findMany({
    where: {
      companyId,
      projectId,
      date: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    include: {
      entries: true,
    },
  });

  if (!timecards.length) {
    return { updated: 0 };
  }

  // Fallback projectCode used when a Worker does not have defaultProjectCode set.
  // This avoids passing a null projectCode into the PayrollWeekRecord unique key.
  const fallbackProjectCode = `PROJ:${projectId}`;

  type Key = string; // workerId
  interface Agg {
    workerId: string;
    firstName: string | null;
    lastName: string | null;
    projectCode: string | null;
    totalSt: number;
    totalOt: number;
    totalDt: number;
  }

  const byWorker = new Map<Key, Agg>();

  for (const tc of timecards) {
    for (const e of tc.entries) {
      if (!e.workerId) continue;
    const worker = await prisma.worker.findUnique({
      where: { id: e.workerId },
      select: { firstName: true, lastName: true, defaultPayRate: true, defaultProjectCode: true },
    });
    const key: Key = e.workerId;
    let agg = byWorker.get(key);
    if (!agg) {
      agg = {
        workerId: e.workerId,
        firstName: worker?.firstName ?? null,
        lastName: worker?.lastName ?? null,
        projectCode: worker?.defaultProjectCode ?? fallbackProjectCode,
        totalSt: 0,
        totalOt: 0,
        totalDt: 0,
      };
      byWorker.set(key, agg);
    }
      agg.totalSt += e.stHours ?? 0;
      agg.totalOt += e.otHours ?? 0;
      agg.totalDt += e.dtHours ?? 0;
    }
  }

  let updated = 0;

  for (const agg of byWorker.values()) {
    const worker = await prisma.worker.findUnique({
      where: { id: agg.workerId },
      select: { fullName: true, firstName: true, lastName: true, defaultPayRate: true },
    });

    const baseHourlyRate = worker?.defaultPayRate ?? null;
    const totalHours = (agg.totalSt || 0) + (agg.totalOt || 0) + (agg.totalDt || 0);
    const totalPay = baseHourlyRate != null ? baseHourlyRate * totalHours : 0;

    // Build simple 7-day array of hours from aggregated totals; for now we
    // don't track per-day breakdown here, only week totals.
    const daily = Array.from({ length: 7 }, () => ({ st: 0, ot: 0, dt: 0 }));

    const projectCodeForUpsert = agg.projectCode ?? fallbackProjectCode;

    await prisma.payrollWeekRecord.upsert({
      where: {
        PayrollWeek_company_proj_week_emp_key: {
          companyId,
          projectCode: projectCodeForUpsert,
          weekEndDate,
          employeeId: worker?.fullName ?? agg.workerId,
        },
      },
      update: {
        workerId: agg.workerId,
        firstName: worker?.firstName ?? null,
        lastName: worker?.lastName ?? null,
        weekCode: null,
        employmentType: "CONTRACTOR_1099",
        baseHourlyRate,
        totalPay,
        totalHoursSt: agg.totalSt,
        totalHoursOt: agg.totalOt,
        totalHoursDt: agg.totalDt,
        dailyHoursJson: daily as any,
      },
      create: {
        companyId,
        projectId,
        projectCode: projectCodeForUpsert,
        workerId: agg.workerId,
        employeeId: worker?.fullName ?? agg.workerId,
        firstName: worker?.firstName ?? null,
        lastName: worker?.lastName ?? null,
        ssn: null,
        classCode: null,
        weekCode: null,
        weekEndDate,
        employmentType: "CONTRACTOR_1099",
        baseHourlyRate,
        dayRate: null,
        dayRateBaseHours: null,
        totalPay,
        totalHoursSt: agg.totalSt,
        totalHoursOt: agg.totalOt,
        totalHoursDt: agg.totalDt,
        dailyHoursJson: daily as any,
      },
    });

    updated += 1;
  }

  return { updated };
}
