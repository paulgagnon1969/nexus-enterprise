import { Body, Controller, Get, Post, Param, Query, Req, UseGuards, BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { XactScheduleService } from "./xact-schedule.service";

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/xact-schedule")
export class XactScheduleController {
  constructor(private readonly schedule: XactScheduleService) {}

  @Get("trade-capacity")
  async getTradeCapacityConfig(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for trade capacity");
    }

    const prisma = (this.schedule as any)["prisma"];

    const rows = await prisma.tradeCapacityConfig.findMany({
      where: {
        companyId: user.companyId,
        OR: [
          { projectId: null },
          { projectId },
        ],
      },
      orderBy: [{ projectId: "asc" }, { trade: "asc" }],
    });

    return rows;
  }

  @Post("trade-capacity")
  async upsertTradeCapacityConfig(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Body() body: any,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      throw new BadRequestException("Missing company context for trade capacity");
    }

    const rawTrade: unknown = body?.trade;
    const rawMax: unknown = body?.maxConcurrent;
    const rawScope: unknown = body?.scope;

    const trade =
      typeof rawTrade === "string" && rawTrade.trim().length > 0
        ? rawTrade.trim()
        : null;
    if (!trade) {
      throw new BadRequestException("trade is required");
    }

    const maxConcurrent = Number(rawMax);
    if (!Number.isFinite(maxConcurrent) || maxConcurrent <= 0) {
      throw new BadRequestException("maxConcurrent must be a positive number");
    }

    const scope =
      typeof rawScope === "string" && rawScope.trim().length > 0
        ? rawScope.trim().toLowerCase()
        : "project";

    const targetProjectId = scope === "company" ? null : projectId;

    const prisma = (this.schedule as any)["prisma"];

    const existing = await prisma.tradeCapacityConfig.findFirst({
      where: {
        companyId: user.companyId,
        projectId: targetProjectId,
        trade,
      },
    });

    if (existing) {
      const updated = await prisma.tradeCapacityConfig.update({
        where: { id: existing.id },
        data: { maxConcurrent },
      });
      return updated;
    }

    const created = await prisma.tradeCapacityConfig.create({
      data: {
        companyId: user.companyId,
        projectId: targetProjectId,
        trade,
        maxConcurrent,
      },
    });

    return created;
  }

  @Get("estimate/:estimateVersionId/tasks")
  async getScheduleTasks(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("estimateVersionId") estimateVersionId: string,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new Error("Missing user context for schedule fetch");
    }

    const tasks = await (this.schedule as any)["prisma"].projectScheduleTask.findMany({
      where: { projectId, estimateVersionId },
      orderBy: [{ phaseCode: "asc" }, { startDate: "asc" }],
    });

    return tasks;
  }

  @Get("date/:date")
  async getTasksForDate(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("date") date: string,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new Error("Missing user context for schedule date view");
    }

    const day = new Date(date);
    if (Number.isNaN(day.getTime())) {
      throw new Error("Invalid date format; expected ISO YYYY-MM-DD");
    }
    const start = new Date(day.getTime());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + 1);

    const tasks = await (this.schedule as any)["prisma"].projectScheduleTask.findMany({
      where: {
        projectId,
        startDate: { lt: end },
        endDate: { gte: start },
      },
      orderBy: [{ phaseCode: "asc" }, { startDate: "asc" }],
    });

    return tasks;
  }

  @Get("conflict-metadata")
  getConflictMetadata() {
    return this.schedule.getConflictMetadata();
  }

  @Get("daily-summary")
  async getDailySummary(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Query("from") from: string,
    @Query("to") to?: string,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new Error("Missing user context for daily summary");
    }

    if (!from || typeof from !== "string") {
      throw new BadRequestException("from query parameter (YYYY-MM-DD) is required");
    }

    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException("Invalid from date; expected ISO YYYY-MM-DD");
    }

    const toValue = to && typeof to === "string" && to.trim().length > 0 ? to : from;
    const toDate = new Date(toValue);
    if (Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Invalid to date; expected ISO YYYY-MM-DD");
    }

    if (toDate.getTime() < fromDate.getTime()) {
      throw new BadRequestException("to must be on or after from");
    }

    const maxRangeDays = 180;
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > maxRangeDays) {
      throw new BadRequestException(`Date range too large; maximum is ${maxRangeDays} days`);
    }

    return this.schedule.getDailySummaryForProject(projectId, from, toValue);
  }

  @Get("estimate/:estimateVersionId/history")
  async getScheduleHistory(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("estimateVersionId") estimateVersionId: string,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new Error("Missing user context for schedule history");
    }

    const logs = await (this.schedule as any)["prisma"].projectScheduleChangeLog.findMany({
      where: { projectId, estimateVersionId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return logs.map((log: any) => ({
      id: log.id,
      taskSyntheticId: log.taskSyntheticId,
      changeType: log.changeType,
      previousStartDate: log.previousStartDate,
      previousEndDate: log.previousEndDate,
      previousDurationDays: log.previousDurationDays,
      newStartDate: log.newStartDate,
      newEndDate: log.newEndDate,
      newDurationDays: log.newDurationDays,
      actor: log.actor
        ? {
            id: log.actor.id,
            name:
              `${log.actor.firstName ?? ""} ${log.actor.lastName ?? ""}`.trim() ||
              log.actor.email,
            email: log.actor.email,
          }
        : null,
      createdAt: log.createdAt,
    }));
  }

  @Post("estimate/:estimateVersionId/preview")
  async previewSchedule(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("estimateVersionId") estimateVersionId: string,
    @Body() body: any,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    const rawStartDate: unknown = body?.startDate;
    const rawTaskOverrides: unknown = body?.taskOverrides;
    const startDateOverride =
      typeof rawStartDate === "string" && rawStartDate.trim().length > 0
        ? rawStartDate.trim()
        : null;

    const taskOverrides =
      rawTaskOverrides && typeof rawTaskOverrides === "object" ? (rawTaskOverrides as any) : undefined;

    return this.schedule.generateSchedulePreview({
      companyId: user?.companyId ?? null,
      projectId,
      estimateVersionId,
      startDateOverride,
      taskOverrides,
    });
  }

  @Post("estimate/:estimateVersionId/conflicts")
  async previewConflicts(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("estimateVersionId") estimateVersionId: string,
    @Body() body: any,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    const rawStartDate: unknown = body?.startDate;
    const rawTaskOverrides: unknown = body?.taskOverrides;
    const startDateOverride =
      typeof rawStartDate === "string" && rawStartDate.trim().length > 0
        ? rawStartDate.trim()
        : null;

    const taskOverrides =
      rawTaskOverrides && typeof rawTaskOverrides === "object" ? (rawTaskOverrides as any) : undefined;

    const preview = await this.schedule.generateSchedulePreview({
      companyId: user?.companyId ?? null,
      projectId,
      estimateVersionId,
      startDateOverride,
      taskOverrides,
    });

    const prisma = (this.schedule as any)["prisma"];
    const existingTasks = await prisma.projectScheduleTask.findMany({
      where: { projectId, estimateVersionId },
    });

    const bySyntheticId = new Map<string, any>();
    for (const row of existingTasks) {
      bySyntheticId.set(row.syntheticId, row);
    }

    return preview.conflicts.map((conflict: any) => {
      const persisted = bySyntheticId.get(conflict.taskId) ?? null;
      if (!persisted) {
        return {
          conflict,
          persistedTask: null,
        };
      }

      return {
        conflict,
        persistedTask: {
          id: persisted.id,
          syntheticId: persisted.syntheticId,
          projectId: persisted.projectId,
          estimateVersionId: persisted.estimateVersionId,
          kind: persisted.kind,
          room: persisted.room,
          trade: persisted.trade,
          phaseCode: persisted.phaseCode,
          phaseLabel: persisted.phaseLabel,
          startDate: persisted.startDate,
          endDate: persisted.endDate,
          durationDays: persisted.durationDays,
          totalLaborHours: persisted.totalLaborHours,
          crewSize: persisted.crewSize,
        },
      };
    });
  }

  @Post("estimate/:estimateVersionId/commit")
  async commitSchedule(
    @Req() req: FastifyRequest,
    @Param("projectId") projectId: string,
    @Param("estimateVersionId") estimateVersionId: string,
    @Body() body: any,
  ) {
    const anyReq: any = req as any;
    const user = anyReq.user as AuthenticatedUser | undefined;

    if (!user) {
      // JwtAuthGuard should prevent this, but keep a defensive check.
      throw new Error("Missing user context for schedule commit");
    }

    const rawStartDate: unknown = body?.startDate;
    const rawTaskOverrides: unknown = body?.taskOverrides;

    const startDateOverride =
      typeof rawStartDate === "string" && rawStartDate.trim().length > 0
        ? rawStartDate.trim()
        : null;

    const taskOverrides =
      rawTaskOverrides && typeof rawTaskOverrides === "object" ? (rawTaskOverrides as any) : undefined;

    const result = await this.schedule.commitSchedule({
      companyId: user.companyId ?? null,
      projectId,
      estimateVersionId,
      startDateOverride,
      taskOverrides,
      actorUserId: user.userId,
    });

    return result;
  }
}
