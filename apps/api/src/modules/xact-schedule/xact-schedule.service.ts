import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

interface GenerateScheduleParams {
  companyId: string | null;
  projectId: string;
  estimateVersionId: string;
  startDateOverride?: string | null;
  // keyed by scheduled task id
  // - startDate: requested start date
  // - lockType: SOFT (default) = treat startDate as earliest-allowed; HARD = do not move, only report conflicts
  taskOverrides?: Record<
    string,
    {
      durationDays?: number;
      startDate?: string;
      lockType?: "SOFT" | "HARD";
    }
  >;
}

interface WorkPackagePreview {
  room: string;
  trade: string;
  phaseCode: number;
  phaseLabel: string;
  totalLaborHours: number;
  crewSize: number;
  durationDays: number;
  lineCount: number;
}

interface MitigationWindowPreview {
  durationDays: number;
  equipmentLineCount: number;
}

/**
 * Machine- and client-friendly conflict types.
 *
 * START_DELAYED: soft-locked task was pushed later than its requestedStart.
 * HARD_START_CONSTRAINT: hard-locked task kept its requestedStart but conflicts with dependencies/capacity.
 */
export type ScheduleConflictType = "START_DELAYED" | "HARD_START_CONSTRAINT";

/**
 * High-level reasons why a task could not be scheduled exactly as requested.
 *
 * ROOM_DEPENDENCY: violates intra-room phase ordering (previous phase not finished).
 * TRADE_CAPACITY: exceeds configured per-trade concurrent crew capacity.
 * MITIGATION: rebuild work cannot start until mitigation/dry-out completes.
 * UNKNOWN: catch-all when the scheduler cannot classify the constraint more specifically.
 */
export type ScheduleConflictReason =
  | "ROOM_DEPENDENCY"
  | "TRADE_CAPACITY"
  | "MITIGATION"
  | "UNKNOWN";

export interface ScheduleConflict {
  taskId: string;
  type: ScheduleConflictType;
  // earliest start requested via override (if any)
  requestedStart?: string;
  // actual scheduled start (later than requested when delayed or conflicting)
  scheduledStart: string;
  // high-level reasons why we had to delay or flag the start
  reasons: ScheduleConflictReason[];
  // human-readable explanation for UI/logging
  message: string;
}

interface SchedulePreviewResult {
  projectId: string;
  estimateVersionId: string;
  totalLaborHours: number;
  workPackages: WorkPackagePreview[];
  missingPriceItems: { cat: string | null; sel: string | null; activity: string | null }[];
  mitigationWindow: MitigationWindowPreview | null;
  scheduledTasks: ScheduledTaskPreview[];
  conflicts: ScheduleConflict[];
}

interface DailySummaryTask {
  id: string;
  syntheticId: string;
  kind: string;
  room: string | null;
  trade: string | null;
  phaseCode: number | null;
  phaseLabel: string | null;
  startDate: string;
  endDate: string;
  durationDays: number | null;
  totalLaborHours: number | null;
  crewSize: number | null;
}

interface DailySummaryByTrade {
  trade: string;
  taskCount: number;
  totalLaborHours: number;
}

interface DailySummaryDay {
  date: string; // ISO YYYY-MM-DD
  tasks: DailySummaryTask[];
  tradeTotals: DailySummaryByTrade[];
}

interface ScheduledTaskPreview {
  id: string;
  kind: "MITIGATION" | "WORK";
  room: string | null;
  trade: string;
  phaseCode: number;
  phaseLabel: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  durationDays: number;
  totalLaborHours?: number;
  crewSize?: number;
  predecessorIds: string[];
}

const HOURS_PER_DAY_DEFAULT = 8;

