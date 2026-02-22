import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CombinedAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { Prisma } from "@prisma/client";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

interface CreateTimeEntryInput {
  userId?: string | null;
  externalName?: string | null;
  clockIn: string; // ISO datetime
  clockOut?: string | null;
  breakMinutes?: number;
  note?: string | null;
  source?: string;
}

interface UpdateTimeEntryInput {
  clockIn?: string;
  clockOut?: string | null;
  breakMinutes?: number;
  hoursWorked?: number | null;
  note?: string | null;
}

/**
 * Compute worked hours from clockIn, clockOut, and breakMinutes.
 * Returns null if clockOut is missing.
 */
function computeHoursWorked(
  clockIn: Date,
  clockOut: Date | null,
  breakMinutes: number,
): Decimal | null {
  if (!clockOut) return null;
  const diffMs = clockOut.getTime() - clockIn.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const netHours = Math.max(0, diffHours - breakMinutes / 60);
  return new Decimal(netHours.toFixed(2));
}

@Controller("projects/:projectId")
export class TimeEntryController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /projects/:projectId/daily-logs/:logId/time-entries
   *
   * Bulk-create time entries for a TADL daily log.
   * Accepts an array of entries; each must identify a person via userId or externalName.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post("daily-logs/:logId/time-entries")
  async createTimeEntries(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("logId") logId: string,
    @Body() body: { entries: CreateTimeEntryInput[] },
  ) {
    const user = req.user as AuthenticatedUser;

    // Verify project access
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: { id: true, companyId: true },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    // Verify the daily log exists and belongs to this project
    const dailyLog = await this.prisma.dailyLog.findFirst({
      where: { id: logId, projectId },
      select: { id: true, type: true },
    });
    if (!dailyLog) {
      throw new NotFoundException("Daily log not found");
    }

    if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) {
      throw new BadRequestException("At least one time entry is required");
    }

    // Validate and build create data
    const createData = body.entries.map((entry, idx) => {
      if (!entry.userId && !entry.externalName) {
        throw new BadRequestException(
          `Entry ${idx}: must provide either userId or externalName`,
        );
      }
      if (!entry.clockIn) {
        throw new BadRequestException(`Entry ${idx}: clockIn is required`);
      }

      const clockIn = new Date(entry.clockIn);
      const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;
      const breakMinutes = entry.breakMinutes ?? 0;

      if (clockOut && clockOut <= clockIn) {
        throw new BadRequestException(
          `Entry ${idx}: clockOut must be after clockIn`,
        );
      }

      return {
        dailyLogId: logId,
        projectId,
        companyId: project.companyId,
        userId: entry.userId || null,
        externalName: entry.externalName || null,
        clockIn,
        clockOut,
        breakMinutes,
        hoursWorked: computeHoursWorked(clockIn, clockOut, breakMinutes),
        source: entry.source || "MANUAL",
        note: entry.note || null,
      };
    });

    const result = await this.prisma.timeEntry.createMany({
      data: createData,
    });

    // Fetch back the created entries
    const entries = await this.prisma.timeEntry.findMany({
      where: { dailyLogId: logId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { clockIn: "asc" },
    });

    return {
      created: result.count,
      entries,
    };
  }

  /**
   * PATCH /projects/:projectId/time-entries/:id
   *
   * Update a single time entry (clock times, break, note).
   * Auto-recalculates hoursWorked when clock times or break change.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Patch("time-entries/:id")
  async updateTimeEntry(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body() body: UpdateTimeEntryInput,
  ) {
    const user = req.user as AuthenticatedUser;

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id,
        projectId,
        project: { companyId: user.companyId },
      },
    });

    if (!entry) {
      throw new NotFoundException("Time entry not found");
    }

    const data: Record<string, any> = {};

    if (body.clockIn !== undefined) {
      data.clockIn = new Date(body.clockIn);
    }
    if (body.clockOut !== undefined) {
      data.clockOut = body.clockOut ? new Date(body.clockOut) : null;
    }
    if (body.breakMinutes !== undefined) {
      data.breakMinutes = body.breakMinutes;
    }
    if (body.note !== undefined) {
      data.note = body.note;
    }

    // Recalculate hoursWorked if any time field changed
    if (
      data.clockIn !== undefined ||
      data.clockOut !== undefined ||
      data.breakMinutes !== undefined
    ) {
      const clockIn = data.clockIn ?? entry.clockIn;
      const clockOut =
        data.clockOut !== undefined ? data.clockOut : entry.clockOut;
      const breakMinutes =
        data.breakMinutes !== undefined ? data.breakMinutes : entry.breakMinutes;
      data.hoursWorked = computeHoursWorked(clockIn, clockOut, breakMinutes);
    }

    // Allow explicit hoursWorked override
    if (body.hoursWorked !== undefined && data.hoursWorked === undefined) {
      data.hoursWorked =
        body.hoursWorked !== null ? new Decimal(body.hoursWorked.toFixed(2)) : null;
    }

    if (Object.keys(data).length === 0) {
      return { changed: false, entry };
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return { changed: true, entry: updated };
  }

  /**
   * GET /projects/:projectId/time-entries?date=YYYY-MM-DD&userId=xxx&logId=xxx
   *
   * Query time entries for a project.
   * Filterable by date, userId, or specific daily log.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get("time-entries")
  async getTimeEntries(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date?: string,
    @Query("userId") userId?: string,
    @Query("logId") logId?: string,
  ) {
    const user = req.user as AuthenticatedUser;

    // Verify project access
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const where: Record<string, any> = { projectId };

    if (date) {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      where.clockIn = { gte: dayStart, lte: dayEnd };
    }

    if (userId) {
      where.userId = userId;
    }

    if (logId) {
      where.dailyLogId = logId;
    }

    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        dailyLog: { select: { id: true, logDate: true, type: true, title: true } },
      },
      orderBy: [{ clockIn: "asc" }],
    });

    // Compute summary
    let totalHours = 0;
    let totalBreakMinutes = 0;
    for (const e of entries) {
      if (e.hoursWorked) {
        totalHours += Number(e.hoursWorked);
      }
      totalBreakMinutes += e.breakMinutes;
    }

    return {
      entries,
      summary: {
        count: entries.length,
        totalHours: Number(totalHours.toFixed(2)),
        totalBreakMinutes,
      },
    };
  }

  /**
   * DELETE /projects/:projectId/time-entries/:id
   *
   * Delete a single time entry. Admin+ or entry creator only.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Delete("time-entries/:id")
  async deleteTimeEntry(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Param("id") id: string,
  ) {
    const user = req.user as AuthenticatedUser;

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        id,
        projectId,
        project: { companyId: user.companyId },
      },
      include: {
        dailyLog: { select: { createdById: true } },
      },
    });

    if (!entry) {
      throw new NotFoundException("Time entry not found");
    }

    // Only log creator or Admin+ can delete
    const isCreator = entry.dailyLog.createdById === user.userId;
    const isAdmin = user.role === "OWNER" || user.role === "ADMIN";
    if (!isCreator && !isAdmin) {
      throw new ForbiddenException("You cannot delete this time entry");
    }

    await this.prisma.timeEntry.delete({ where: { id } });

    return { deleted: true };
  }
}
