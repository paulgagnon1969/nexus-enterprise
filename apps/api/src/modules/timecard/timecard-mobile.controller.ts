import { Controller, Get, Post, Body, UseGuards, Req, NotFoundException } from "@nestjs/common";
import { CombinedAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";

interface ClockInDto {
  projectId: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  locationCode?: string;
}

interface ClockOutDto {
  projectId: string;
  timestamp?: string;
  clockedInAt?: string;
  latitude?: number;
  longitude?: number;
}

interface ClockStatus {
  isClockedIn: boolean;
  currentEntry: any | null;
  projectId: string | null;
  projectName: string | null;
  clockedInAt: string | null;
}

interface RecentEntry {
  id: string;
  date: string;
  projectId: string;
  projectName: string | null;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: number;
}

@Controller("timecard/me")
export class TimecardMobileController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create a Worker record for this user (scoped by naming convention)
   */
  private async getOrCreateWorkerForUser(userId: string): Promise<{ id: string }> {
    const userRecord = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!userRecord) {
      throw new NotFoundException("User not found");
    }

    const fullName = `${userRecord.firstName ?? ""} ${userRecord.lastName ?? ""}`.trim() || `User-${userId.slice(0, 8)}`;

    // Try to find existing worker by fullName
    let worker = await this.prisma.worker.findUnique({
      where: { fullName },
      select: { id: true },
    });

    if (!worker) {
      // Create worker for this user
      worker = await this.prisma.worker.create({
        data: {
          firstName: userRecord.firstName ?? "Unknown",
          lastName: userRecord.lastName ?? "User",
          fullName,
          email: userRecord.email,
          status: "ACTIVE",
        },
        select: { id: true },
      });
    }

    return worker;
  }

  /**
   * Get current clock-in status for the authenticated user
   */
  @UseGuards(CombinedAuthGuard)
  @Get("status")
  async getStatus(@Req() req: any): Promise<ClockStatus> {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    const userId = user.userId;

    // Find user's worker record (if they have one)
    const worker = await this.getOrCreateWorkerForUser(userId).catch(() => null);

    if (!worker) {
      return {
        isClockedIn: false,
        currentEntry: null,
        projectId: null,
        projectName: null,
        clockedInAt: null,
      };
    }

    // Find any entry from today with timeIn but no timeOut
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openEntry = await (this.prisma as any).dailyTimeEntry.findFirst({
      where: {
        workerId: worker.id,
        timeIn: { not: null },
        timeOut: null,
        timecard: {
          date: { gte: today },
          companyId,
        },
      },
      include: {
        timecard: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { timeIn: "desc" },
    });

    if (!openEntry) {
      return {
        isClockedIn: false,
        currentEntry: null,
        projectId: null,
        projectName: null,
        clockedInAt: null,
      };
    }

    return {
      isClockedIn: true,
      currentEntry: {
        id: openEntry.id,
        workerId: openEntry.workerId,
        timeIn: openEntry.timeIn?.toISOString() ?? null,
        timeOut: null,
        stHours: openEntry.stHours,
        otHours: openEntry.otHours,
        dtHours: openEntry.dtHours,
      },
      projectId: openEntry.timecard?.project?.id ?? null,
      projectName: openEntry.timecard?.project?.name ?? null,
      clockedInAt: openEntry.timeIn?.toISOString() ?? null,
    };
  }

  /**
   * Clock in to a project
   */
  @UseGuards(CombinedAuthGuard)
  @Post("clock-in")
  async clockIn(@Req() req: any, @Body() body: ClockInDto): Promise<ClockStatus> {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    const userId = user.userId;

    // Find or create worker record
    const worker = await this.getOrCreateWorkerForUser(userId);

    // Verify project exists
    const project = await this.prisma.project.findFirst({
      where: { id: body.projectId, companyId },
      select: { id: true, name: true },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const clockInTime = body.timestamp ? new Date(body.timestamp) : new Date();
    const dateOnly = new Date(clockInTime);
    dateOnly.setHours(0, 0, 0, 0);

    // Upsert daily timecard for this project/date
    const timecard = await (this.prisma as any).dailyTimecard.upsert({
      where: {
        DailyTimecard_company_project_date_key: {
          companyId,
          projectId: body.projectId,
          date: dateOnly,
        },
      },
      update: {},
      create: {
        companyId,
        projectId: body.projectId,
        date: dateOnly,
        createdByUserId: userId,
      },
    });

    // Create time entry with timeIn
    const entry = await (this.prisma as any).dailyTimeEntry.create({
      data: {
        timecardId: timecard.id,
        workerId: worker.id,
        timeIn: clockInTime,
        locationCode: body.locationCode ?? null,
        stHours: 0,
        otHours: 0,
        dtHours: 0,
      },
    });

    return {
      isClockedIn: true,
      currentEntry: {
        id: entry.id,
        workerId: entry.workerId,
        timeIn: entry.timeIn?.toISOString() ?? null,
        timeOut: null,
        stHours: 0,
        otHours: 0,
        dtHours: 0,
      },
      projectId: project.id,
      projectName: project.name,
      clockedInAt: clockInTime.toISOString(),
    };
  }

  /**
   * Clock out from current shift
   */
  @UseGuards(CombinedAuthGuard)
  @Post("clock-out")
  async clockOut(@Req() req: any, @Body() body: ClockOutDto): Promise<ClockStatus> {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    const userId = user.userId;

    const worker = await this.getOrCreateWorkerForUser(userId);

    // Find the open entry
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openEntry = await (this.prisma as any).dailyTimeEntry.findFirst({
      where: {
        workerId: worker.id,
        timeIn: { not: null },
        timeOut: null,
        timecard: {
          companyId,
          projectId: body.projectId,
          date: { gte: today },
        },
      },
      orderBy: { timeIn: "desc" },
    });

    if (!openEntry) {
      throw new NotFoundException("No open time entry found");
    }

    const clockOutTime = body.timestamp ? new Date(body.timestamp) : new Date();
    const timeInDate = new Date(openEntry.timeIn);
    const diffMs = clockOutTime.getTime() - timeInDate.getTime();
    const totalHours = Math.max(0, diffMs / 3600000);

    // Calculate ST/OT (simple: first 8 hours ST, rest OT)
    const stHours = Math.min(totalHours, 8);
    const otHours = Math.max(0, totalHours - 8);

    // Update the entry with timeOut and calculated hours
    await (this.prisma as any).dailyTimeEntry.update({
      where: { id: openEntry.id },
      data: {
        timeOut: clockOutTime,
        stHours,
        otHours,
      },
    });

    return {
      isClockedIn: false,
      currentEntry: null,
      projectId: null,
      projectName: null,
      clockedInAt: null,
    };
  }

  /**
   * Get recent time entries for the user (last 14 days)
   */
  @UseGuards(CombinedAuthGuard)
  @Get("recent")
  async getRecent(@Req() req: any): Promise<RecentEntry[]> {
    const user = req.user as AuthenticatedUser;
    const companyId = user.companyId;
    const userId = user.userId;

    const worker = await this.getOrCreateWorkerForUser(userId).catch(() => null);

    if (!worker) {
      return [];
    }

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    twoWeeksAgo.setHours(0, 0, 0, 0);

    const entries = await (this.prisma as any).dailyTimeEntry.findMany({
      where: {
        workerId: worker.id,
        timecard: {
          companyId,
          date: { gte: twoWeeksAgo },
        },
      },
      include: {
        timecard: {
          include: {
            project: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { timeIn: "desc" },
      take: 50,
    });

    return entries.map((e: any) => ({
      id: e.id,
      date: e.timecard?.date?.toISOString()?.slice(0, 10) ?? "",
      projectId: e.timecard?.project?.id ?? "",
      projectName: e.timecard?.project?.name ?? null,
      timeIn: e.timeIn?.toISOString() ?? null,
      timeOut: e.timeOut?.toISOString() ?? null,
      totalHours: (e.stHours ?? 0) + (e.otHours ?? 0) + (e.dtHours ?? 0),
    }));
  }
}