// Very simple trade + phase mapping for now. This can later move to a DB table.
function mapTradeAndPhase(cat: string | null | undefined, activity: string | null | undefined): {
  trade: string;
  phaseCode: number;
  phaseLabel: string;
} {
  const c = (cat ?? "").trim().toUpperCase();
  const act = (activity ?? "").toLowerCase();

  if (c === "WTR") {
    return { trade: "Mitigation", phaseCode: 10, phaseLabel: "Mitigation" };
  }

  if (c === "DRY") {
    const phaseCode = act.includes("remove") && !act.includes("replace") ? 30 : 40;
    const phaseLabel = phaseCode === 30 ? "Drywall Demo" : "Drywall";
    return { trade: "Drywall", phaseCode, phaseLabel };
  }

  if (c === "PNT") {
    return { trade: "Paint", phaseCode: 50, phaseLabel: "Paint" };
  }

  if (c === "FCV" || c === "FCW" || c === "FCT") {
    return { trade: "Flooring", phaseCode: 60, phaseLabel: "Flooring" };
  }

  if (["FNC", "FNH", "DOR", "WDW", "CAB"].includes(c)) {
    return { trade: "Carpentry", phaseCode: 70, phaseLabel: "Trim & Doors" };
  }

  if (c === "PLM") {
    return { trade: "Plumbing", phaseCode: 80, phaseLabel: "Plumbing" };
  }

  if (c === "ELE") {
    return { trade: "Electrical", phaseCode: 80, phaseLabel: "Electrical" };
  }

  return { trade: "General", phaseCode: 90, phaseLabel: "Other" };
}

function crewSizeForTrade(trade: string): number {
  switch (trade) {
    case "Mitigation":
      return 2;
    case "Drywall":
      return 3;
    case "Paint":
      return 2;
    case "Flooring":
      return 2;
    case "Carpentry":
      return 2;
    case "Plumbing":
    case "Electrical":
      return 2;
    default:
      return 1;
  }
}

