import { prisma, Asset, AssetMaintenanceRule, AssetMaintenanceSchedule, AssetMeterReading, MaintenanceIntervalUnit, MaintenanceMeterType, MaintenanceTodoStatus, MaintenanceTriggerStrategy, Role } from "./index";

/**
 * Compute the next time-based due date from a last service date and interval.
 */
function addInterval(date: Date, value: number, unit: MaintenanceIntervalUnit): Date {
  const d = new Date(date.getTime());
  switch (unit) {
    case MaintenanceIntervalUnit.DAY:
      d.setDate(d.getDate() + value);
      break;
    case MaintenanceIntervalUnit.WEEK:
      d.setDate(d.getDate() + value * 7);
      break;
    case MaintenanceIntervalUnit.MONTH:
      d.setMonth(d.getMonth() + value);
      break;
    case MaintenanceIntervalUnit.YEAR:
      d.setFullYear(d.getFullYear() + value);
      break;
    default:
      break;
  }
  return d;
}

function getLatestMeter(
  readings: Pick<AssetMeterReading, "meterType" | "value" | "recordedAt">[],
  meterType: MaintenanceMeterType,
): number | null {
  const relevant = readings
    .filter((r) => r.meterType === meterType)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  return relevant[0]?.value ?? null;
}

export async function ensureSchedulesForAssets(companyId?: string): Promise<void> {
  const whereCompany = companyId ? { companyId } : {};

  const assets = await prisma.asset.findMany({
    where: {
      ...whereCompany,
      maintenanceProfileCode: { not: null },
    },
    select: {
      id: true,
      companyId: true,
      maintenanceProfileCode: true,
    },
  });

  if (!assets.length) return;

  const companyIds = [...new Set(assets.map((asset: { companyId: string }) => asset.companyId))];

  const templates = await prisma.assetMaintenanceTemplate.findMany({
    where: {
      companyId: { in: companyIds },
      isActive: true,
    },
    include: { rules: { where: { isActive: true } } },
  });

  const templatesByCompanyAndCode = new Map<string, typeof templates[number]>();
  for (const tmpl of templates) {
    templatesByCompanyAndCode.set(`${tmpl.companyId}:${tmpl.code}`, tmpl);
  }

  for (const asset of assets) {
    if (!asset.maintenanceProfileCode) continue;
    const key = `${asset.companyId}:${asset.maintenanceProfileCode}`;
    const tmpl = templatesByCompanyAndCode.get(key);
    if (!tmpl || !tmpl.rules.length) continue;

    for (const rule of tmpl.rules) {
      // Ensure schedule exists for asset x rule
      const existing = await prisma.assetMaintenanceSchedule.findUnique({
        where: {
          assetId_ruleId: { assetId: asset.id, ruleId: rule.id },
        },
      });
      if (!existing) {
        await prisma.assetMaintenanceSchedule.create({
          data: {
            assetId: asset.id,
            ruleId: rule.id,
          },
        });
      }
    }
  }
}

function computeNextDueForSchedule(opts: {
  rule: AssetMaintenanceRule;
  schedule: AssetMaintenanceSchedule;
  latestMeter: number | null;
}): { nextTimeDueAt: Date | null; nextMeterDueAt: number | null } {
  const { rule, schedule, latestMeter } = opts;

  let nextTimeDueAt: Date | null = schedule.nextTimeDueAt ?? null;
  let nextMeterDueAt: number | null = schedule.nextMeterDueAt ?? null;

  if (rule.timeIntervalValue && rule.timeIntervalUnit) {
    const base = schedule.lastServiceDate ?? new Date();
    nextTimeDueAt = addInterval(base, rule.timeIntervalValue, rule.timeIntervalUnit);
  }

  if (rule.meterIntervalAmount && rule.meterType && latestMeter != null) {
    const base = schedule.lastServiceMeter ?? latestMeter;
    nextMeterDueAt = base + rule.meterIntervalAmount;
  }

  return { nextTimeDueAt, nextMeterDueAt };
}

export async function recalculateAllScheduleNextDue(companyId?: string): Promise<void> {
  const whereCompany = companyId ? { companyId } : {};

  const schedules = await prisma.assetMaintenanceSchedule.findMany({
    where: {
      asset: {
        ...whereCompany,
      },
    },
    include: {
      rule: true,
      asset: true,
    },
  });

  if (!schedules.length) return;

  const assetIds = [...new Set(schedules.map((schedule: AssetMaintenanceSchedule) => schedule.assetId))];

  const readings = await prisma.assetMeterReading.findMany({
    where: {
      assetId: { in: assetIds },
    },
  });

  const readingsByAsset = new Map<string, typeof readings>();
  for (const r of readings) {
    const arr = readingsByAsset.get(r.assetId) ?? [];
    arr.push(r);
    readingsByAsset.set(r.assetId, arr);
  }

  for (const schedule of schedules) {
    const assetReadings = readingsByAsset.get(schedule.assetId) ?? [];
    const latestMeter =
      schedule.rule.meterType != null
        ? getLatestMeter(assetReadings, schedule.rule.meterType)
        : null;

    const { nextTimeDueAt, nextMeterDueAt } = computeNextDueForSchedule({
      rule: schedule.rule,
      schedule,
      latestMeter,
    });

    await prisma.assetMaintenanceSchedule.update({
      where: { id: schedule.id },
      data: { nextTimeDueAt, nextMeterDueAt },
    });
  }
}

