import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { CombinedAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  PROFILE_LEVELS,
  ROLE_LEVELS,
  getEffectiveRoleLevel,
} from "../auth/auth.guards";
import { Role } from "@prisma/client";
import { RequiresModule } from "../billing/module.guard";

// Minimum authority level
const MIN_CREW_LEVEL = PROFILE_LEVELS["FOREMAN"]; // 50
// Minimum level for superintendent approval.
const MIN_SUPER_LEVEL = PROFILE_LEVELS["SUPERINTENDENT"]; // 58
// Minimum level for payroll approval.
const MIN_PAYROLL_LEVEL = PROFILE_LEVELS["PM"]; // 60

interface EditEntryDto {
  timeIn?: string | null;
  timeOut?: string | null;
  stHours?: number;
  otHours?: number;
  dtHours?: number;
}

interface ApproveDto {
  notes?: string;
}

/**
 * Crew timecard endpoints — Foreman+ can view, edit, and approve
 * crew timecards for a project/date.
 */
@RequiresModule('TIMEKEEPING')
@Controller("timecard/crew")
export class TimecardCrewController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the effective authority level for the caller.
   */
  private getLevel(user: AuthenticatedUser): number {
    return getEffectiveRoleLevel({
      globalRole: user.globalRole as any,
      role: user.role as any,
      profileCode: user.profileCode,
    });
  }

  /**
   * Assert caller has at least `minLevel` authority.
   */
  private assertLevel(user: AuthenticatedUser, minLevel: number, action: string) {
    if (this.getLevel(user) < minLevel) {
      throw new ForbiddenException(
        `Insufficient authority for ${action}. Required level: ${minLevel}.`,
      );
    }
  }

  // ─── GET /timecard/crew ──────────────────────────────────────────
  // Foreman+ can view all entries for a project/date.
  @UseGuards(CombinedAuthGuard)
  @Get()
  async getCrewTimecard(
    @Req() req: any,
    @Query("projectId") projectId: string,
    @Query("date") dateStr: string,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertLevel(user, MIN_CREW_LEVEL, "view crew timecards");

    const companyId = user.companyId;

    // Validate project belongs to company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const d = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) throw new NotFoundException("Invalid date");

    const card = await (this.prisma as any).dailyTimecard.findFirst({
      where: { companyId, projectId, date: d },
      include: {
        entries: {
          include: {
            worker: {
              select: { id: true, firstName: true, lastName: true, fullName: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!card) {
      return {
        id: null,
        companyId,
        projectId,
        projectName: project.name,
        date: dateStr,
        entries: [],
        foremanStatus: null,
        superStatus: null,
        payrollStatus: null,
      };
    }

    return {
      id: card.id,
      companyId: card.companyId,
      projectId: card.projectId,
      projectName: project.name,
      date: dateStr,
      foremanStatus: card.foremanStatus,
      foremanUserId: card.foremanUserId,
      foremanApprovedAt: card.foremanApprovedAt?.toISOString() ?? null,
      foremanNotes: card.foremanNotes,
      superStatus: card.superStatus,
      superUserId: card.superUserId,
      superApprovedAt: card.superApprovedAt?.toISOString() ?? null,
      superNotes: card.superNotes,
      payrollStatus: card.payrollStatus,
      payrollUserId: card.payrollUserId,
      payrollApprovedAt: card.payrollApprovedAt?.toISOString() ?? null,
      payrollNotes: card.payrollNotes,
      entries: card.entries.map((e: any) => ({
        id: e.id,
        workerId: e.workerId,
        workerName: e.worker?.fullName ?? null,
        workerFirstName: e.worker?.firstName ?? null,
        workerLastName: e.worker?.lastName ?? null,
        locationCode: e.locationCode ?? null,
        stHours: e.stHours,
        otHours: e.otHours,
        dtHours: e.dtHours,
        timeIn: e.timeIn?.toISOString() ?? null,
        timeOut: e.timeOut?.toISOString() ?? null,
        totalHours: (e.stHours ?? 0) + (e.otHours ?? 0) + (e.dtHours ?? 0),
      })),
    };
  }

  // ─── PUT /timecard/crew/entries/:entryId ─────────────────────────
  // Foreman+ can edit a worker's time entry.
  @UseGuards(CombinedAuthGuard)
  @Put("entries/:entryId")
  async editEntry(
    @Req() req: any,
    @Param("entryId") entryId: string,
    @Body() body: EditEntryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertLevel(user, MIN_CREW_LEVEL, "edit crew time entries");

    const companyId = user.companyId;

    // Load the entry and its parent timecard
    const entry = await (this.prisma as any).dailyTimeEntry.findUnique({
      where: { id: entryId },
      include: {
        timecard: { select: { id: true, companyId: true, projectId: true, date: true } },
      },
    });

    if (!entry || entry.timecard.companyId !== companyId) {
      throw new NotFoundException("Time entry not found");
    }

    // Build update data
    const updateData: any = {};

    if (body.timeIn !== undefined) {
      updateData.timeIn = body.timeIn ? new Date(body.timeIn) : null;
    }
    if (body.timeOut !== undefined) {
      updateData.timeOut = body.timeOut ? new Date(body.timeOut) : null;
    }

    // If both timeIn and timeOut are resolved, recalculate hours
    const resolvedIn = updateData.timeIn !== undefined ? updateData.timeIn : entry.timeIn;
    const resolvedOut = updateData.timeOut !== undefined ? updateData.timeOut : entry.timeOut;

    if (resolvedIn && resolvedOut) {
      const diffMs = new Date(resolvedOut).getTime() - new Date(resolvedIn).getTime();
      const totalHours = Math.max(0, diffMs / 3600000);
      updateData.stHours = Math.min(totalHours, 8);
      updateData.otHours = Math.max(0, totalHours - 8);
    }

    // Manual hour overrides take precedence
    if (body.stHours !== undefined) updateData.stHours = body.stHours;
    if (body.otHours !== undefined) updateData.otHours = body.otHours;
    if (body.dtHours !== undefined) updateData.dtHours = body.dtHours;

    // Write audit log
    await (this.prisma as any).timecardEditLog.create({
      data: {
        companyId,
        projectId: entry.timecard.projectId,
        timecardId: entry.timecard.id,
        date: entry.timecard.date,
        oldWorkerId: entry.workerId,
        newWorkerId: entry.workerId,
        locationCode: entry.locationCode ?? null,
        oldStHours: entry.stHours ?? 0,
        oldOtHours: entry.otHours ?? 0,
        oldDtHours: entry.dtHours ?? 0,
        newStHours: updateData.stHours ?? entry.stHours ?? 0,
        newOtHours: updateData.otHours ?? entry.otHours ?? 0,
        newDtHours: updateData.dtHours ?? entry.dtHours ?? 0,
        editedByUserId: user.userId,
      },
    });

    // Apply update
    const updated = await (this.prisma as any).dailyTimeEntry.update({
      where: { id: entryId },
      data: updateData,
      include: {
        worker: {
          select: { id: true, firstName: true, lastName: true, fullName: true },
        },
      },
    });

    return {
      id: updated.id,
      workerId: updated.workerId,
      workerName: updated.worker?.fullName ?? null,
      locationCode: updated.locationCode ?? null,
      stHours: updated.stHours,
      otHours: updated.otHours,
      dtHours: updated.dtHours,
      timeIn: updated.timeIn?.toISOString() ?? null,
      timeOut: updated.timeOut?.toISOString() ?? null,
      totalHours: (updated.stHours ?? 0) + (updated.otHours ?? 0) + (updated.dtHours ?? 0),
    };
  }

  // ─── POST /timecard/crew/:timecardId/approve ─────────────────────
  // Foreman approves a day's timecard.
  @UseGuards(CombinedAuthGuard)
  @Post(":timecardId/approve")
  async foremanApprove(
    @Req() req: any,
    @Param("timecardId") timecardId: string,
    @Body() body: ApproveDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertLevel(user, MIN_CREW_LEVEL, "approve timecards");

    const card = await this.loadAndValidateCard(timecardId, user.companyId);

    const updated = await (this.prisma as any).dailyTimecard.update({
      where: { id: card.id },
      data: {
        foremanStatus: "APPROVED",
        foremanUserId: user.userId,
        foremanApprovedAt: new Date(),
        foremanNotes: body.notes ?? null,
      },
    });

    return this.formatApprovalResponse(updated);
  }

  // ─── POST /timecard/crew/:timecardId/reject ──────────────────────
  // Foreman rejects a day's timecard (sends back for correction).
  @UseGuards(CombinedAuthGuard)
  @Post(":timecardId/reject")
  async foremanReject(
    @Req() req: any,
    @Param("timecardId") timecardId: string,
    @Body() body: ApproveDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertLevel(user, MIN_CREW_LEVEL, "reject timecards");

    const card = await this.loadAndValidateCard(timecardId, user.companyId);

    const updated = await (this.prisma as any).dailyTimecard.update({
      where: { id: card.id },
      data: {
        foremanStatus: "REJECTED",
        foremanUserId: user.userId,
        foremanApprovedAt: new Date(),
        foremanNotes: body.notes ?? null,
      },
    });

    return this.formatApprovalResponse(updated);
  }

  // ─── POST /timecard/crew/:timecardId/super-approve ───────────────
  // Superintendent+ approves for payroll escalation.
  @UseGuards(CombinedAuthGuard)
  @Post(":timecardId/super-approve")
  async superApprove(
    @Req() req: any,
    @Param("timecardId") timecardId: string,
    @Body() body: ApproveDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertLevel(user, MIN_SUPER_LEVEL, "superintendent-approve timecards");

    const card = await this.loadAndValidateCard(timecardId, user.companyId);

    // Foreman must have approved first
    if (card.foremanStatus !== "APPROVED") {
      throw new ForbiddenException(
        "Timecard must be foreman-approved before superintendent approval.",
      );
    }

    const updated = await (this.prisma as any).dailyTimecard.update({
      where: { id: card.id },
      data: {
        superStatus: "APPROVED",
        superUserId: user.userId,
        superApprovedAt: new Date(),
        superNotes: body.notes ?? null,
      },
    });

    return this.formatApprovalResponse(updated);
  }

  // ─── POST /timecard/crew/:timecardId/payroll-approve ─────────────
  // PM+/ADMIN/OWNER approves for payroll processing.
  @UseGuards(CombinedAuthGuard)
  @Post(":timecardId/payroll-approve")
  async payrollApprove(
    @Req() req: any,
    @Param("timecardId") timecardId: string,
    @Body() body: ApproveDto,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertLevel(user, MIN_PAYROLL_LEVEL, "payroll-approve timecards");

    const card = await this.loadAndValidateCard(timecardId, user.companyId);

    // Super must have approved first
    if (card.superStatus !== "APPROVED") {
      throw new ForbiddenException(
        "Timecard must be superintendent-approved before payroll approval.",
      );
    }

    const updated = await (this.prisma as any).dailyTimecard.update({
      where: { id: card.id },
      data: {
        payrollStatus: "APPROVED",
        payrollUserId: user.userId,
        payrollApprovedAt: new Date(),
        payrollNotes: body.notes ?? null,
      },
    });

    return this.formatApprovalResponse(updated);
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private async loadAndValidateCard(timecardId: string, companyId: string) {
    const card = await (this.prisma as any).dailyTimecard.findUnique({
      where: { id: timecardId },
    });

    if (!card || card.companyId !== companyId) {
      throw new NotFoundException("Timecard not found");
    }

    return card;
  }

  private formatApprovalResponse(card: any) {
    return {
      id: card.id,
      foremanStatus: card.foremanStatus,
      foremanUserId: card.foremanUserId,
      foremanApprovedAt: card.foremanApprovedAt?.toISOString() ?? null,
      foremanNotes: card.foremanNotes,
      superStatus: card.superStatus,
      superUserId: card.superUserId,
      superApprovedAt: card.superApprovedAt?.toISOString() ?? null,
      superNotes: card.superNotes,
      payrollStatus: card.payrollStatus,
      payrollUserId: card.payrollUserId,
      payrollApprovedAt: card.payrollApprovedAt?.toISOString() ?? null,
      payrollNotes: card.payrollNotes,
    };
  }
}
