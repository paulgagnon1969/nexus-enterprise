import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../../common/email.service";
import { DailyLogType, $Enums } from "@prisma/client";

/**
 * Profile codes that should receive JSA reminder notifications.
 * Foreman, Superintendent, and PM.
 */
const JSA_NOTIFY_PROFILES = new Set(["FOREMAN", "SUPERINTENDENT", "PM"]);

/** 10 minutes in milliseconds */
const INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class JsaReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JsaReminderService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    this.logger.log("JSA reminder scheduler started (every 10 min)");
    this.intervalHandle = setInterval(() => {
      this.handleJsaReminders().catch((err) =>
        this.logger.error(`JSA reminder tick failed: ${err?.message ?? err}`),
      );
    }, INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * For each active project with JSA reminders enabled:
   * 1. Is the current time >= jsaReminderTime (default 09:00)?
   * 2. Has a JSA been filed today?
   * 3. Has a reminder already been sent today?
   * If no JSA and no reminder → send in-app + email to Foreman/Super/PM.
   */
  async handleJsaReminders() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${todayStr}T23:59:59.999Z`);

    // Only check Mon-Fri (0=Sun, 6=Sat)
    const dayOfWeek = now.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return;

    try {
      // Find projects with JSA reminders enabled that haven't been sent today
      const projects = await this.prisma.project.findMany({
        where: {
          jsaReminderEnabled: true,
          status: { notIn: ["CLOSED", "ARCHIVED"] as any[] },
          OR: [
            { jsaReminderSentDate: null },
            { jsaReminderSentDate: { lt: dayStart } },
          ],
        },
        select: {
          id: true,
          name: true,
          companyId: true,
          jsaReminderTime: true,
        },
      });

      if (projects.length === 0) return;

      // Current time in HH:mm (UTC — good enough for now; future: use project TZ)
      const currentHHmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

      for (const project of projects) {
        const reminderTime = project.jsaReminderTime || "09:00";

        // Skip if we haven't reached the reminder time yet
        if (currentHHmm < reminderTime) continue;

        // Check if a JSA exists for today on this project
        const jsaToday = await this.prisma.dailyLog.findFirst({
          where: {
            projectId: project.id,
            type: DailyLogType.JSA,
            logDate: { gte: dayStart, lte: dayEnd },
          },
          select: { id: true },
        });

        if (jsaToday) continue; // JSA already filed — no reminder needed

        // Find recipients: project members with Foreman/Super/PM profiles
        const memberships = await this.prisma.projectMembership.findMany({
          where: { projectId: project.id },
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

        // Also get company memberships to check profile codes
        const companyMemberships = await this.prisma.companyMembership.findMany({
          where: {
            companyId: project.companyId,
            userId: { in: memberships.map((m) => m.userId) },
            isActive: true,
          },
          select: {
            userId: true,
            role: true,
            profile: { select: { code: true } },
          },
        });

        const profileByUserId = new Map<string, string | null>();
        for (const cm of companyMemberships) {
          profileByUserId.set(cm.userId, cm.profile?.code ?? null);
        }

        const recipients = memberships.filter((m) => {
          const profile = profileByUserId.get(m.userId);
          return profile && JSA_NOTIFY_PROFILES.has(profile);
        });

        if (recipients.length === 0) {
          // No one to notify; still mark as sent to avoid retrying
          await this.prisma.project.update({
            where: { id: project.id },
            data: { jsaReminderSentDate: now },
          });
          continue;
        }

        // Send in-app notifications
        for (const r of recipients) {
          try {
            await this.notifications.createNotification({
              userId: r.userId,
              companyId: project.companyId,
              projectId: project.id,
              kind: $Enums.NotificationKind.GENERIC,
              title: "⚠️ JSA Not Filed",
              body: `No Job Safety Assessment has been filed today for ${project.name}. Please complete a JSA before work begins.`,
              metadata: { type: "JSA_REMINDER", projectId: project.id },
            });
          } catch (err: any) {
            this.logger.warn(
              `Failed to create JSA reminder notification for user ${r.userId}: ${err?.message}`,
            );
          }
        }

        // Send email notifications
        const emailRecipients = recipients
          .filter((r) => r.user?.email)
          .map((r) => r.user!.email);

        if (emailRecipients.length > 0) {
          try {
            await this.email.sendMail({
              to: emailRecipients,
              subject: `⚠️ JSA Not Filed — ${project.name}`,
              html: `
                <div style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5;">
                  <h2 style="margin: 0 0 8px; color: #b45309;">⚠️ JSA Reminder</h2>
                  <p style="margin: 0 0 8px;">No <strong>Job Safety Assessment</strong> has been filed today for:</p>
                  <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600;">${escapeHtml(project.name)}</p>
                  <p style="margin: 0 0 8px;">Please log in to Nexus and complete a JSA before work begins.</p>
                  <p style="margin: 0; color: #6b7280; font-size: 12px;">
                    This is an automated reminder. Reminder time: ${reminderTime}.
                  </p>
                </div>
              `.trim(),
              text: `JSA Reminder: No Job Safety Assessment filed today for ${project.name}. Please complete a JSA before work begins.`,
            });
          } catch (err: any) {
            this.logger.warn(
              `Failed to send JSA reminder email for project ${project.id}: ${err?.message}`,
            );
          }
        }

        // Mark reminder as sent
        await this.prisma.project.update({
          where: { id: project.id },
          data: { jsaReminderSentDate: now },
        });

        this.logger.log(
          `JSA reminder sent for project ${project.name} (${project.id}) to ${recipients.length} recipient(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(`JSA reminder job failed: ${err?.message ?? err}`);
    }
  }
}

/** Simple HTML-escaper */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
