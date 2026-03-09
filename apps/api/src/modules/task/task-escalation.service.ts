import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PushService } from "../notifications/push.service";
import { EmailService } from "../../common/email.service";
import { $Enums } from "@prisma/client";

/**
 * Tiered task escalation and persistent daily reminders.
 *
 * Escalation tiers:
 *   0 = none (just created)
 *   1 = assigned user notified (Level 1 — happens at task creation)
 *   2 = manager tier  (PM, Superintendent) — after 24h overdue
 *   3 = owner + admin (executive)          — after 48h overdue
 *
 * Cron cadence:
 *   - Every 15 minutes: check overdue tasks and escalate if thresholds met.
 *   - 8:00 AM daily: morning reminder for all overdue tasks.
 *   - 3:00 PM daily: afternoon reminder for all overdue tasks.
 *
 * Notifications are sent via: in-app, push (browser/mobile), and email.
 */

const ESCALATION_L2_MS = 24 * 60 * 60 * 1000; // 24 hours
const ESCALATION_L3_MS = 48 * 60 * 60 * 1000; // 48 hours
const REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000; // don't re-remind within 4h

@Injectable()
export class TaskEscalationService {
  private readonly logger = new Logger(TaskEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  // ── Every 15 minutes: escalate overdue tasks ──────────────────────
  @Cron("0 */15 * * * *")
  async handleEscalationCron() {
    try {
      await this.checkAndEscalateOverdueTasks();
    } catch (err: any) {
      this.logger.error(`Escalation cron failed: ${err?.message}`);
    }
  }

  // ── 8 AM daily: morning reminder ──────────────────────────────────
  @Cron("0 0 8 * * *")
  async handleMorningReminder() {
    try {
      await this.sendDailyReminders("morning");
    } catch (err: any) {
      this.logger.error(`Morning reminder failed: ${err?.message}`);
    }
  }

  // ── 3 PM daily: afternoon reminder ────────────────────────────────
  @Cron("0 0 15 * * *")
  async handleAfternoonReminder() {
    try {
      await this.sendDailyReminders("afternoon");
    } catch (err: any) {
      this.logger.error(`Afternoon reminder failed: ${err?.message}`);
    }
  }

  // ── On-demand: callable from controller ───────────────────────────
  async checkAndEscalateOverdueTasks() {
    const now = new Date();

    // Find tasks that are overdue (past dueDate, not DONE) and still below tier 3
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: now },
        escalationTier: { lt: 3 },
      },
      include: {
        project: {
          select: { id: true, name: true, teamTreeJson: true },
        },
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (overdueTasks.length === 0) return;

    this.logger.log(`Escalation check: ${overdueTasks.length} overdue task(s) found`);

    for (const task of overdueTasks) {
      try {
        await this.escalateTask(task, now);
      } catch (err: any) {
        this.logger.warn(`Escalation failed for task ${task.id}: ${err?.message}`);
      }
    }
  }

