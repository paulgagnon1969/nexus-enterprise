import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import { PushService, PushPayload } from "./push.service";
import { EmailService } from "../../common/email.service";
import { $Enums, DailyLogType, TaskStatus } from "@prisma/client";

/** Tick every 10 minutes (same cadence as JSA reminders). */
const INTERVAL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BriefSection<T = any> {
  label: string;
  items: T[];
  count: number;
}

interface DailyBriefData {
  userId: string;
  projects: { id: string; name: string }[];
  lookback: {
    dailyLogs: BriefSection<{ projectName: string; type: string; title: string | null; logDate: Date }>;
    tasksCompleted: BriefSection<{ projectName: string; title: string }>;
    scheduleChanges: BriefSection<{ projectName: string; taskLabel: string; changeType: string }>;
    reconCases: BriefSection<{ projectName: string; status: string; description: string | null }>;
  };
  lookahead: {
    scheduleTasks: BriefSection<{ projectName: string; trade: string; phaseLabel: string; startDate: Date; endDate: Date }>;
    tasksDue: BriefSection<{ projectName: string; title: string; dueDate: Date | null }>;
    openItems: BriefSection<{ projectName: string; title: string; status: string }>;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DailyBriefService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyBriefService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    this.logger.log("Daily Brief scheduler started (every 10 min)");
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error(`Daily Brief tick failed: ${err?.message ?? err}`),
      );
    }, INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // ── Scheduler tick ──────────────────────────────────────────────────

  async tick() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayStart = new Date(`${todayStr}T00:00:00.000Z`);

    // Skip weekends
    const dayOfWeek = now.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    const currentHHmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

    // Find users who want a daily brief and haven't received one today
    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        progressDigest: { in: ["MORNING", "BOTH"] },
        OR: [
          { dailyBriefSentDate: null },
          { dailyBriefSentDate: { lt: dayStart } },
        ],
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (prefs.length === 0) return;

    for (const pref of prefs) {
      const briefTime = pref.dailyBriefTime || "06:00";

      // Not yet time for this user's brief
      if (currentHHmm < briefTime) continue;

      try {
        await this.generateAndDeliverBrief(pref.user, pref);
      } catch (err: any) {
        this.logger.error(
          `Daily Brief failed for user ${pref.userId}: ${err?.message ?? err}`,
        );
      }
    }
  }

  // ── Core: Generate + deliver one user's brief ─────────────────────

  async generateAndDeliverBrief(
    user: { id: string; email: string; firstName: string | null; lastName: string | null },
    pref: { id: string; userId: string; emailDigest: boolean; dailyBriefContent: any },
  ) {
    const now = new Date();
    const config = (pref.dailyBriefContent as any) ?? {};
    const lookbackDays = config.lookbackDays ?? 3;
    const lookaheadDays = config.lookaheadDays ?? 3;

    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);
    lookbackStart.setHours(0, 0, 0, 0);

    const lookaheadEnd = new Date(now);
    lookaheadEnd.setDate(lookaheadEnd.getDate() + lookaheadDays);
    lookaheadEnd.setHours(23, 59, 59, 999);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Get user's active projects
    const memberships = await this.prisma.projectMembership.findMany({
      where: { userId: user.id },
      include: { project: { select: { id: true, name: true, status: true } } },
    });

    const activeProjects = memberships
      .filter((m) => m.project && !["CLOSED", "ARCHIVED"].includes(String((m.project as any).status ?? "")))
      .map((m) => m.project);

    if (activeProjects.length === 0) {
      // No active projects — mark as sent and skip
      await this.markBriefSent(pref.id, now);
      return;
    }

    const projectIds = activeProjects.map((p) => p.id);
    const projectNameMap = new Map(activeProjects.map((p) => [p.id, p.name]));

    // ── LOOK-BACK ────────────────────────────────────────────────────

    // Daily logs in the last N days
    const recentLogs = await this.prisma.dailyLog.findMany({
      where: {
        projectId: { in: projectIds },
        createdAt: { gte: lookbackStart },
      },
      select: { projectId: true, type: true, title: true, logDate: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Tasks completed in the last N days
    const completedTasks = await this.prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        status: TaskStatus.DONE,
        updatedAt: { gte: lookbackStart },
      },
      select: { projectId: true, title: true },
      take: 30,
    });

    // Schedule changes in the last N days
    const scheduleChanges = await this.prisma.projectScheduleChangeLog.findMany({
      where: {
        projectId: { in: projectIds },
        createdAt: { gte: lookbackStart },
      },
      select: { projectId: true, taskSyntheticId: true, changeType: true },
      take: 30,
    });

    // Reconciliation cases opened/resolved in the last N days
    const reconCases = await this.prisma.petlReconciliationCase.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [
          { createdAt: { gte: lookbackStart } },
          { updatedAt: { gte: lookbackStart } },
        ],
      },
      select: {
        projectId: true,
        status: true,
        sowItem: { select: { description: true } },
      },
      take: 30,
    });

    // ── LOOK-AHEAD ───────────────────────────────────────────────────

    // Schedule tasks active or starting in the next N days
    const upcomingScheduleTasks = await this.prisma.projectScheduleTask.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [
          // Starting in lookahead window
          { startDate: { gte: todayStart, lte: lookaheadEnd } },
          // Ending in lookahead window (milestones approaching)
          { endDate: { gte: todayStart, lte: lookaheadEnd } },
          // Currently active (started before today, ending after today)
          { startDate: { lte: now }, endDate: { gte: todayStart } },
        ],
      },
      select: { projectId: true, trade: true, phaseLabel: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
      take: 50,
    });

    // Tasks due in the next N days
    const tasksDue = await this.prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        status: { not: TaskStatus.DONE },
        dueDate: { gte: todayStart, lte: lookaheadEnd },
      },
      select: { projectId: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 30,
    });

    // Open items requiring action (assigned to this user)
    const openItems = await this.prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: user.id,
        status: { not: TaskStatus.DONE },
      },
      select: { projectId: true, title: true, status: true },
      take: 30,
    });

    // ── Compose brief data ───────────────────────────────────────────

    const brief: DailyBriefData = {
      userId: user.id,
      projects: activeProjects.map((p) => ({ id: p.id, name: p.name })),
      lookback: {
        dailyLogs: {
          label: "Daily Logs",
          items: recentLogs.map((l) => ({
            projectName: projectNameMap.get(l.projectId) ?? "Unknown",
            type: l.type ?? "GENERAL",
            title: l.title,
            logDate: l.logDate,
          })),
          count: recentLogs.length,
        },
        tasksCompleted: {
          label: "Tasks Completed",
          items: completedTasks.map((t) => ({
            projectName: projectNameMap.get(t.projectId) ?? "Unknown",
            title: t.title,
          })),
          count: completedTasks.length,
        },
        scheduleChanges: {
          label: "Schedule Changes",
          items: scheduleChanges.map((c) => ({
            projectName: projectNameMap.get(c.projectId) ?? "Unknown",
            taskLabel: c.taskSyntheticId,
            changeType: c.changeType,
          })),
          count: scheduleChanges.length,
        },
        reconCases: {
          label: "Reconciliation Cases",
          items: reconCases.map((r) => ({
            projectName: projectNameMap.get(r.projectId) ?? "Unknown",
            status: r.status,
            description: r.sowItem?.description ?? null,
          })),
          count: reconCases.length,
        },
      },
      lookahead: {
        scheduleTasks: {
          label: "Schedule Tasks",
          items: upcomingScheduleTasks.map((t) => ({
            projectName: projectNameMap.get(t.projectId) ?? "Unknown",
            trade: t.trade,
            phaseLabel: t.phaseLabel,
            startDate: t.startDate,
            endDate: t.endDate,
          })),
          count: upcomingScheduleTasks.length,
        },
        tasksDue: {
          label: "Tasks Due",
          items: tasksDue.map((t) => ({
            projectName: projectNameMap.get(t.projectId) ?? "Unknown",
            title: t.title,
            dueDate: t.dueDate,
          })),
          count: tasksDue.length,
        },
        openItems: {
          label: "Open Items (Assigned to You)",
          items: openItems.map((t) => ({
            projectName: projectNameMap.get(t.projectId) ?? "Unknown",
            title: t.title,
            status: t.status,
          })),
          count: openItems.length,
        },
      },
    };

    // ── Build summary line ───────────────────────────────────────────

    const summaryParts: string[] = [];
    if (brief.lookback.dailyLogs.count > 0) summaryParts.push(`${brief.lookback.dailyLogs.count} log(s)`);
    if (brief.lookback.reconCases.count > 0) summaryParts.push(`${brief.lookback.reconCases.count} recon case(s)`);
    if (brief.lookahead.scheduleTasks.count > 0) summaryParts.push(`${brief.lookahead.scheduleTasks.count} scheduled task(s)`);
    if (brief.lookahead.tasksDue.count > 0) summaryParts.push(`${brief.lookahead.tasksDue.count} task(s) due`);
    if (brief.lookahead.openItems.count > 0) summaryParts.push(`${brief.lookahead.openItems.count} open item(s)`);

    const summaryLine = summaryParts.length > 0
      ? summaryParts.join(", ")
      : "No notable activity";

    const firstName = user.firstName || "there";

    // ── Deliver: In-App ──────────────────────────────────────────────

    await this.notifications.createNotification({
      userId: user.id,
      kind: $Enums.NotificationKind.DAILY_BRIEF,
      title: `Good morning, ${firstName}`,
      body: `Daily Brief: ${summaryLine}`,
      metadata: brief,
    });

    // ── Deliver: Push ────────────────────────────────────────────────

    const pushPayload: PushPayload = {
      title: `Daily Brief`,
      body: summaryLine,
      data: { type: "daily_brief" },
      sound: "default",
      channelId: "morning-brief",
    };

    await this.push.sendToUsers([user.id], pushPayload).catch((err) =>
      this.logger.warn(`Push failed for daily brief ${user.id}: ${err?.message ?? err}`),
    );

    // ── Deliver: Email (optional) ────────────────────────────────────

    if (pref.emailDigest && user.email) {
      try {
        await this.email.sendMail({
          to: [user.email],
          subject: `Daily Brief — ${new Date().toLocaleDateString()}`,
          html: this.buildEmailHtml(brief, firstName),
          text: `Daily Brief: ${summaryLine}`,
        });
      } catch (err: any) {
        this.logger.warn(`Email failed for daily brief ${user.id}: ${err?.message ?? err}`);
      }
    }

    // ── Mark as sent ─────────────────────────────────────────────────

    await this.markBriefSent(pref.id, now);

    this.logger.log(
      `Daily Brief sent to ${user.email}: ${summaryLine}`,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async markBriefSent(prefId: string, now: Date) {
    await this.prisma.notificationPreference.update({
      where: { id: prefId },
      data: { dailyBriefSentDate: now },
    });
  }

  private buildEmailHtml(brief: DailyBriefData, firstName: string): string {
    const dateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const sectionHtml = (title: string, items: { label: string }[], emptyMsg: string) => {
      if (items.length === 0) {
        return `<p style="color:#6b7280;font-size:13px;margin:4px 0;">${emptyMsg}</p>`;
      }
      return `<ul style="margin:4px 0 12px;padding-left:20px;font-size:13px;">
        ${items.slice(0, 10).map((i) => `<li>${escapeHtml(i.label)}</li>`).join("")}
        ${items.length > 10 ? `<li style="color:#6b7280;">… and ${items.length - 10} more</li>` : ""}
      </ul>`;
    };

    const lookbackLogs = brief.lookback.dailyLogs.items.map((l) => ({
      label: `${l.projectName} — ${l.type}${l.title ? `: ${l.title}` : ""}`,
    }));
    const lookbackTasks = brief.lookback.tasksCompleted.items.map((t) => ({
      label: `${t.projectName} — ${t.title}`,
    }));
    const lookbackRecon = brief.lookback.reconCases.items.map((r) => ({
      label: `${r.projectName} — ${r.status}${r.description ? `: ${r.description}` : ""}`,
    }));
    const aheadSchedule = brief.lookahead.scheduleTasks.items.map((t) => ({
      label: `${t.projectName} — ${t.phaseLabel} (${t.trade})`,
    }));
    const aheadTasks = brief.lookahead.tasksDue.items.map((t) => ({
      label: `${t.projectName} — ${t.title}`,
    }));
    const aheadOpen = brief.lookahead.openItems.items.map((t) => ({
      label: `${t.projectName} — ${t.title} [${t.status}]`,
    }));

    return `
<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:600px;margin:0 auto;line-height:1.5;">
  <h2 style="margin:0 0 4px;color:#1e293b;">Good morning, ${escapeHtml(firstName)}</h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${dateLabel}</p>

  <h3 style="margin:16px 0 4px;color:#0f172a;font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">
    📋 Last 3 Days
  </h3>

  <h4 style="margin:8px 0 2px;font-size:13px;color:#374151;">Daily Logs (${brief.lookback.dailyLogs.count})</h4>
  ${sectionHtml("Daily Logs", lookbackLogs, "No logs filed")}

  <h4 style="margin:8px 0 2px;font-size:13px;color:#374151;">Tasks Completed (${brief.lookback.tasksCompleted.count})</h4>
  ${sectionHtml("Tasks", lookbackTasks, "No tasks completed")}

  <h4 style="margin:8px 0 2px;font-size:13px;color:#374151;">Reconciliation Cases (${brief.lookback.reconCases.count})</h4>
  ${sectionHtml("Recon", lookbackRecon, "No reconciliation activity")}

  <h3 style="margin:20px 0 4px;color:#0f172a;font-size:15px;border-bottom:1px solid #e5