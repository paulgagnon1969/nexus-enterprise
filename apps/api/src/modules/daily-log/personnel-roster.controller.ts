import {
  Controller,
  Get,
  Put,
  Patch,
  Param,
  Query,
  Req,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CombinedAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { DailyLogType } from "@prisma/client";

interface PersonnelEntry {
  type: "user" | "external";
  userId?: string | null;
  name: string;
  note?: string | null;
}

@Controller("projects/:projectId")
export class PersonnelRosterController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /projects/:projectId/personnel-roster
   *
   * Returns:
   * - favorites: saved project personnel favorites
   * - previouslyOnsite: distinct names from past daily logs with frequency
   * - companyUsers: all active company members
   * - latestRoster: personnel from the most recent daily log with personnel
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get("personnel-roster")
  async getRoster(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("search") search?: string,
  ) {
    const user = req.user as AuthenticatedUser;

    // 1. Project + favorites
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: {
        id: true,
        personnelFavoritesJson: true,
      },
    });

    if (!project) {
      return { favorites: [], previouslyOnsite: [], companyUsers: [], latestRoster: [] };
    }

    const favorites: PersonnelEntry[] = Array.isArray(project.personnelFavoritesJson)
      ? (project.personnelFavoritesJson as unknown as PersonnelEntry[])
      : [];

    // 2. Previously onsite — aggregate from personnelOnsiteJson + legacy personOnsite
    const logsWithPersonnel = await this.prisma.dailyLog.findMany({
      where: {
        projectId,
        project: { companyId: user.companyId },
        OR: [
          { personnelOnsiteJson: { not: null as any } },
          { personOnsite: { not: null } },
        ],
      },
      select: {
        personnelOnsiteJson: true,
        personOnsite: true,
      },
      orderBy: { logDate: "desc" },
      take: 200, // reasonable history window
    });

    const frequencyMap = new Map<string, { entry: PersonnelEntry; count: number }>();

    for (const log of logsWithPersonnel) {
      // Parse structured JSON
      if (log.personnelOnsiteJson && Array.isArray(log.personnelOnsiteJson)) {
        for (const p of log.personnelOnsiteJson as unknown as PersonnelEntry[]) {
          const key = p.userId || p.name.toLowerCase().trim();
          const existing = frequencyMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            frequencyMap.set(key, { entry: p, count: 1 });
          }
        }
      }
      // Parse legacy comma/semicolon string
      else if (log.personOnsite) {
        const names = log.personOnsite
          .split(/[;,]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        for (const name of names) {
          const key = name.toLowerCase();
          const existing = frequencyMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            frequencyMap.set(key, {
              entry: { type: "external", name },
              count: 1,
            });
          }
        }
      }
    }

    const previouslyOnsite = Array.from(frequencyMap.values())
      .sort((a, b) => b.count - a.count || a.entry.name.localeCompare(b.entry.name))
      .map((v) => ({ ...v.entry, count: v.count }));

    // 3. Company users
    const membershipWhere: any = {
      companyId: user.companyId,
      isActive: true,
    };

    const memberships = await this.prisma.companyMembership.findMany({
      where: membershipWhere,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    let companyUsers = memberships
      .filter((m) => m.user)
      .map((m) => ({
        userId: m.user.id,
        name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email,
        email: m.user.email,
        role: m.role,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Apply search filter
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      companyUsers = companyUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }

    // 4. Latest roster — most recent log with personnel on this project
    const latestLogWithPersonnel = await this.prisma.dailyLog.findFirst({
      where: {
        projectId,
        project: { companyId: user.companyId },
        personnelOnsiteJson: { not: null as any },
      },
      select: {
        id: true,
        logDate: true,
        personnelOnsiteJson: true,
        type: true,
      },
      orderBy: { logDate: "desc" },
    });

    const latestRoster: PersonnelEntry[] = latestLogWithPersonnel?.personnelOnsiteJson &&
      Array.isArray(latestLogWithPersonnel.personnelOnsiteJson)
        ? (latestLogWithPersonnel.personnelOnsiteJson as unknown as PersonnelEntry[])
        : [];

    return {
      favorites,
      previouslyOnsite,
      companyUsers,
      latestRoster,
      latestRosterLogId: latestLogWithPersonnel?.id ?? null,
      latestRosterLogDate: latestLogWithPersonnel?.logDate ?? null,
    };
  }

  /**
   * GET /projects/:projectId/personnel-for-date?date=YYYY-MM-DD
   *
   * Aggregates all distinct personnel from that day's logs on this project.
   * Used by TADL creation to pre-populate the time entry table.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get("personnel-for-date")
  async getPersonnelForDate(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${targetDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${targetDate}T23:59:59.999Z`);

    const logsToday = await this.prisma.dailyLog.findMany({
      where: {
        projectId,
        project: { companyId: user.companyId },
        logDate: { gte: dayStart, lte: dayEnd },
        personnelOnsiteJson: { not: null as any },
      },
      select: {
        id: true,
        type: true,
        logDate: true,
        createdAt: true,
        personnelOnsiteJson: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Aggregate unique personnel across all logs
    const personnelMap = new Map<string, PersonnelEntry>();
    for (const log of logsToday) {
      if (Array.isArray(log.personnelOnsiteJson)) {
        for (const p of log.personnelOnsiteJson as unknown as PersonnelEntry[]) {
          const key = p.userId || p.name.toLowerCase().trim();
          if (!personnelMap.has(key)) {
            personnelMap.set(key, p);
          }
        }
      }
    }

    return {
      date: targetDate,
      personnel: Array.from(personnelMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      logCount: logsToday.length,
      logs: logsToday.map((l) => ({
        id: l.id,
        type: l.type,
        createdAt: l.createdAt,
        personnelCount: Array.isArray(l.personnelOnsiteJson)
          ? (l.personnelOnsiteJson as any[]).length
          : 0,
      })),
    };
  }

  /**
   * PUT /projects/:projectId/personnel-favorites
   *
   * Saves the personnel favorites for the project. Super+ only.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Put("personnel-favorites")
  async savePersonnelFavorites(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() body: { favorites: PersonnelEntry[] },
  ) {
    const user = req.user as AuthenticatedUser;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: { id: true },
    });

    if (!project) {
      throw new ForbiddenException("Project not found");
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        personnelFavoritesJson: (body.favorites ?? []) as any,
      },
    });

    return { success: true, count: (body.favorites ?? []).length };
  }

  /**
   * GET /projects/:projectId/jsa-status?date=YYYY-MM-DD
   *
   * Returns whether a JSA has been filed today for this project,
   * plus the headcount from the most recent log with personnel.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get("jsa-status")
  async getJsaStatus(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${targetDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${targetDate}T23:59:59.999Z`);

    // Check for JSA
    const jsa = await this.prisma.dailyLog.findFirst({
      where: {
        projectId,
        project: { companyId: user.companyId },
        type: DailyLogType.JSA,
        logDate: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        personnelOnsiteJson: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Get headcount from most recent log with personnel today
    const latestWithPersonnel = await this.prisma.dailyLog.findFirst({
      where: {
        projectId,
        project: { companyId: user.companyId },
        logDate: { gte: dayStart, lte: dayEnd },
        personnelOnsiteJson: { not: null as any },
      },
      select: {
        personnelOnsiteJson: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const personnelCount = latestWithPersonnel?.personnelOnsiteJson &&
      Array.isArray(latestWithPersonnel.personnelOnsiteJson)
        ? (latestWithPersonnel.personnelOnsiteJson as any[]).length
        : null;

    return {
      hasJsa: !!jsa,
      jsaId: jsa?.id ?? null,
      jsaCreatedAt: jsa?.createdAt ?? null,
      jsaPersonnelCount: jsa?.personnelOnsiteJson && Array.isArray(jsa.personnelOnsiteJson)
        ? (jsa.personnelOnsiteJson as any[]).length
        : null,
      personnelCount,
    };
  }

  /**
   * GET /projects/:projectId/daily-log-settings
   *
   * Returns the JSA reminder and personnel settings for this project.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get("daily-log-settings")
  async getDailyLogSettings(
    @Req() req: any,
    @Param("projectId") projectId: string,
  ) {
    const user = req.user as AuthenticatedUser;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: {
        id: true,
        jsaReminderEnabled: true,
        jsaReminderTime: true,
        jsaReminderSentDate: true,
        personnelFavoritesJson: true,
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    return {
      jsaReminderEnabled: project.jsaReminderEnabled,
      jsaReminderTime: project.jsaReminderTime,
      jsaReminderSentDate: project.jsaReminderSentDate,
      personnelFavoritesCount: Array.isArray(project.personnelFavoritesJson)
        ? (project.personnelFavoritesJson as any[]).length
        : 0,
    };
  }

  /**
   * PATCH /projects/:projectId/daily-log-settings
   *
   * Updates JSA reminder settings. Admin+ only.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch("daily-log-settings")
  async updateDailyLogSettings(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      jsaReminderEnabled?: boolean;
      jsaReminderTime?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: user.companyId },
      select: { id: true },
    });

    if (!project) {
      throw new ForbiddenException("Project not found");
    }

    const data: Record<string, any> = {};
    if (body.jsaReminderEnabled !== undefined) {
      data.jsaReminderEnabled = body.jsaReminderEnabled;
    }
    if (body.jsaReminderTime !== undefined) {
      // Validate HH:mm format
      if (/^\d{2}:\d{2}$/.test(body.jsaReminderTime)) {
        data.jsaReminderTime = body.jsaReminderTime;
      }
    }

    if (Object.keys(data).length === 0) {
      return { success: true, changed: false };
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data,
    });

    return { success: true, changed: true };
  }

  /**
   * GET /projects/:projectId/jsa-roster?date=YYYY-MM-DD
   *
   * Returns the personnel roster from today's JSA (if one exists).
   * Used by non-JSA log creation to auto-populate personnelOnsiteJson.
   */
  @UseGuards(CombinedAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Get("jsa-roster")
  async getJsaRoster(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Query("date") date?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${targetDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${targetDate}T23:59:59.999Z`);

    const jsa = await this.prisma.dailyLog.findFirst({
      where: {
        projectId,
        project: { companyId: user.companyId },
        type: DailyLogType.JSA,
        logDate: { gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        personnelOnsiteJson: true,
        jsaSafetyJson: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!jsa) {
      return { hasJsa: false, jsaId: null, roster: [], jsaCreatedAt: null };
    }

    const roster: PersonnelEntry[] =
      jsa.personnelOnsiteJson && Array.isArray(jsa.personnelOnsiteJson)
        ? (jsa.personnelOnsiteJson as unknown as PersonnelEntry[])
        : [];

    return {
      hasJsa: true,
      jsaId: jsa.id,
      jsaCreatedAt: jsa.createdAt,
      roster,
    };
  }
}