function defaultTradeCapacity(trade: string): number {
  // Simple default capacities per trade. This can later move to DB.
  switch (trade) {
    case "Mitigation":
      return 2; // two mitigation crews
    case "Drywall":
      return 1; // one drywall crew shared across rooms
    case "Paint":
      return 1;
    case "Flooring":
      return 1;
    case "Carpentry":
      return 1;
    case "Plumbing":
    case "Electrical":
      return 1;
    default:
      return 1;
  }
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[$,]/g, "");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function toDateOnly(input: Date): Date {
  const d = new Date(input.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function isWorkday(date: Date): boolean {
  const day = date.getDay(); // 0 = Sun, 6 = Sat (local time)
  return day !== 0 && day !== 6;
}

function nextWorkday(start: Date): Date {
  let d = addDays(start, 1);
  while (!isWorkday(d)) {
    d = addDays(d, 1);
  }
  return d;
}

function addWorkDuration(start: Date, durationDays: number): Date {
  if (durationDays <= 0) {
    return toDateOnly(start);
  }

  let remainingHours = durationDays * HOURS_PER_DAY_DEFAULT;
  let current = toDateOnly(start);
  let end = new Date(current.getTime());

  while (remainingHours > 0) {
    if (isWorkday(current)) {
      const hoursToday = Math.min(HOURS_PER_DAY_DEFAULT, remainingHours);
      remainingHours -= hoursToday;
      end = new Date(current.getTime());
    }
    if (remainingHours <= 0) {
      break;
    }
    current = addDays(current, 1);
  }

  return end;
}

function toIsoDate(date: Date): string {
  const d = new Date(date.getTime());
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatConflictMessage(options: {
  type: ScheduleConflictType;
  reasons: ScheduleConflictReason[];
  requestedStart?: string;
  scheduledStart: string;
  room: string | null;
  trade: string;
  phaseLabel: string;
}): string {
  const parts: string[] = [];

  const locationBits: string[] = [];
  if (options.room) {
    locationBits.push(options.room);
  }
  if (options.trade) {
    locationBits.push(options.trade);
  }
  const location = locationBits.length ? locationBits.join(" · ") : "Task";

  if (options.type === "START_DELAYED") {
    const base = `${location} delayed from ${options.requestedStart} to ${options.scheduledStart}`;
    parts.push(base);
  } else {
    const base = `${location} hard-locked on ${options.requestedStart} conflicts with schedule`;;
    parts.push(base);
  }

  if (options.reasons.length) {
    const reasonText = options.reasons
      .map((r) => {
        switch (r) {
          case "ROOM_DEPENDENCY":
            return "room dependency";
          case "TRADE_CAPACITY":
            return "trade capacity";
          case "MITIGATION":
            return "mitigation window";
          default:
            return "other constraints";
        }
      })
      .join(", ");
    parts.push(`due to ${reasonText}`);
  }

  return parts.join(" ");
}

@Injectable()
export class XactScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a schedule preview for a single EstimateVersion using:
   * - RawXactRow (job-level Xactimate ALL RAW)
   * - Golden PriceListItem rawJson (for labor productivity)
   */
  async generateSchedulePreview(params: GenerateScheduleParams): Promise<SchedulePreviewResult> {
    const { companyId, projectId, estimateVersionId } = params;

    // Ensure the estimate exists and belongs to this project (and company, if provided).
    const estimate = await this.prisma.estimateVersion.findFirst({
      where: {
        id: estimateVersionId,
        projectId,
        project: companyId
          ? {
              companyId,
            }
          : undefined,
      },
      include: { project: true },
    });

    if (!estimate) {
      throw new NotFoundException("EstimateVersion not found for project");
    }

    // Load all raw Xact rows for this estimate.
    const rawRows = await this.prisma.rawXactRow.findMany({
      where: { estimateVersionId },
    });

    // Derive a simple project-level mitigation / dry-out window from WTR
    // equipment lines (e.g. dehumidifiers and air movers).
    let mitigationDays = 0;
    let mitigationLineCount = 0;

    for (const row of rawRows) {
      const cat = (row.cat ?? "").trim().toUpperCase();
      if (cat !== "WTR") continue;

      const sel = (row.sel ?? "").trim().toUpperCase();
      // Focus on common mitigation equipment codes for now.
      const isMitigationEquip = sel === "DHM>>" || sel === "DRY";
      if (!isMitigationEquip) continue;

      mitigationLineCount++;

      let daysCandidate = row.qty ?? 0;
      const note = (row.note1 ?? "").toLowerCase();

      // Try to parse patterns like "1 unit for 3 Days" or "3 unit for 3 days".
      const unitsMatch = note.match(/(\d+)\s*unit/);
      const daysMatch = note.match(/(\d+)\s*day/);
      if (daysMatch) {
        const parsedDays = Number.parseInt(daysMatch[1], 10);
        if (!Number.isNaN(parsedDays) && parsedDays > 0) {
          daysCandidate = parsedDays;
        }
      }

      if (daysCandidate != null && daysCandidate > mitigationDays) {
        mitigationDays = daysCandidate;
      }
    }

    const mitigationWindow: MitigationWindowPreview | null =
      mitigationLineCount > 0 && mitigationDays > 0
        ? { durationDays: mitigationDays, equipmentLineCount: mitigationLineCount }
        : null;

    if (!rawRows.length) {
      return {
        projectId,
        estimateVersionId,
        totalLaborHours: 0,
        workPackages: [],
        missingPriceItems: [],
        mitigationWindow,
        scheduledTasks: [],
        conflicts: [],
      };
    }

    // Determine active Golden price list.
    const priceList = await this.prisma.priceList.findFirst({
      where: { kind: "GOLDEN", isActive: true },
      orderBy: { revision: "desc" },
    });

    if (!priceList) {
      throw new NotFoundException("No active Golden Price List configured");
    }

    // Load trade capacity configuration (company-wide and project-specific).
    const estimateCompanyId = estimate.project.companyId;
    const tradeCapacityRows = await (this.prisma as any).tradeCapacityConfig.findMany({
      where: {
        companyId: estimateCompanyId,
        OR: [
          { projectId: null },
          { projectId: estimate.projectId },
        ],
      },
    });

    const projectCapacityByTrade = new Map<string, number>();
    const companyCapacityByTrade = new Map<string, number>();
    for (const row of tradeCapacityRows) {
      const tradeKey = (row.trade ?? "").trim();
      if (!tradeKey) continue;
      if (row.projectId) {
        if (!projectCapacityByTrade.has(tradeKey)) {
          projectCapacityByTrade.set(tradeKey, row.maxConcurrent);
        }
      } else {
        if (!companyCapacityByTrade.has(tradeKey)) {
          companyCapacityByTrade.set(tradeKey, row.maxConcurrent);
        }
      }
    }

    const getTradeCapacity = (trade: string): number => {
      const key = trade.trim();
      return (
        projectCapacityByTrade.get(key) ??
        companyCapacityByTrade.get(key) ??
        defaultTradeCapacity(trade)
      );
    };

    // Collect unique Cat/Sel/Activity combos from the raw rows.
    const cats = new Set<string>();
    const sels = new Set<string>();

    for (const row of rawRows) {
      const cat = (row.cat ?? "").trim().toUpperCase();
      const sel = (row.sel ?? "").trim().toUpperCase();
      if (!cat || !sel) continue;
      cats.add(cat);
      sels.add(sel);
    }

    // Load relevant price list items for these Cats/Sels.
    const priceItems = await this.prisma.priceListItem.findMany({
      where: {
        priceListId: priceList.id,
        cat: { in: Array.from(cats) },
        sel: { in: Array.from(sels) },
      },
    });

    // First pass: derive hourly rates per labor minimum code from HR-unit items.
    const hourlyRateByLaborMinimum = new Map<string, number>();

    for (const item of priceItems) {
      const raw = (item.rawJson ?? null) as Record<string, unknown> | null;
      if (!raw) continue;

      const unit = String(raw["Unit"] ?? item.unit ?? "").trim().toUpperCase();
      if (unit !== "HR") continue;

      const wage = toNumber(raw["Worker's Wage"]);
      const burden = toNumber(raw["Labor burden"]);
      const overhead = toNumber(raw["Labor Overhead"]);
      const laborCostPerUnit = (wage ?? 0) + (burden ?? 0) + (overhead ?? 0);
      if (!laborCostPerUnit) continue;

      const lm = String(raw["Labor Minimum"] ?? "").trim();
      if (!lm) continue;

      if (!hourlyRateByLaborMinimum.has(lm)) {
        hourlyRateByLaborMinimum.set(lm, laborCostPerUnit);
      }
    }

    // Second pass: derive hours-per-unit per Cat/Sel/Activity from non-HR items.
    const hoursPerUnitByKey = new Map<string, number>();

    for (const item of priceItems) {
      const raw = (item.rawJson ?? null) as Record<string, unknown> | null;
      if (!raw) continue;

      const unit = String(raw["Unit"] ?? item.unit ?? "").trim().toUpperCase();
      if (!unit || unit === "HR") continue;

      const wage = toNumber(raw["Worker's Wage"]);
      const burden = toNumber(raw["Labor burden"]);
      const overhead = toNumber(raw["Labor Overhead"]);
      const laborCostPerUnit = (wage ?? 0) + (burden ?? 0) + (overhead ?? 0);
      if (!laborCostPerUnit) continue;

      const lm = String(raw["Labor Minimum"] ?? "").trim();
      const hourlyRate = lm ? hourlyRateByLaborMinimum.get(lm) ?? null : null;
      if (!hourlyRate) continue;

      const hoursPerUnit = laborCostPerUnit / hourlyRate;
      if (!hoursPerUnit || !Number.isFinite(hoursPerUnit)) continue;

      const cat = (item.cat ?? "").trim().toUpperCase();
      const sel = (item.sel ?? "").trim().toUpperCase();
      const activity = (item.activity ?? "").trim();
      if (!cat || !sel) continue;

      const key = `${cat}||${sel}||${activity}`;
      if (!hoursPerUnitByKey.has(key)) {
        hoursPerUnitByKey.set(key, hoursPerUnit);
      }
    }

    // Aggregate labor hours per raw row using the derived hours-per-unit map.
    const missingPriceItems: { cat: string | null; sel: string | null; activity: string | null }[] = [];
    const missingKeySet = new Set<string>();

    type PackageKey = string;
    const pkgMap = new Map<PackageKey, {
      room: string;
      trade: string;
      phaseCode: number;
      phaseLabel: string;
      totalLaborHours: number;
      lineCount: number;
    }>();

    for (const row of rawRows) {
      const catRaw = row.cat ?? null;
      const selRaw = row.sel ?? null;
      const activityRaw = row.activity ?? null;
      const cat = (catRaw ?? "").trim().toUpperCase();
      const sel = (selRaw ?? "").trim().toUpperCase();
      const activity = (activityRaw ?? "").trim();

      if (!cat || !sel || row.qty == null || row.qty <= 0) {
        continue;
      }

      const key = `${cat}||${sel}||${activity}`;
      const hoursPerUnit = hoursPerUnitByKey.get(key);

      if (!hoursPerUnit) {
        if (!missingKeySet.has(key)) {
          missingKeySet.add(key);
          missingPriceItems.push({ cat: catRaw, sel: selRaw, activity: activityRaw });
        }
        continue;
      }

      const lineHours = (row.qty ?? 0) * hoursPerUnit;
      if (!lineHours || !Number.isFinite(lineHours)) continue;

      const room = (row.groupDescription || row.groupCode || "Unknown").trim();
      const { trade, phaseCode, phaseLabel } = mapTradeAndPhase(catRaw, activityRaw);

      const pkgKey = `${room}||${trade}||${phaseCode}`;
      let pkg = pkgMap.get(pkgKey);
      if (!pkg) {
        pkg = {
          room,
          trade,
          phaseCode,
          phaseLabel,
          totalLaborHours: 0,
          lineCount: 0,
        };
        pkgMap.set(pkgKey, pkg);
      }

      pkg.totalLaborHours += lineHours;
      pkg.lineCount += 1;
    }

    const workPackages: WorkPackagePreview[] = [];
    let totalLaborHours = 0;

    for (const pkg of pkgMap.values()) {
      const crewSize = crewSizeForTrade(pkg.trade);
      const durationDaysRaw = pkg.totalLaborHours / (crewSize * HOURS_PER_DAY_DEFAULT);
      const durationDays = Number.isFinite(durationDaysRaw) && durationDaysRaw > 0
        ? Math.ceil(durationDaysRaw * 2) / 2
        : 0;

      totalLaborHours += pkg.totalLaborHours;

      workPackages.push({
        room: pkg.room,
        trade: pkg.trade,
        phaseCode: pkg.phaseCode,
        phaseLabel: pkg.phaseLabel,
        totalLaborHours: pkg.totalLaborHours,
        crewSize,
        durationDays,
        lineCount: pkg.lineCount,
      });
    }

    // Sort by room then phaseCode for nicer output.
    workPackages.sort((a, b) => {
      if (a.room === b.room) {
        return a.phaseCode - b.phaseCode;
      }
      return a.room.localeCompare(b.room);
    });

    // Compute a simple project start date: prefer earliest sourceDate from RAW,
    // then estimate.importedAt, then project.createdAt, falling back to "today".
    let projectStart: Date | null = null;

    let minSourceDate: Date | null = null;
    for (const row of rawRows) {
      if (row.sourceDate) {
        const d = row.sourceDate;
        if (!minSourceDate || d < minSourceDate) {
          minSourceDate = d;
        }
      }
    }
    if (minSourceDate) {
      projectStart = minSourceDate;
    } else if (estimate.importedAt) {
      projectStart = estimate.importedAt;
    } else if (estimate.project?.createdAt) {
      projectStart = estimate.project.createdAt;
    } else {
      projectStart = new Date();
    }

    // Allow an explicit project start date override from the caller.
    if (params.startDateOverride) {
      const overrideDate = new Date(params.startDateOverride);
      if (!Number.isNaN(overrideDate.getTime())) {
        projectStart = overrideDate;
      }
    }

    projectStart = toDateOnly(projectStart);

    const scheduledTasks: ScheduledTaskPreview[] = [];
    const overrides = params.taskOverrides ?? {};
    const conflicts: ScheduleConflict[] = [];

    // Optional global mitigation task at the front of the schedule.
    let workStartBase = projectStart;
    if (mitigationWindow) {
      const mitStart = projectStart;
      const mitEnd = addWorkDuration(mitStart, mitigationWindow.durationDays);

      scheduledTasks.push({
        id: `mitigation-${estimateVersionId}`,
        kind: "MITIGATION",
        room: null,
        trade: "Mitigation",
        phaseCode: 5,
        phaseLabel: "Mitigation / Dry-out",
        startDate: toIsoDate(mitStart),
        endDate: toIsoDate(mitEnd),
        durationDays: mitigationWindow.durationDays,
        predecessorIds: [],
      });

      // Start rebuild work on the next workday after mitigation completes.
      workStartBase = nextWorkday(mitEnd);
    }

    // For each room, ensure phases within that room run sequentially by phaseCode.
    const lastByRoom = new Map<string, { end: Date; taskId: string }>();
    // Track trade-level capacity using a simple lane model per trade.
    const lanesByTrade = new Map<string, (Date | null)[]>();

    for (const [index, wp] of workPackages.entries()) {
      let start = workStartBase;
      const id = `wp-${index + 1}`;
      const override = overrides[id];
      const lockType: "SOFT" | "HARD" = override?.lockType === "HARD" ? "HARD" : "SOFT";

      // Capture requested start (if any) for conflict reporting and locking.
      let requestedStart: Date | null = null;
      if (override?.startDate) {
        const d = new Date(override.startDate);
        if (!Number.isNaN(d.getTime())) {
          const dOnly = toDateOnly(d);
          requestedStart = dOnly;
          if (lockType === "SOFT") {
            // SOFT: treat as earliest-allowed start.
            if (dOnly > start) {
              start = dOnly;
            }
          } else {
            // HARD: attempt to keep the requested start even if it conflicts; do not move it automatically.
            start = dOnly;
          }
        }
      }

      const reasons: ("ROOM_DEPENDENCY" | "TRADE_CAPACITY" | "MITIGATION" | "UNKNOWN")[] = [];

      const last = lastByRoom.get(wp.room);
      if (last && last.end > start) {
        if (lockType === "SOFT") {
          // For soft-locked tasks, slide to respect room sequencing.
          start = nextWorkday(last.end);
        }
        // For hard-locked tasks, keep the requested start but record a conflict.
        reasons.push("ROOM_DEPENDENCY");
      }

      const predecessors: string[] = [];
      if (mitigationWindow) {
        predecessors.push(`mitigation-${estimateVersionId}`);
        reasons.push("MITIGATION");
      }
      if (last) {
        predecessors.push(last.taskId);
      }

      const effectiveDurationDays =
        override && typeof override.durationDays === "number" && override.durationDays > 0
          ? override.durationDays
          : wp.durationDays;

      // Enforce per-trade capacity by assigning this task to the earliest
      // available lane for its trade.
      const capacity = getTradeCapacity(wp.trade);
      let lanes = lanesByTrade.get(wp.trade);
      if (!lanes || lanes.length !== capacity) {
        lanes = Array.from({ length: capacity }, () => null);
        lanesByTrade.set(wp.trade, lanes);
      }

      // Find earliest start that fits within available lanes.
      // A lane is free if its lastEnd <= proposed start.
      let pushedByCapacity = false;
      if (lockType === "SOFT") {
        while (true) {
          let freeLaneIndex = -1;
          for (let i = 0; i < lanes.length; i++) {
            const laneEnd = lanes[i];
            if (!laneEnd || laneEnd.getTime() <= start.getTime()) {
              freeLaneIndex = i;
              break;
            }
          }

          if (freeLaneIndex >= 0) {
            break;
          }

          // All lanes are busy; push start to the next workday after the
          // earliest lane end and try again.
          let minEnd = lanes[0]!;
          for (let i = 1; i < lanes.length; i++) {
            const laneEnd = lanes[i]!;
            if (laneEnd.getTime() < minEnd.getTime()) {
              minEnd = laneEnd;
            }
          }
          start = nextWorkday(minEnd);
          pushedByCapacity = true;
        }
      }

      const end = addWorkDuration(start, effectiveDurationDays);
      lastByRoom.set(wp.room, { end, taskId: id });

      // Assign this task to the lane whose end <= start.
      const laneIndex = (() => {
        for (let i = 0; i < lanes!.length; i++) {
          const laneEnd = lanes![i];
          if (!laneEnd || laneEnd.getTime() <= start.getTime()) {
            return i;
          }
        }
        return 0;
      })();

      // For hard-locked tasks, detect overbooked capacity without moving the start.
      const previousLaneEnd = lanes![laneIndex];
      if (lockType === "HARD" && previousLaneEnd && previousLaneEnd.getTime() > start.getTime()) {
        pushedByCapacity = true;
      }

      lanes![laneIndex] = end;

      if (pushedByCapacity) {
        reasons.push("TRADE_CAPACITY");
      }

      // Record conflicts for requested starts.
      if (requestedStart && lockType === "SOFT" && start.getTime() > requestedStart.getTime()) {
        // SOFT: start was pushed later than requested.
        const requestedIso = requestedStart.toISOString().slice(0, 10);
        const scheduledIso = toIsoDate(start);
        const reasonList: ScheduleConflictReason[] = (reasons.length ? reasons : ["UNKNOWN"]) as ScheduleConflictReason[];
        conflicts.push({
          taskId: id,
          type: "START_DELAYED",
          requestedStart: requestedIso,
          scheduledStart: scheduledIso,
          reasons: reasonList,
          message: formatConflictMessage({
            type: "START_DELAYED",
            reasons: reasonList,
            requestedStart: requestedIso,
            scheduledStart: scheduledIso,
            room: wp.room,
            trade: wp.trade,
            phaseLabel: wp.phaseLabel,
          }),
        });
      } else if (requestedStart && lockType === "HARD" && reasons.length > 0) {
        // HARD: we kept the requested start but it conflicts with dependencies or capacity.
        const requestedIso = requestedStart.toISOString().slice(0, 10);
        const scheduledIso = toIsoDate(start);
        const reasonList: ScheduleConflictReason[] = (reasons.length ? reasons : ["UNKNOWN"]) as ScheduleConflictReason[];
        conflicts.push({
          taskId: id,
          type: "HARD_START_CONSTRAINT",
          requestedStart: requestedIso,
          scheduledStart: scheduledIso,
          reasons: reasonList,
          message: formatConflictMessage({
            type: "HARD_START_CONSTRAINT",
            reasons: reasonList,
            requestedStart: requestedIso,
            scheduledStart: scheduledIso,
            room: wp.room,
            trade: wp.trade,
            phaseLabel: wp.phaseLabel,
          }),
        });
      }

      const task: ScheduledTaskPreview = {
        id,
        kind: "WORK",
        room: wp.room,
        trade: wp.trade,
        phaseCode: wp.phaseCode,
        phaseLabel: wp.phaseLabel,
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        durationDays: effectiveDurationDays,
        totalLaborHours: wp.totalLaborHours,
        crewSize: wp.crewSize,
        predecessorIds: predecessors,
      };

      scheduledTasks.push(task);
    }

    return {
      projectId,
      estimateVersionId,
      totalLaborHours,
      workPackages,
      missingPriceItems,
      mitigationWindow,
      scheduledTasks,
      conflicts,
    };
  }

  /**
   * Persist the current schedule for a project/estimate and record change logs.
   */
  async commitSchedule(
    params: GenerateScheduleParams & { actorUserId: string },
  ): Promise<{ scheduledTasks: ScheduledTaskPreview[]; changes: any[]; conflicts: ScheduleConflict[] }> {
    const preview = await this.generateSchedulePreview(params);
    const { projectId, estimateVersionId, scheduledTasks, conflicts } = preview;
    const actorUserId = params.actorUserId;

    const changes = await (this.prisma as any).$transaction(async (tx: any) => {
      const existing: any[] = await tx.projectScheduleTask.findMany({
        where: { projectId, estimateVersionId },
      });

      const bySyntheticId = new Map<string, any>();
      for (const row of existing) {
        bySyntheticId.set(row.syntheticId, row);
      }

      const changeRows: any[] = [];

      for (const task of scheduledTasks) {
        const syntheticId = task.id;
        const prev = bySyntheticId.get(syntheticId) ?? null;

        const startDate = new Date(task.startDate);
        const endDate = new Date(task.endDate);
        const durationDays = task.durationDays;

        if (!prev) {
          // New task for this project/estimate.
          const created = await tx.projectScheduleTask.create({
            data: {
              projectId,
              estimateVersionId,
              syntheticId,
              kind: task.kind,
              room: task.room,
              trade: task.trade,
              phaseCode: task.phaseCode,
              phaseLabel: task.phaseLabel,
              startDate,
              endDate,
              durationDays,
              totalLaborHours: task.totalLaborHours ?? null,
              crewSize: task.crewSize ?? null,
              predecessorIds: task.predecessorIds ?? [],
            },
          });

          const log = await tx.projectScheduleChangeLog.create({
            data: {
              projectId,
              estimateVersionId,
              scheduleTaskId: created.id,
              taskSyntheticId: syntheticId,
              changeType: "TASK_CREATED",
              previousStartDate: null,
              previousEndDate: null,
              previousDurationDays: null,
              newStartDate: startDate,
              newEndDate: endDate,
              newDurationDays: durationDays,
              actorUserId,
            },
          });

          changeRows.push({
            taskId: created.id,
            syntheticId,
            changeType: log.changeType,
            previousDurationDays: null,
            newDurationDays: durationDays,
          });
        } else {
          const prevStart = prev.startDate as Date;
          const prevEnd = prev.endDate as Date;
          const prevDuration = prev.durationDays as number;

          const startChanged = prevStart.getTime() !== startDate.getTime();
          const endChanged = prevEnd.getTime() !== endDate.getTime();
          const durationChanged = prevDuration !== durationDays;

          if (!startChanged && !endChanged && !durationChanged) {
            continue;
          }

          const updated = await tx.projectScheduleTask.update({
            where: { id: prev.id },
            data: {
              startDate,
              endDate,
              durationDays,
              totalLaborHours: task.totalLaborHours ?? prev.totalLaborHours ?? null,
              crewSize: task.crewSize ?? prev.crewSize ?? null,
              predecessorIds: task.predecessorIds ?? prev.predecessorIds ?? [],
            },
          });

          const log = await tx.projectScheduleChangeLog.create({
            data: {
              projectId,
              estimateVersionId,
              scheduleTaskId: updated.id,
              taskSyntheticId: syntheticId,
              changeType: "TASK_UPDATED",
              previousStartDate: prevStart,
              previousEndDate: prevEnd,
              previousDurationDays: prevDuration,
              newStartDate: startDate,
              newEndDate: endDate,
              newDurationDays: durationDays,
              actorUserId,
            },
          });

          changeRows.push({
            taskId: updated.id,
            syntheticId,
            changeType: log.changeType,
            previousDurationDays: prevDuration,
            newDurationDays: durationDays,
          });
        }
      }

      return changeRows;
    });

    return { scheduledTasks, changes, conflicts };
  }

  getConflictMetadata() {
    return {
      types: [
        {
          code: "START_DELAYED" as ScheduleConflictType,
          description: "Soft-locked task was pushed later than its requested start date to satisfy dependencies or trade capacity.",
          severity: "warning",
        },
        {
          code: "HARD_START_CONSTRAINT" as ScheduleConflictType,
          description: "Hard-locked task kept its requested start date but conflicts with room dependencies, mitigation, or trade capacity.",
          severity: "error",
        },
      ],
      reasons: [
        {
          code: "ROOM_DEPENDENCY" as ScheduleConflictReason,
          description: "Previous phase in the same room was not completed before this task's start.",
        },
        {
          code: "TRADE_CAPACITY" as ScheduleConflictReason,
          description: "Scheduled crews for this trade exceed the configured concurrent capacity.",
        },
        {
          code: "MITIGATION" as ScheduleConflictReason,
          description: "Rebuild work cannot start until mitigation / dry-out completes.",
        },
        {
          code: "UNKNOWN" as ScheduleConflictReason,
          description: "The scheduler detected a constraint that could not be classified more specifically.",
        },
      ],
    };
  }

  async getDailySummaryForProject(
    projectId: string,
    from: string,
    to: string,
  ): Promise<DailySummaryDay[]> {
    let fromDate = new Date(from);
    let toDate = new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new Error("Invalid from/to date for daily summary");
    }

    fromDate = toDateOnly(fromDate);
    toDate = toDateOnly(toDate);

    if (toDate.getTime() < fromDate.getTime()) {
      const tmp = fromDate;
      fromDate = toDate;
      toDate = tmp;
    }

    const rangeEndExclusive = addDays(toDate, 1);

    const tasks = await (this.prisma as any).projectScheduleTask.findMany({
      where: {
        projectId,
        startDate: { lt: rangeEndExclusive },
        endDate: { gte: fromDate },
      },
      orderBy: [{ phaseCode: "asc" }, { startDate: "asc" }],
    });

    const days: DailySummaryDay[] = [];

    for (let cursor = new Date(fromDate.getTime()); cursor < rangeEndExclusive; cursor = addDays(cursor, 1)) {
      const dayStart = toDateOnly(cursor);
      const dayEnd = addDays(dayStart, 1);
      const dateKey = toIsoDate(dayStart);

      const dayTasks: DailySummaryTask[] = [];

      for (const row of tasks) {
        const rowStart = row.startDate as Date;
        const rowEnd = row.endDate as Date;

        if (rowStart >= dayEnd || rowEnd < dayStart) {
          continue;
        }

        dayTasks.push({
          id: row.id,
          syntheticId: row.syntheticId,
          kind: row.kind,
          room: row.room,
          trade: row.trade,
          phaseCode: row.phaseCode,
          phaseLabel: row.phaseLabel,
          startDate: toIsoDate(rowStart),
          endDate: toIsoDate(rowEnd),
          durationDays: row.durationDays,
          totalLaborHours: row.totalLaborHours,
          crewSize: row.crewSize,
        });
      }

      const tradeTotalsMap = new Map<string, DailySummaryByTrade>();
      for (const task of dayTasks) {
        const tradeKey = (task.trade ?? "Unknown").trim() || "Unknown";
        let agg = tradeTotalsMap.get(tradeKey);
        if (!agg) {
          agg = { trade: tradeKey, taskCount: 0, totalLaborHours: 0 };
          tradeTotalsMap.set(tradeKey, agg);
        }
        agg.taskCount += 1;
        if (task.totalLaborHours && Number.isFinite(task.totalLaborHours)) {
          agg.totalLaborHours += task.totalLaborHours;
        }
      }

      days.push({
        date: dateKey,
        tasks: dayTasks,
        tradeTotals: Array.from(tradeTotalsMap.values()),
      });
    }

    return days;
  }
}