  private async escalateTask(task: any, now: Date) {
    const dueDate = new Date(task.dueDate);
    const overdueDuration = now.getTime() - dueDate.getTime();
    const currentTier = task.escalationTier ?? 0;

    let newTier = currentTier;

    if (overdueDuration >= ESCALATION_L3_MS && currentTier < 3) {
      newTier = 3;
    } else if (overdueDuration >= ESCALATION_L2_MS && currentTier < 2) {
      newTier = 2;
    }

    if (newTier <= currentTier) return; // No escalation needed

    // Update tier
    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        escalationTier: newTier,
        escalatedAt: now,
      },
    });

    const project = task.project;
    const teamTree = (project?.teamTreeJson ?? {}) as Record<string, string | string[]>;

    const title = `⚠️ Task overdue — Level ${newTier} escalation`;
    const body =
      `Task "${task.title}" on project ${project?.name ?? "Unknown"} is overdue.\n` +
      `Due: ${dueDate.toLocaleDateString()}\n` +
      `Escalation Level: ${newTier}${newTier === 3 ? " — Owner/Admin attention required" : ""}`;

    // Determine who to notify based on tier
    const userIds = new Set<string>();

    if (newTier >= 2) {
      // L2: PM, Superintendent, Foreman
      for (const role of ["PM", "SUPERINTENDENT", "FOREMAN"]) {
        const ids = teamTree[role];
        if (typeof ids === "string") userIds.add(ids);
        else if (Array.isArray(ids)) ids.forEach((id) => userIds.add(id));
      }
    }

    if (newTier >= 3) {
      // L3: Owner and Admin — fetch from CompanyMembership
      const admins = await this.prisma.companyMembership.findMany({
        where: {
          companyId: task.companyId,
          role: { in: ["OWNER", "ADMIN"] },
        },
        select: { userId: true },
      });
      admins.forEach((a) => userIds.add(a.userId));

      // Also include team tree OWNER if set
      const ownerIds = teamTree["OWNER"];
      if (typeof ownerIds === "string") userIds.add(ownerIds);
      else if (Array.isArray(ownerIds)) ownerIds.forEach((id) => userIds.add(id));
    }

    // Always include the assignee
    if (task.assigneeId) userIds.add(task.assigneeId);

    await this.notifyUsers(Array.from(userIds), task, title, body);

    this.logger.log(`Task ${task.id} escalated from L${currentTier} → L${newTier} (${userIds.size} user(s) notified)`);
  }

  /**
   * Send persistent daily reminders for all overdue tasks.
   * Each user who has overdue tasks (assigned to them or within their management scope)
   * gets a consolidated reminder.
   */
  async sendDailyReminders(period: "morning" | "afternoon") {
    const now = new Date();

    // All overdue, non-DONE tasks
    const overdueTasks = await this.prisma.task.findMany({
      where: {
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
      include: {
        project: {
          select: { id: true, name: true, teamTreeJson: true },
        },
        assignee: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (overdueTasks.length === 0) return;

    // Group tasks by assignee for individual reminders
    const tasksByUser = new Map<string, typeof overdueTasks>();
    for (const task of overdueTasks) {
      if (!task.assigneeId) continue;

      // Skip if we already reminded recently (cooldown)
      if (
        task.lastReminderAt &&
        now.getTime() - new Date(task.lastReminderAt).getTime() < REMINDER_COOLDOWN_MS
      ) {
        continue;
      }

      const existing = tasksByUser.get(task.assigneeId) ?? [];
      existing.push(task);
      tasksByUser.set(task.assigneeId, existing);
    }

    for (const [userId, tasks] of tasksByUser) {
      try {
        const assignee = tasks[0]?.assignee;
        const name = assignee
          ? [assignee.firstName, assignee.lastName].filter(Boolean).join(" ") || assignee.email
          : "Team Member";

        const taskLines = tasks
          .slice(0, 10)
          .map((t) => `• ${t.title} (${t.project?.name ?? "—"}) — due ${new Date(t.dueDate!).toLocaleDateString()}`)
          .join("\n");

        const moreNote = tasks.length > 10 ? `\n...and ${tasks.length - 10} more` : "";

        const title =
          period === "morning"
            ? `🌅 Good morning — ${tasks.length} overdue task(s) need attention`
            : `⏰ Afternoon check-in — ${tasks.length} overdue task(s) still pending`;

        const body = `${taskLines}${moreNote}\n\nThis task is overdue, prompt action needed.`;

        // In-app notification
        await this.notifications.createNotification({
          userId,
          companyId: tasks[0]?.companyId ?? null,
          projectId: tasks[0]?.projectId ?? null,
          kind: $Enums.NotificationKind.GENERIC,
          channel: $Enums.NotificationChannel.IN_APP,
          title,
          body,
          metadata: {
            type: "overdue_reminder",
            period,
            taskCount: tasks.length,
            taskIds: tasks.map((t) => t.id),
          },
        });

        // Push notification
        await this.push.sendToUsers([userId], {
          title,
          body: `${tasks.length} overdue task(s). Prompt action needed.`,
          data: {
            type: "overdue_reminder",
            period,
            taskCount: tasks.length,
          },
          sound: "default",
          categoryId: "overdue_reminder",
        });

        // Email reminder
        if (assignee?.email) {
          await this.email.sendMail({
            to: assignee.email,
            subject: title,
            html: this.buildReminderEmailHtml(name, tasks, period),
            text: `${title}\n\n${body}`,
          });
        }

        // Update lastReminderAt on all tasks
        const taskIds = tasks.map((t) => t.id);
        await this.prisma.task.updateMany({
          where: { id: { in: taskIds } },
          data: { lastReminderAt: now },
        });
      } catch (err: any) {
        this.logger.warn(`Daily reminder failed for user ${userId}: ${err?.message}`);
      }
    }

    this.logger.log(`${period} reminders: processed ${tasksByUser.size} user(s), ${overdueTasks.length} task(s)`);
  }

  /**
   * Multi-channel notify: in-app + push + email.
   */
  private async notifyUsers(userIds: string[], task: any, title: string, body: string) {
    const project = task.project;
    const companyId = task.companyId;

    for (const userId of userIds) {
      try {
        await this.notifications.createNotification({
          userId,
          companyId,
          projectId: project?.id ?? null,
          kind: $Enums.NotificationKind.GENERIC,
          channel: $Enums.NotificationChannel.IN_APP,
          title,
          body,
          metadata: {
            type: "task_escalation",
            taskId: task.id,
            escalationTier: task.escalationTier,
            projectId: project?.id,
          },
        });
      } catch (err: any) {
        this.logger.warn(`In-app notification failed for user ${userId}: ${err?.message}`);
      }
    }

    // Push to all users
    if (userIds.length > 0) {
      try {
        await this.push.sendToUsers(userIds, {
          title,
          body: `${task.title} — prompt action needed`,
          data: {
            type: "task_escalation",
            taskId: task.id,
            projectId: project?.id,
          },
          sound: "default",
          categoryId: "task_escalation",
        });
      } catch (err: any) {
        this.logger.warn(`Push notification failed: ${err?.message}`);
      }
    }

    // Email all users
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    for (const user of users) {
      if (!user.email) continue;
      try {
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
        await this.email.sendMail({
          to: user.email,
          subject: title,
          html: this.buildEscalationEmailHtml(name, task, project),
          text: body,
        });
      } catch (err: any) {
        this.logger.warn(`Escalation email failed for ${user.email}: ${err?.message}`);
      }
    }
  }

  private buildEscalationEmailHtml(
    recipientName: string,
    task: any,
    project: any,
  ): string {
    const tierLabel =
      task.escalationTier === 3
        ? "Level 3 — Owner/Admin"
        : task.escalationTier === 2
          ? "Level 2 — Manager"
          : "Level 1";

    const tierColor =
      task.escalationTier === 3
        ? "#dc2626"
        : task.escalationTier === 2
          ? "#d97706"
          : "#2563eb";

    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: ${tierColor}; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 18px;">⚠️ Overdue Task — ${tierLabel} Escalation</h1>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">Hello ${recipientName},</p>
          <p style="margin: 0 0 16px;">The following task requires your immediate attention:</p>
          <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin: 0 0 20px;">
            <h2 style="margin: 0 0 8px; font-size: 16px; color: #111827;">${escapeHtml(task.title)}</h2>
            <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">Project: ${escapeHtml(project?.name ?? "Unknown")}</p>
            <p style="margin: 0; font-size: 13px; color: #dc2626; font-weight: 600;">Due: ${new Date(task.dueDate).toLocaleDateString()}</p>
          </div>
          <p style="margin: 0 0 16px; font-weight: 600; color: #dc2626;">This task is overdue. Prompt action needed.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">This is an automated escalation from NEXUS. Log in to review and resolve this task.</p>
        </div>
      </div>
    `.trim();
  }

  private buildReminderEmailHtml(
    recipientName: string,
    tasks: any[],
    period: "morning" | "afternoon",
  ): string {
    const greeting = period === "morning" ? "Good morning" : "Good afternoon";

    const taskRows = tasks
      .slice(0, 10)
      .map(
        (t) =>
          `<tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px;">${escapeHtml(t.title)}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #6b7280;">${escapeHtml(t.project?.name ?? "—")}</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 13px; color: #dc2626;">${new Date(t.dueDate).toLocaleDateString()}</td>
          </tr>`,
      )
      .join("");

    const moreNote =
      tasks.length > 10
        ? `<p style="margin: 12px 0 0; font-size: 12px; color: #6b7280;">...and ${tasks.length - 10} more overdue task(s)</p>`
        : "";

    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; max-width: 600px;">
        <div style="background: #f59e0b; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 18px;">⏰ Overdue Tasks — Daily Reminder</h1>
        </div>
        <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px;">${greeting} ${escapeHtml(recipientName)},</p>
          <p style="margin: 0 0 16px;">You have <strong>${tasks.length}</strong> overdue task(s) that need attention:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 0 0 16px;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 6px 8px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Task</th>
                <th style="padding: 6px 8px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Project</th>
                <th style="padding: 6px 8px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Due Date</th>
              </tr>
            </thead>
            <tbody>${taskRows}</tbody>
          </table>
          ${moreNote}
          <p style="margin: 16px 0 0; font-weight: 600; color: #b45309;">This is a daily reminder. These tasks will persist until resolved.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="margin: 0; color: #9ca3af; font-size: 11px;">Automated reminder from NEXUS. Log in to resolve these tasks.</p>
        </div>
      </div>
    `.trim();
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
