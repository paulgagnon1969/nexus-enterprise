import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { rebuildPayrollWeekForProject } from "@repo/database/src/payroll-from-timecards";

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

    // Replace entries with the provided set
    await (this.prisma as any).dailyTimeEntry.deleteMany({ where: { timecardId: card.id } });

    if (body.entries?.length) {
      await (this.prisma as any).dailyTimeEntry.createMany({
        data: body.entries.map((e) => ({
          timecardId: card.id,
          workerId: e.workerId,
          locationCode: e.locationCode ?? null,
          stHours: e.stHours ?? 0,
          otHours: e.otHours ?? 0,
          dtHours: e.dtHours ?? 0,
        })),
      });
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
}
