import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { rebuildPayrollWeekForProject } from "@repo/database";
import * as argon2 from "argon2";
import { Role, ProjectRole, ProjectParticipantScope, ProjectVisibilityLevel } from "@prisma/client";

export interface UpsertTimecardEntryDto {
  workerId: string;
  stHours: number;
  otHours?: number;
  dtHours?: number;
  locationCode?: string;
}

export interface UpsertTimecardDto {
  date: string; // YYYY-MM-DD
  entries: UpsertTimecardEntryDto[];
}

export interface ImportWeeklyCsvDto {
  csvText: string;
  companyIdOverride?: string;
}

@Injectable()
export class TimecardService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(dateStr: string): Date {
    const d = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      throw new NotFoundException(`Invalid date: ${dateStr}`);
    }
    return d;
  }

  async getTimecardForProjectDate(params: {
    companyId: string;
    projectId: string;
    date: string;
  }) {
    const { companyId, projectId, date } = params;
    const d = this.parseDate(date);

    const card = await (this.prisma as any).dailyTimecard.findFirst({
      where: { companyId, projectId, date: d },
      include: {
        entries: {
          include: {
            worker: {
              select: { id: true, firstName: true, lastName: true, fullName: true },
            },
          },
        },
      },
    });

    if (!card) {
      return { id: null, companyId, projectId, date, entries: [] };
    }

    return {
      id: card.id,
      companyId: card.companyId,
      projectId: card.projectId,
      date,
      entries: card.entries.map((e: any) => ({
        id: e.id,
        workerId: e.workerId,
        workerName: e.worker?.fullName ?? null,
        locationCode: e.locationCode ?? null,
        stHours: e.stHours,
        otHours: e.otHours,
        dtHours: e.dtHours,
        timeIn: e.timeIn,
        timeOut: e.timeOut,
      })),
    };
  }

  async upsertTimecard(params: {
    companyId: string;
    projectId: string;
    userId: string;
    body: UpsertTimecardDto;
  }) {
    const { companyId, projectId, userId, body } = params;
    const d = this.parseDate(body.date);

    // Ensure project belongs to company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException("Project not found for company");
    }

    // Upsert the timecard header
    const card = await (this.prisma as any).dailyTimecard.upsert({
      where: {
        DailyTimecard_company_project_date_key: {
          companyId,
          projectId,
          date: d,
        },
      },
      update: {
        createdByUserId: userId,
      },
      create: {
        companyId,
        projectId,
        date: d,
        createdByUserId: userId,
      },
    });

    // Load existing entries so we can record audit logs when workers are
    // reassigned but the underlying hours stay the same.
    const existingEntries: any[] = await (this.prisma as any).dailyTimeEntry.findMany({
      where: { timecardId: card.id },
    });

    const newEntriesData = (body.entries ?? []).map((e) => ({
      timecardId: card.id,
      workerId: e.workerId,
      locationCode: e.locationCode ?? null,
      stHours: e.stHours ?? 0,
      otHours: e.otHours ?? 0,
      dtHours: e.dtHours ?? 0,
    }));

    const editLogs: any[] = [];
    const remainingOld = [...existingEntries];

    for (const newEntry of newEntriesData) {
      const idx = remainingOld.findIndex((old) =>
        old.workerId !== newEntry.workerId &&
        (old.locationCode ?? null) === (newEntry.locationCode ?? null) &&
        Number(old.stHours ?? 0) === Number(newEntry.stHours ?? 0) &&
        Number(old.otHours ?? 0) === Number(newEntry.otHours ?? 0) &&
        Number(old.dtHours ?? 0) === Number(newEntry.dtHours ?? 0)
      );

      if (idx >= 0) {
        const old = remainingOld[idx];
        remainingOld.splice(idx, 1);

        editLogs.push({
          companyId,
          projectId,
          timecardId: card.id,
          date: d,
          oldWorkerId: old.workerId,
          newWorkerId: newEntry.workerId,
          locationCode: newEntry.locationCode ?? null,
          oldStHours: Number(old.stHours ?? 0),
          oldOtHours: Number(old.otHours ?? 0),
          oldDtHours: Number(old.dtHours ?? 0),
          newStHours: Number(newEntry.stHours ?? 0),
          newOtHours: Number(newEntry.otHours ?? 0),
          newDtHours: Number(newEntry.dtHours ?? 0),
          editedByUserId: userId,
        });
      }
    }

    // Replace entries with the provided set
    await (this.prisma as any).dailyTimeEntry.deleteMany({ where: { timecardId: card.id } });

    if (newEntriesData.length) {
      await (this.prisma as any).dailyTimeEntry.createMany({
        data: newEntriesData,
      });
    }

    if (editLogs.length) {
      await (this.prisma as any).timecardEditLog.createMany({ data: editLogs });
    }

    // Rebuild weekly payroll for this project/week
    await rebuildPayrollWeekForProject({
      companyId,
      projectId,
      weekEndDate: d,
    });

    return this.getTimecardForProjectDate({ companyId, projectId, date: body.date });
  }

  async copyFromPrevious(params: {
    companyId: string;
    projectId: string;
    userId: string;
    date: string;
  }) {
    const { companyId, projectId, userId, date } = params;
    const targetDate = this.parseDate(date);

    // Find most recent prior timecard
    const prev = await (this.prisma as any).dailyTimecard.findFirst({
      where: {
        companyId,
        projectId,
        date: {
          lt: targetDate,
        },
      },
      orderBy: { date: "desc" },
      include: { entries: true },
    });

    if (!prev) {
      // Nothing to copy; just ensure an empty card exists
      return this.upsertTimecard({
        companyId,
        projectId,
        userId,
        body: { date, entries: [] },
      });
    }

    const entries: UpsertTimecardEntryDto[] = prev.entries.map((e: any) => ({
      workerId: e.workerId,
      locationCode: e.locationCode ?? undefined,
      stHours: e.stHours,
      otHours: e.otHours ?? 0,
      dtHours: e.dtHours ?? 0,
    }));

    return this.upsertTimecard({
      companyId,
      projectId,
      userId,
      body: { date, entries },
    });
  }

  async importWeeklyFromCsv(params: {
    companyId: string;
    projectId: string;
    body: ImportWeeklyCsvDto;
  }) {
    const { companyId, projectId, body } = params;
    const { csvText, companyIdOverride } = body;
    if (!csvText || !csvText.trim()) {
      throw new NotFoundException("csvText is required");
    }

    // For now, we reuse the CSV format from the database importer: header + rows.
    // We only pay attention to rows whose project_code matches this project.
    // company_id can be overridden via companyIdOverride or defaults to the authenticated company.
    const effectiveCompanyId = (companyIdOverride || companyId).trim();
    const DEFAULT_PASSWORD = process.env.TIMECARD_DEFAULT_PASSWORD || "Nexus2026.01";
    const defaultPasswordHash = await argon2.hash(DEFAULT_PASSWORD);

    // Parse CSV
    // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
    const parse = require("csv-parse/sync").parse as typeof import("csv-parse/sync").parse;
    let rows: any[] = [];
    try {
      // Detect whether the incoming text is comma- or tab-delimited based on the
      // first line. This allows copy/paste directly from Excel/Sheets (TSV) as
      // well as traditional CSV files.
      const firstLine = csvText.split(/\r?\n/, 1)[0] ?? "";
      const hasTabs = firstLine.includes("\t");

      rows = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: hasTabs ? "\t" : ",",
        relax_column_count: true,
      });
    } catch (err: any) {
      throw new NotFoundException(`Failed to parse CSV: ${err?.message || String(err)}`);
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: effectiveCompanyId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException("Project not found for company");
    }

    type WeekKey = string; // companyId|projectId|weekEndDate
    const touchedWeeks = new Set<WeekKey>();

    const parseNumber = (raw: any): number => {
      if (raw == null) return 0;
      const t = String(raw).trim();
      if (!t) return 0;
      const n = Number(t);
      return Number.isFinite(n) ? n : 0;
    };

    const ensureIsoDate = (raw: string): string | null => {
      const t = raw.trim();
      if (!t) return null;
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };

    const shiftDate = (iso: string, days: number): string => {
      const d = new Date(iso + "T00:00:00");
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const dayOffsets = [0, 1, 2, 3, 4, 5, 6];

    let processed = 0;
    const warnings: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] as any;
      const line = index + 2;

      const rowCompanyId = (row.company_id || effectiveCompanyId).trim();
      const rowProjectCode = (row.project_code || "").trim();
      const workerName = (row.worker_name || "").trim();
      const workerEmailRaw = (row.worker_email || "").trim();
      const workerEmail = workerEmailRaw ? workerEmailRaw.toLowerCase() : null;
      const workerPhone = (row.worker_phone || "").trim() || null;
      const locationCode = (row.location_code || "").trim() || null;
      const weekEndIso = row.week_end_date ? ensureIsoDate(String(row.week_end_date)) : null;

      if (!rowCompanyId || !rowProjectCode || !workerName || !weekEndIso) {
        warnings.push(
          `Line ${line}: missing required fields (company_id, project_code, worker_name, week_end_date). Skipping.`,
        );
        // eslint-disable-next-line no-continue
        continue;
      }

      if (rowCompanyId !== effectiveCompanyId) {
        // Different company; ignore in this call.
        // eslint-disable-next-line no-continue
        continue;
      }

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
        warnings.push(`Line ${line}: no hours for any day. Skipping.`);
        // eslint-disable-next-line no-continue
        continue;
      }

      let worker = await (this.prisma as any).worker.findFirst({
        where: workerEmail
          ? { email: workerEmail }
          : { fullName: workerName },
      });

      if (!worker && workerEmail) {
        worker = await (this.prisma as any).worker.findFirst({ where: { fullName: workerName } });
      }

      if (!worker) {
        const parts = workerName.split(/\s+/).filter(Boolean);
        const firstName = parts[0] ?? workerName;
        const lastName = parts.slice(1).join(" ") || "";
        worker = await (this.prisma as any).worker.create({
          data: {
            firstName,
            lastName,
            fullName: workerName,
            email: workerEmail,
            phone: workerPhone,
          },
        });
      }

      // Ensure User + CompanyMembership + ProjectMembership when we have an email
      if (workerEmail) {
        const emailNorm = workerEmail.toLowerCase();
        let user = await this.prisma.user.findFirst({
          where: { email: { equals: emailNorm, mode: "insensitive" } },
        });
        if (!user) {
          const parts = workerName.split(/\s+/).filter(Boolean);
          const firstName = parts[0] ?? null;
          const lastName = parts.slice(1).join(" ") || null;
          user = await this.prisma.user.create({
            data: {
              email: emailNorm,
              passwordHash: defaultPasswordHash,
              firstName,
              lastName,
            },
          });
        }

        await this.prisma.companyMembership.upsert({
          where: {
            userId_companyId: {
              userId: user.id,
              companyId: rowCompanyId,
            },
          },
          update: {},
          create: {
            userId: user.id,
            companyId: rowCompanyId,
            role: Role.MEMBER,
          },
        });

        await this.prisma.projectMembership.upsert({
          where: {
            userId_projectId: {
              userId: user.id,
              projectId: project.id,
            },
          },
          update: {},
          create: {
            userId: user.id,
            projectId: project.id,
            companyId: rowCompanyId,
            role: ProjectRole.VIEWER,
            scope: ProjectParticipantScope.OWNER_MEMBER,
            visibility: ProjectVisibilityLevel.FULL,
          },
        });
      }

      const weekStartIso = shiftDate(weekEndIso, -6);

      for (let i = 0; i < 7; i += 1) {
        const stHours = st[i];
        const otHours = ot[i];
        const dtHours = dt[i];
        if (!stHours && !otHours && !dtHours) continue;

        const dateIso = shiftDate(weekStartIso, dayOffsets[i]);

        const card = await (this.prisma as any).dailyTimecard.upsert({
          where: {
            DailyTimecard_company_project_date_key: {
              companyId: rowCompanyId,
              projectId: project.id,
              date: this.parseDate(dateIso),
            },
          },
          update: {},
          create: {
            companyId: rowCompanyId,
            projectId: project.id,
            date: this.parseDate(dateIso),
            createdByUserId: null,
          },
        });

        await (this.prisma as any).dailyTimeEntry.deleteMany({
          where: {
            timecardId: card.id,
            workerId: worker.id,
          },
        });

        await (this.prisma as any).dailyTimeEntry.create({
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

      const key: WeekKey = `${rowCompanyId}|${project.id}|${weekEndIso}`;
      touchedWeeks.add(key);
      processed += 1;
    }

    // Rebuild payroll for each touched week
    for (const key of touchedWeeks) {
      const [cId, pId, weekEndIso] = key.split("|");
      const weekEndDate = this.parseDate(weekEndIso);
      await rebuildPayrollWeekForProject({
        companyId: cId,
        projectId: pId,
        weekEndDate,
      });
    }

    return {
      processedRows: processed,
      touchedWeeks: Array.from(touchedWeeks),
      warnings,
    };
  }

  async getEditLogsForProjectWeek(params: {
    companyId: string;
    projectId: string;
    weekStartIso: string;
    weekEndIso: string;
  }) {
    const { companyId, projectId, weekStartIso, weekEndIso } = params;
    const start = this.parseDate(weekStartIso);
    const end = this.parseDate(weekEndIso);

    const logs = await (this.prisma as any).timecardEditLog.findMany({
      where: {
        companyId,
        projectId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!logs.length) {
      return { logs: [] };
    }

    const workerIds = Array.from(
      new Set<string>(
        logs.flatMap((l: any) => [l.oldWorkerId, l.newWorkerId].filter(Boolean)),
      ),
    );

    const workers = await (this.prisma as any).worker.findMany({
      where: { id: { in: workerIds } },
      select: { id: true, firstName: true, lastName: true, fullName: true },
    });
    const workerById = new Map<string, any>();
    workers.forEach((w: any) => workerById.set(w.id, w));

    const userIds = Array.from(
      new Set<string>(logs.map((l: any) => l.editedByUserId).filter(Boolean)),
    );
    let users: any[] = [];
    if (userIds.length) {
      users = await this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
    }
    const userById = new Map<string, any>();
    users.forEach((u) => userById.set(u.id, u));

    const dto = logs.map((l: any) => {
      const oldWorker = workerById.get(l.oldWorkerId);
      const newWorker = workerById.get(l.newWorkerId);
      const editor = l.editedByUserId ? userById.get(l.editedByUserId) : null;

      const pickName = (w: any) =>
        !w
          ? null
          : w.fullName ||
            [w.firstName, w.lastName].filter((x: string | null) => x && x.trim()).join(" ");

      const formatIso = (d: Date) => d.toISOString().slice(0, 10);

      return {
        id: l.id,
        date: formatIso(l.date),
        locationCode: l.locationCode,
        oldWorkerId: l.oldWorkerId,
        oldWorkerName: pickName(oldWorker),
        newWorkerId: l.newWorkerId,
        newWorkerName: pickName(newWorker),
        oldStHours: l.oldStHours,
        oldOtHours: l.oldOtHours,
        oldDtHours: l.oldDtHours,
        newStHours: l.newStHours,
        newOtHours: l.newOtHours,
        newDtHours: l.newDtHours,
        editedByUserId: l.editedByUserId,
        editedByName: editor
          ? [editor.firstName, editor.lastName]
              .filter((x: string | null) => x && x.trim())
              .join(" ") || editor.email
          : null,
        createdAt: l.createdAt,
      };
    });

    return { logs: dto };
  }
}
