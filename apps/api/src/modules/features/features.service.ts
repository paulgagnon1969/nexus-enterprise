import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

/** Maximum login redirects per user per announcement before we stop redirecting. */
const MAX_REDIRECTS = 3;

/** Company roles that qualify for feature announcements ("Admin+"). */
const ADMIN_PLUS_ROLES = ["OWNER", "ADMIN"];

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