function isScheduleDueNow(schedule: AssetMaintenanceSchedule, now: Date, latestMeter: number | null): boolean {
  const dueByTime = schedule.nextTimeDueAt && schedule.nextTimeDueAt <= now;
  const dueByMeter = schedule.nextMeterDueAt != null && latestMeter != null && latestMeter >= schedule.nextMeterDueAt;

  return Boolean(dueByTime || dueByMeter);
}

export async function generateMaintenanceTodosForDueSchedules(companyId?: string): Promise<void> {
  const now = new Date();
  const whereCompany = companyId ? { companyId } : {};

  const schedules = await prisma.assetMaintenanceSchedule.findMany({
    where: {
      asset: {
        ...whereCompany,
      },
    },
    include: {
      rule: true,
      asset: true,
      todos: {
        where: {
          status: {
            in: [MaintenanceTodoStatus.PENDING, MaintenanceTodoStatus.IN_PROGRESS],
          },
        },
      },
    },
  });

  if (!schedules.length) return;

  const assetIds = [...new Set(schedules.map((schedule: AssetMaintenanceSchedule) => schedule.assetId))];

  const readings = await prisma.assetMeterReading.findMany({
    where: {
      assetId: { in: assetIds },
    },
  });

  const readingsByAsset = new Map<string, typeof readings>();
  for (const r of readings) {
    const arr = readingsByAsset.get(r.assetId) ?? [];
    arr.push(r);
    readingsByAsset.set(r.assetId, arr);
  }

  for (const schedule of schedules) {
    const assetReadings = readingsByAsset.get(schedule.assetId) ?? [];
    const latestMeter =
      schedule.rule.meterType != null
        ? getLatestMeter(assetReadings, schedule.rule.meterType)
        : null;

    if (!isScheduleDueNow(schedule, now, latestMeter)) continue;

    // Skip if there is already an open todo for this schedule.
    if (schedule.todos.length > 0) continue;

    await prisma.maintenanceTodo.create({
      data: {
        companyId: schedule.asset.companyId,
        assetId: schedule.assetId,
        scheduleId: schedule.id,
        ruleId: schedule.ruleId,
        title: schedule.rule.name,
        description: schedule.rule.description ?? undefined,
        status: MaintenanceTodoStatus.PENDING,
        dueDate: schedule.nextTimeDueAt ?? undefined,
        assignedToRole: schedule.rule.defaultAssigneeRole ?? Role.EM,
        kind: "MAINTENANCE",
      },
    });
  }
}

export async function generateEmReviewTodos(companyId?: string): Promise<void> {
  const now = new Date();
  const whereCompany = companyId ? { id: companyId } : {};

  const settings = await prisma.maintenanceReviewSettings.findMany({
    where: {
      company: {
        ...whereCompany,
      },
      isActive: true,
    },
    include: {
      company: true,
    },
  });

  for (const setting of settings) {
    if (!setting.nextReviewAt || setting.nextReviewAt > now) continue;

    const existing = await prisma.maintenanceTodo.findFirst({
      where: {
        companyId: setting.companyId,
        kind: "REVIEW",
        status: {
          in: [MaintenanceTodoStatus.PENDING, MaintenanceTodoStatus.IN_PROGRESS],
        },
      },
    });

    if (!existing) {
      await prisma.maintenanceTodo.create({
        data: {
          companyId: setting.companyId,
          title: "Weekly equipment maintenance review",
          description: "Review all due and upcoming equipment maintenance items.",
          status: MaintenanceTodoStatus.PENDING,
          dueDate: setting.nextReviewAt,
          assignedToRole: Role.EM,
          kind: "REVIEW",
        },
      });
    }

    const next = addInterval(setting.nextReviewAt, setting.intervalValue, setting.intervalUnit);

    await prisma.maintenanceReviewSettings.update({
      where: { id: setting.id },
      data: {
        lastReviewAt: setting.nextReviewAt,
        nextReviewAt: next,
      },
    });
  }
}

export async function runMaintenanceScheduler(companyId?: string): Promise<void> {
  await ensureSchedulesForAssets(companyId);
  await recalculateAllScheduleNextDue(companyId);
  await generateMaintenanceTodosForDueSchedules(companyId);
  await generateEmReviewTodos(companyId);
}
