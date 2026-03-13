import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../../common/email.service";
import { $Enums } from "@prisma/client";

/** Maximum login redirects per user per announcement before we stop redirecting. */
const MAX_REDIRECTS = 3;

/** Company roles that qualify for feature announcements ("Admin+"). */
const ADMIN_PLUS_ROLES = ["OWNER", "ADMIN"];

@Injectable()
export class FeaturesService {
  private readonly logger = new Logger(FeaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  /**
   * Return all active announcements with the authenticated user's view status.
   * Used by the /whats-new page.
   */
  async getAnnouncementsForUser(userId: string, role: string) {
    const announcements = await this.prisma.featureAnnouncement.findMany({
      where: {
        active: true,
        targetRoles: { hasSome: [role] },
      },
      orderBy: [{ sortOrder: "asc" }, { launchedAt: "desc" }],
      include: {
        views: {
          where: { userId },
        },
      },
    });

    return announcements.map((a) => {
      const view = a.views[0] ?? null;
      return {
        id: a.id,
        moduleCode: a.moduleCode,
        camId: a.camId,
        title: a.title,
        description: a.description,
        ctaLabel: a.ctaLabel,
        ctaUrl: a.ctaUrl,
        launchedAt: a.launchedAt,
        highlightUntil: a.highlightUntil,
        sortOrder: a.sortOrder,
        seen: !!view,
        acknowledged: !!view?.acknowledgedAt,
        firstSeenAt: view?.firstSeenAt ?? null,
        acknowledgedAt: view?.acknowledgedAt ?? null,
      };
    });
  }

  /**
   * Called at login time for Admin+ users to determine whether we should
   * redirect them to /whats-new.
   */
  async getLoginRedirectInfo(userId: string, role: string) {
    if (!ADMIN_PLUS_ROLES.includes(role)) {
      return { unseenFeatures: 0, featureRedirect: false };
    }

    // Find active announcements this user has NOT acknowledged AND whose
    // redirect count is below the threshold.
    const announcements = await this.prisma.featureAnnouncement.findMany({
      where: {
        active: true,
        targetRoles: { hasSome: [role] },
      },
      include: {
        views: {
          where: { userId },
        },
      },
    });

    let unseen = 0;
    let shouldRedirect = false;

    for (const a of announcements) {
      const view = a.views[0];
      if (!view) {
        // Never seen at all
        unseen++;
        shouldRedirect = true;
      } else if (!view.acknowledgedAt && view.redirectCount < MAX_REDIRECTS) {
        // Seen but not acknowledged, and under redirect cap
        unseen++;
        shouldRedirect = true;
      }
    }

    return { unseenFeatures: unseen, featureRedirect: shouldRedirect };
  }

  /**
   * Record that a user was redirected to /whats-new at login.
   * Creates views for any unseen announcements and increments redirect counts.
   */
  async recordRedirect(userId: string, role: string) {
    const announcements = await this.prisma.featureAnnouncement.findMany({
      where: {
        active: true,
        targetRoles: { hasSome: [role] },
      },
    });

    for (const a of announcements) {
      await this.prisma.userFeatureView.upsert({
        where: {
          UserFeatureView_user_announcement_key: {
            userId,
            announcementId: a.id,
          },
        },
        create: {
          userId,
          announcementId: a.id,
          redirectCount: 1,
        },
        update: {
          redirectCount: { increment: 1 },
        },
      });
    }
  }

  /**
   * Mark a specific announcement as acknowledged ("Got it" clicked).
   */
  async acknowledge(userId: string, announcementId: string) {
    await this.prisma.userFeatureView.upsert({
      where: {
        UserFeatureView_user_announcement_key: {
          userId,
          announcementId,
        },
      },
      create: {
        userId,
        announcementId,
        acknowledgedAt: new Date(),
      },
      update: {
        acknowledgedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Mark that the user enabled a module after seeing the announcement.
   * (For analytics / future "conversion" tracking.)
   */
  async markModuleEnabled(userId: string, announcementId: string) {
    await this.prisma.userFeatureView.updateMany({
      where: { userId, announcementId },
      data: { enabledModule: true },
    });
    return { success: true };
  }

  /**
   * Broadcast a new module announcement to all Admin/Owner users.
   * Creates a FeatureAnnouncement, in-app notifications, and sends emails.
   */
  async broadcastNewModule(params: {
    moduleCode?: string;
    camId?: string;
    title: string;
    description: string;
    ctaLabel?: string;
    ctaUrl?: string;
    summaryBullets: string[];
  }) {
    // 1. Create the FeatureAnnouncement record (populates /whats-new)
    const announcement = await this.prisma.featureAnnouncement.create({
      data: {
        moduleCode: params.moduleCode ?? null,
        camId: params.camId ?? null,
        title: params.title,
        description: params.description,
        ctaLabel: params.ctaLabel ?? "Learn More",
        ctaUrl: params.ctaUrl ?? "/whats-new",
        targetRoles: ["OWNER", "ADMIN"],
        active: true,
        sortOrder: 0,
      },
    });

    // 2. Find all Admin/Owner users across all active companies
    const adminMembers = await this.prisma.companyMembership.findMany({
      where: {
        role: { in: ["OWNER", "ADMIN"] },
        isActive: true,
        company: { deletedAt: null },
      },
      select: {
        userId: true,
        companyId: true,
        user: { select: { id: true, email: true, firstName: true } },
      },
    });

    // De-duplicate by userId (a user may be admin in multiple companies)
    const seen = new Set<string>();
    const uniqueAdmins: typeof adminMembers = [];
    for (const m of adminMembers) {
      if (!seen.has(m.userId)) {
        seen.add(m.userId);
        uniqueAdmins.push(m);
      }
    }

    this.logger.log(
      `Broadcasting "${params.title}" to ${uniqueAdmins.length} admin/owner users`,
    );

    // 3. Create in-app notifications + send emails (fire-and-forget per user)
    let emailsSent = 0;
    let notificationsCreated = 0;

    for (const member of uniqueAdmins) {
      // In-app notification
      try {
        await this.notifications.createNotification({
          userId: member.userId,
          companyId: member.companyId,
          kind: $Enums.NotificationKind.NEW_MODULE,
          channel: $Enums.NotificationChannel.IN_APP,
          title: `New Module: ${params.title}`,
          body: params.description,
          metadata: {
            announcementId: announcement.id,
            moduleCode: params.moduleCode,
            ctaUrl: params.ctaUrl,
          },
        });
        notificationsCreated++;
      } catch (err) {
        this.logger.warn(`Failed to create notification for user ${member.userId}: ${err}`);
      }

      // Email
      try {
        await this.email.sendNewModuleAnnouncement({
          toEmail: member.user.email,
          recipientName: member.user.firstName || undefined,
          moduleName: params.title,
          summaryBullets: params.summaryBullets,
          ctaUrl: params.ctaUrl || "https://staging-ncc.nfsgrp.com/whats-new",
          ctaLabel: params.ctaLabel,
        });
        emailsSent++;
      } catch (err) {
        this.logger.warn(`Failed to send email to ${member.user.email}: ${err}`);
      }
    }

    return {
      success: true,
      announcementId: announcement.id,
      recipientCount: uniqueAdmins.length,
      notificationsCreated,
      emailsSent,
    };
  }
}
