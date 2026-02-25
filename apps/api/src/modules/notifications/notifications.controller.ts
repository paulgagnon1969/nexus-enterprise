import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, UseGuards, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { NotificationsService } from "./notifications.service";
import { PushService } from "./push.service";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listForMe(
    @Req() req: any,
    @Query("onlyUnread") onlyUnreadRaw?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    const onlyUnread = onlyUnreadRaw === "true" || onlyUnreadRaw === "1";
    return this.notifications.listForUser(actor, { onlyUnread });
  }

  @Patch(":id/read")
  async markAsRead(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    const updated = await this.notifications.markAsRead(actor, id);
    if (!updated) {
      return { ok: false, notFound: true };
    }
    return { ok: true, notification: updated };
  }

  // ── Device push token management ─────────────────────────────────

  @Post("devices/token")
  async registerPushToken(
    @Req() req: any,
    @Body() body: { token: string; platform: "IOS" | "ANDROID" },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body.token || !body.platform) {
      throw new BadRequestException("token and platform are required");
    }
    const record = await this.push.registerToken(actor.userId, body.token, body.platform);
    return { ok: true, device: record };
  }

  @Delete("devices/token")
  async deregisterPushToken(
    @Req() req: any,
    @Body() body: { token: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    if (!body.token) {
      throw new BadRequestException("token is required");
    }
    await this.push.deactivateToken(actor.userId, body.token);
    return { ok: true };
  }

  // ── Notification preferences ─────────────────────────────────────

  @Get("preferences")
  async getPreferences(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    const pref = await this.prisma.notificationPreference.findFirst({
      where: { userId: actor.userId, companyId: null, projectId: null },
    });
    // Return defaults if no preference record exists yet
    return pref ?? {
      dailyLogAlerts: true,
      incidentImmediate: true,
      progressDigest: "NONE",
      pollingCriteria: null,
      dailyBriefTime: "06:00",
      dailyBriefContent: null,
      dailyBriefSentDate: null,
      petlChangeAlerts: true,
      taskAlerts: true,
      scheduleAlerts: true,
      emailDigest: false,
    };
  }

  @Patch("preferences")
  async updatePreferences(
    @Req() req: any,
    @Body() body: {
      dailyLogAlerts?: boolean;
      incidentImmediate?: boolean;
      progressDigest?: "NONE" | "MORNING" | "EVENING" | "BOTH";
      pollingCriteria?: any;
      dailyBriefTime?: string;
      dailyBriefContent?: any;
      petlChangeAlerts?: boolean;
      taskAlerts?: boolean;
      scheduleAlerts?: boolean;
      emailDigest?: boolean;
    },
  ) {
    const actor = req.user as AuthenticatedUser;

    // Nullable composites don't work with Prisma upsert — use find + create/update
    const existing = await this.prisma.notificationPreference.findFirst({
      where: { userId: actor.userId, companyId: null, projectId: null },
    });

    const data = {
      ...(body.dailyLogAlerts !== undefined && { dailyLogAlerts: body.dailyLogAlerts }),
      ...(body.incidentImmediate !== undefined && { incidentImmediate: body.incidentImmediate }),
      ...(body.progressDigest !== undefined && { progressDigest: body.progressDigest as any }),
      ...(body.pollingCriteria !== undefined && { pollingCriteria: body.pollingCriteria }),
      ...(body.dailyBriefTime !== undefined && { dailyBriefTime: body.dailyBriefTime }),
      ...(body.dailyBriefContent !== undefined && { dailyBriefContent: body.dailyBriefContent }),
      ...(body.petlChangeAlerts !== undefined && { petlChangeAlerts: body.petlChangeAlerts }),
      ...(body.taskAlerts !== undefined && { taskAlerts: body.taskAlerts }),
      ...(body.scheduleAlerts !== undefined && { scheduleAlerts: body.scheduleAlerts }),
      ...(body.emailDigest !== undefined && { emailDigest: body.emailDigest }),
    };

    const pref = existing
      ? await this.prisma.notificationPreference.update({ where: { id: existing.id }, data })
      : await this.prisma.notificationPreference.create({
          data: {
            userId: actor.userId,
            dailyLogAlerts: body.dailyLogAlerts ?? true,
            incidentImmediate: body.incidentImmediate ?? true,
            progressDigest: (body.progressDigest as any) ?? "NONE",
            pollingCriteria: body.pollingCriteria ?? undefined,
            dailyBriefTime: body.dailyBriefTime ?? "06:00",
            dailyBriefContent: body.dailyBriefContent ?? undefined,
            petlChangeAlerts: body.petlChangeAlerts ?? true,
            taskAlerts: body.taskAlerts ?? true,
            scheduleAlerts: body.scheduleAlerts ?? true,
            emailDigest: body.emailDigest ?? false,
          },
        });

    return { ok: true, preferences: pref };
  }
}
