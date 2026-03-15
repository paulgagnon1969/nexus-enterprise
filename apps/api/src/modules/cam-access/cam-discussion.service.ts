import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EmailService } from "../../common/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  CamAnnouncementPriority,
  CamThreadVisibility,
  NotificationKind,
  ShareDocumentType,
} from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  DTOs                                                               */
/* ------------------------------------------------------------------ */

export interface CreateThreadDto {
  camSection?: string; // e.g. "EST-SPD-0001" — pins to a specific CAM
  topicId?: string; // for manual-level or general discussion
  title: string;
  body: string;
}

export interface PostMessageDto {
  body: string;
}

export interface MoveThreadDto {
  newCamSection: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

@Injectable()
export class CamDiscussionService {
  private readonly logger = new Logger(CamDiscussionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ================================================================ */
  /*  Share-token validation helper                                    */
  /* ================================================================ */

  /**
   * Validate a share token has full access (CNDA + questionnaire),
   * and return the token record + resolved userId for the invitee.
   */
  private async validateViewerToken(token: string) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        revokedAt: true,
        inviteeEmail: true,
        inviteeName: true,
        inviteeUserId: true,
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("Invalid or expired access link.");
    }
    if (record.revokedAt) {
      throw new ForbiddenException("This access link has been revoked.");
    }
    if (!record.cndaAcceptedAt || !record.questionnaireCompletedAt) {
      throw new ForbiddenException(
        "You must complete the full access flow before participating in discussions.",
      );
    }

    // Resolve a userId for this viewer — needed for Prisma FK constraints.
    // If the invitee doesn't have a User record yet, create a lightweight one.
    let userId = record.inviteeUserId;
    if (!userId && record.inviteeEmail) {
      const existing = await this.prisma.user.findFirst({
        where: { email: record.inviteeEmail.toLowerCase() },
        select: { id: true },
      });
      if (existing) {
        userId = existing.id;
        // Backfill the token so we don't repeat this lookup
        await this.prisma.documentShareToken.update({
          where: { id: record.id },
          data: { inviteeUserId: userId },
        });
      }
    }

    if (!userId) {
      throw new ForbiddenException(
        "Unable to resolve your identity. Please contact the administrator.",
      );
    }

    return {
      tokenId: record.id,
      userId,
      email: record.inviteeEmail,
      name: record.inviteeName,
    };
  }

  /* ================================================================ */
  /*  Public — List threads for a CAM section or general               */
  /* ================================================================ */

  async listThreads(token: string, camSection?: string) {
    await this.validateViewerToken(token);

    const where: any = { visibility: CamThreadVisibility.PUBLIC };
    if (camSection) {
      where.camSection = camSection;
    } else {
      // General / manual-level: threads with no camSection
      where.camSection = null;
    }

    const threads = await this.prisma.camDiscussionThread.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      include: {
        _count: { select: { messages: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            body: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return threads.map((t) => ({
      id: t.id,
      camSection: t.camSection,
      title: t.title,
      isPinned: t.isPinned,
      isFaq: t.isFaq,
      messageCount: t._count.messages,
      createdBy: {
        id: t.createdBy.id,
        name:
          `${t.createdBy.firstName ?? ""} ${t.createdBy.lastName ?? ""}`.trim() ||
          t.createdBy.email,
      },
      lastMessage: t.messages[0]
        ? {
            preview: t.messages[0].body.slice(0, 200),
            authorName:
              `${t.messages[0].author.firstName ?? ""} ${t.messages[0].author.lastName ?? ""}`.trim(),
            createdAt: t.messages[0].createdAt,
          }
        : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  /* ================================================================ */
  /*  Public — Get thread detail with messages                         */
  /* ================================================================ */

  async getThread(token: string, threadId: string) {
    const viewer = await this.validateViewerToken(token);

    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        title: true,
        camSection: true,
        visibility: true,
        isPinned: true,
        isFaq: true,
        movedFromSection: true,
        movedAt: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!thread) throw new NotFoundException("Thread not found");
    if (thread.visibility !== CamThreadVisibility.PUBLIC) {
      throw new ForbiddenException("This thread is not accessible.");
    }

    const messages = await this.prisma.camDiscussionMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Mark thread as read for this viewer (upsert participant + set lastReadAt)
    const participant = await this.prisma.camDiscussionParticipant.upsert({
      where: {
        threadId_userId: { threadId, userId: viewer.userId },
      },
      create: { threadId, userId: viewer.userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });

    return {
      thread: {
        id: thread.id,
        title: thread.title,
        camSection: thread.camSection,
        isPinned: thread.isPinned,
        isFaq: thread.isFaq,
        movedFromSection: thread.movedFromSection,
        movedAt: thread.movedAt,
        createdBy: {
          id: thread.createdBy.id,
          name:
            `${thread.createdBy.firstName ?? ""} ${thread.createdBy.lastName ?? ""}`.trim() ||
            thread.createdBy.email,
        },
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        isSystemMessage: (m as any).isSystemMessage ?? false,
        author: {
          id: m.author.id,
          name:
            `${m.author.firstName ?? ""} ${m.author.lastName ?? ""}`.trim() ||
            m.author.email,
        },
        createdAt: m.createdAt,
      })),
      muted: participant?.muted ?? false,
    };
  }

  /* ================================================================ */
  /*  Public — Create thread                                           */
  /* ================================================================ */

  async createThread(token: string, dto: CreateThreadDto) {
    const viewer = await this.validateViewerToken(token);

    if (!dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException("Title and body are required.");
    }

    const thread = await this.prisma.camDiscussionThread.create({
      data: {
        camSection: dto.camSection ?? null,
        topicId: dto.topicId ?? null,
        title: dto.title.trim(),
        visibility: CamThreadVisibility.PUBLIC,
        createdById: viewer.userId,
        shareTokenId: viewer.tokenId,
        messages: {
          create: {
            authorId: viewer.userId,
            body: dto.body.trim(),
          },
        },
        participants: {
          create: { userId: viewer.userId },
        },
      },
      include: {
        messages: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    this.logger.log(
      `Discussion thread created: "${thread.title}" on ${dto.camSection ?? "general"} by ${viewer.email}`,
    );

    return thread;
  }

  /* ================================================================ */
  /*  Public — Post message + dispatch notifications                   */
  /* ================================================================ */

  async postMessage(token: string, threadId: string, dto: PostMessageDto) {
    const viewer = await this.validateViewerToken(token);

    if (!dto.body?.trim()) {
      throw new BadRequestException("Message body is required.");
    }

    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        title: true,
        camSection: true,
        visibility: true,
      },
    });

    if (!thread) throw new NotFoundException("Thread not found");
    if (thread.visibility !== CamThreadVisibility.PUBLIC) {
      throw new ForbiddenException("This thread is not accessible.");
    }

    const message = await this.prisma.camDiscussionMessage.create({
      data: {
        threadId,
        authorId: viewer.userId,
        body: dto.body.trim(),
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Touch thread updatedAt
    await this.prisma.camDiscussionThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    // Ensure poster is a participant
    await this.prisma.camDiscussionParticipant.upsert({
      where: {
        threadId_userId: { threadId, userId: viewer.userId },
      },
      create: { threadId, userId: viewer.userId },
      update: {},
    });

    // Fire-and-forget notification dispatch
    this.dispatchNotifications(
      threadId,
      thread.title,
      thread.camSection,
      viewer.userId,
      viewer.name ?? viewer.email ?? "Someone",
      dto.body.trim(),
    ).catch((err) =>
      this.logger.warn(`Notification dispatch failed: ${err?.message}`),
    );

    return {
      id: message.id,
      body: message.body,
      isSystemMessage: false,
      author: {
        id: message.author.id,
        name:
          `${message.author.firstName ?? ""} ${message.author.lastName ?? ""}`.trim() ||
          message.author.email,
      },
      createdAt: message.createdAt,
    };
  }

  /* ================================================================ */
  /*  Public — Toggle mute                                             */
  /* ================================================================ */

  async toggleMute(token: string, threadId: string) {
    const viewer = await this.validateViewerToken(token);

    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    // Upsert participant and toggle muted
    const existing = await this.prisma.camDiscussionParticipant.findUnique({
      where: {
        threadId_userId: { threadId, userId: viewer.userId },
      },
    });

    if (existing) {
      const updated = await this.prisma.camDiscussionParticipant.update({
        where: { id: existing.id },
        data: { muted: !existing.muted },
      });
      return { muted: updated.muted };
    }

    // First interaction — create as muted (they're explicitly opting out)
    await this.prisma.camDiscussionParticipant.create({
      data: { threadId, userId: viewer.userId, muted: true },
    });
    return { muted: true };
  }

  /* ================================================================ */
  /*  Public — Unread counts per CAM section                           */
  /* ================================================================ */

  /**
   * Returns { [camSection: string]: number } — count of unread messages
   * per CAM section for this viewer. A message is "unread" if it was created
   * after the viewer's lastReadAt on that thread (or all messages if no
   * lastReadAt). Only counts sections where the viewer has a subscription
   * or has participated in a thread.
   */
  async getUnreadCounts(token: string): Promise<Record<string, number>> {
    const viewer = await this.validateViewerToken(token);

    // Get all threads with PUBLIC visibility that have a camSection
    const threads = await this.prisma.camDiscussionThread.findMany({
      where: {
        visibility: CamThreadVisibility.PUBLIC,
        camSection: { not: null },
      },
      select: {
        id: true,
        camSection: true,
        _count: { select: { messages: true } },
        participants: {
          where: { userId: viewer.userId },
          select: { lastReadAt: true },
        },
      },
    });

    // Also check which sections the viewer is subscribed to
    const subs = await this.prisma.camSectionSubscription.findMany({
      where: { tokenId: viewer.tokenId },
      select: { camSection: true, createdAt: true },
    });
    const subMap = new Map(subs.map((s) => [s.camSection, s.createdAt]));

    const counts: Record<string, number> = {};

    for (const t of threads) {
      const section = t.camSection!;
      const participant = t.participants[0];
      const subCreated = subMap.get(section);

      // Skip sections where viewer has no involvement
      if (!participant && !subCreated) continue;

      // Determine the "since" cutoff for unread
      let since: Date | null = null;
      if (participant?.lastReadAt) {
        since = participant.lastReadAt;
      } else if (subCreated) {
        since = subCreated;
      }

      // Count messages after the cutoff
      let unread: number;
      if (since) {
        unread = await this.prisma.camDiscussionMessage.count({
          where: { threadId: t.id, createdAt: { gt: since } },
        });
      } else {
        // Never opened — all messages are unread
        unread = t._count.messages;
      }

      if (unread > 0) {
        counts[section] = (counts[section] || 0) + unread;
      }
    }

    return counts;
  }

  /* ================================================================ */
  /*  Public — CAM Section Subscriptions                               */
  /* ================================================================ */

  async getSubscriptions(token: string): Promise<string[]> {
    const viewer = await this.validateViewerToken(token);
    const subs = await this.prisma.camSectionSubscription.findMany({
      where: { tokenId: viewer.tokenId },
      select: { camSection: true },
    });
    return subs.map((s) => s.camSection);
  }

  async toggleSubscription(
    token: string,
    camSection: string,
    enabled: boolean,
  ): Promise<{ subscribed: boolean }> {
    const viewer = await this.validateViewerToken(token);

    if (!camSection?.trim()) {
      throw new BadRequestException("camSection is required.");
    }

    if (enabled) {
      await this.prisma.camSectionSubscription.upsert({
        where: {
          tokenId_camSection: {
            tokenId: viewer.tokenId,
            camSection: camSection.trim(),
          },
        },
        create: {
          tokenId: viewer.tokenId,
          camSection: camSection.trim(),
        },
        update: {},
      });
      return { subscribed: true };
    } else {
      await this.prisma.camSectionSubscription.deleteMany({
        where: {
          tokenId: viewer.tokenId,
          camSection: camSection.trim(),
        },
      });
      return { subscribed: false };
    }
  }

  /* ================================================================ */
  /*  Admin — Move thread to a different CAM section                   */
  /* ================================================================ */

  async moveThread(threadId: string, adminUserId: string, dto: MoveThreadDto) {
    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: { id: true, camSection: true, title: true },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    const oldSection = thread.camSection;

    await this.prisma.camDiscussionThread.update({
      where: { id: threadId },
      data: {
        camSection: dto.newCamSection,
        movedFromSection: oldSection,
        movedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Post a system message
    await this.prisma.camDiscussionMessage.create({
      data: {
        threadId,
        authorId: adminUserId,
        body: `📋 Thread moved from ${oldSection ?? "General"} to ${dto.newCamSection}`,
        isSystemMessage: true,
      },
    });

    // Notify participants
    this.dispatchNotifications(
      threadId,
      thread.title,
      dto.newCamSection,
      adminUserId,
      "Admin",
      `This discussion was moved from ${oldSection ?? "General"} to ${dto.newCamSection}.`,
    ).catch((err) =>
      this.logger.warn(`Move notification dispatch failed: ${err?.message}`),
    );

    this.logger.log(
      `Thread "${thread.title}" moved from ${oldSection ?? "General"} to ${dto.newCamSection}`,
    );

    return { moved: true, from: oldSection, to: dto.newCamSection };
  }

  /* ================================================================ */
  /*  Admin — Delete thread                                            */
  /* ================================================================ */

  async deleteThread(threadId: string) {
    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    await this.prisma.camDiscussionThread.delete({
      where: { id: threadId },
    });

    return { deleted: true };
  }

  /* ================================================================ */
  /*  Shared — Notification dispatch                                   */
  /* ================================================================ */

  /**
   * Send email + in-app notifications to all non-muted participants
   * of a thread, excluding the author of the new message.
   * Called by both public and admin postMessage flows.
   */
  async dispatchNotifications(
    threadId: string,
    threadTitle: string,
    camSection: string | null,
    authorUserId: string,
    authorName: string,
    messageBody: string,
  ) {
    // 1. Thread participants (existing behavior)
    const participants = await this.prisma.camDiscussionParticipant.findMany({
      where: {
        threadId,
        muted: false,
        userId: { not: authorUserId },
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true },
        },
      },
    });

    // 2. Section subscribers with notifyInstant=true (new behavior)
    //    Deduplicate: skip users who are already thread participants.
    const participantUserIds = new Set(participants.map((p) => p.user.id));
    const subscriberEmails = new Set<string>();

    if (camSection) {
      const subs = await this.prisma.camSectionSubscription.findMany({
        where: {
          camSection,
          notifyInstant: true,
        },
        include: {
          token: {
            select: {
              inviteeEmail: true,
              inviteeName: true,
              inviteeUserId: true,
              token: true,
            },
          },
        },
      });

      for (const sub of subs) {
        const subUserId = sub.token.inviteeUserId;
        const subEmail = sub.token.inviteeEmail?.toLowerCase();
        // Skip the author and existing participants
        if (subUserId === authorUserId) continue;
        if (subUserId && participantUserIds.has(subUserId)) continue;
        if (subEmail) subscriberEmails.add(subEmail);
      }
    }

    if (participants.length === 0 && subscriberEmails.size === 0) return;

    const preview = messageBody.length > 200
      ? messageBody.slice(0, 197) + "..."
      : messageBody;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";

    // In-app notifications (thread participants only — subscribers are email-based)
    const inAppPromises = participants.map((p) =>
      this.notifications
        .createNotification({
          userId: p.user.id,
          kind: NotificationKind.CAM_DISCUSSION,
          title: `New reply in "${threadTitle}"`,
          body: `${authorName}: ${preview}`,
          metadata: { threadId, camSection },
        })
        .catch((err: any) =>
          this.logger.warn(
            `In-app notification failed for ${p.user.id}: ${err?.message}`,
          ),
        ),
    );

    // Email notifications for thread participants
    const participantEmailsSent = new Set<string>();
    const emailPromises = participants
      .filter((p) => p.user.email)
      .map(async (p) => {
        participantEmailsSent.add(p.user.email!.toLowerCase());
        const shareToken = await this.prisma.documentShareToken.findFirst({
          where: {
            inviteeEmail: p.user.email!.toLowerCase(),
            documentType: ShareDocumentType.CAM_LIBRARY,
            revokedAt: null,
          },
          select: { token: true },
        });

        const pipUrl = shareToken
          ? `${baseUrl}/cam-access/${shareToken.token}`
          : baseUrl;

        return this.email
          .sendDiscussionNotification({
            toEmail: p.user.email!,
            recipientName: p.user.firstName ?? undefined,
            threadTitle,
            camSection: camSection ?? "General Discussion",
            authorName,
            messagePreview: preview,
            threadUrl: `${pipUrl}#discussion-${threadId}`,
            muteUrl: `${pipUrl}#mute-${threadId}`,
          })
          .catch((err: any) =>
            this.logger.warn(
              `Email notification failed for ${p.user.email}: ${err?.message}`,
            ),
          );
      });

    // Email notifications for section subscribers (not already emailed as participants)
    const subEmailPromises = [...subscriberEmails]
      .filter((email) => !participantEmailsSent.has(email))
      .map(async (email) => {
        const shareToken = await this.prisma.documentShareToken.findFirst({
          where: {
            inviteeEmail: email,
            documentType: ShareDocumentType.CAM_LIBRARY,
            revokedAt: null,
          },
          select: { token: true, inviteeName: true },
        });

        const pipUrl = shareToken
          ? `${baseUrl}/cam-access/${shareToken.token}`
          : baseUrl;

        return this.email
          .sendDiscussionNotification({
            toEmail: email,
            recipientName: shareToken?.inviteeName ?? undefined,
            threadTitle,
            camSection: camSection ?? "General Discussion",
            authorName,
            messagePreview: preview,
            threadUrl: `${pipUrl}#discussion-${threadId}`,
            muteUrl: `${pipUrl}#mute-${threadId}`,
          })
          .catch((err: any) =>
            this.logger.warn(
              `Subscriber email notification failed for ${email}: ${err?.message}`,
            ),
          );
      });

    await Promise.all([...inAppPromises, ...emailPromises, ...subEmailPromises]);

    const total = participants.length + subscriberEmails.size;
    this.logger.log(
      `Dispatched ${total} notification(s) for thread "${threadTitle}" (${participants.length} participants + ${subscriberEmails.size} subscribers)`,
    );
  }

  /* ================================================================ */
  /*  Public — CAM Read Status & Favorites                             */
  /* ================================================================ */

  /**
   * Returns all read statuses + favorites for this viewer.
   * Used by the frontend to determine icon badge colors.
   */
  async getCamStatuses(
    token: string,
  ): Promise<Array<{ camId: string; lastReadAt: string; isFavorite: boolean }>> {
    const viewer = await this.validateViewerToken(token);
    const statuses = await this.prisma.camReadStatus.findMany({
      where: { tokenId: viewer.tokenId },
      select: { camId: true, lastReadAt: true, isFavorite: true },
    });
    return statuses.map((s) => ({
      camId: s.camId,
      lastReadAt: s.lastReadAt.toISOString(),
      isFavorite: s.isFavorite,
    }));
  }

  /**
   * Mark a CAM as read (upsert lastReadAt to now).
   * Called when the user opens the phone preview or clicks the CAM ID link.
   */
  async markCamRead(
    token: string,
    camId: string,
  ): Promise<{ camId: string; lastReadAt: string }> {
    const viewer = await this.validateViewerToken(token);
    if (!camId?.trim()) {
      throw new BadRequestException("camId is required.");
    }
    const status = await this.prisma.camReadStatus.upsert({
      where: {
        tokenId_camId: { tokenId: viewer.tokenId, camId: camId.trim() },
      },
      create: {
        tokenId: viewer.tokenId,
        camId: camId.trim(),
        lastReadAt: new Date(),
      },
      update: { lastReadAt: new Date() },
    });
    return { camId: status.camId, lastReadAt: status.lastReadAt.toISOString() };
  }

  /**
   * Toggle favorite status for a CAM.
   */
  async toggleCamFavorite(
    token: string,
    camId: string,
  ): Promise<{ camId: string; isFavorite: boolean }> {
    const viewer = await this.validateViewerToken(token);
    if (!camId?.trim()) {
      throw new BadRequestException("camId is required.");
    }
    const existing = await this.prisma.camReadStatus.findUnique({
      where: {
        tokenId_camId: { tokenId: viewer.tokenId, camId: camId.trim() },
      },
    });
    if (existing) {
      const updated = await this.prisma.camReadStatus.update({
        where: { id: existing.id },
        data: { isFavorite: !existing.isFavorite },
      });
      return { camId: updated.camId, isFavorite: updated.isFavorite };
    }
    // First interaction — create with favorite=true and mark as read
    const created = await this.prisma.camReadStatus.create({
      data: {
        tokenId: viewer.tokenId,
        camId: camId.trim(),
        lastReadAt: new Date(),
        isFavorite: true,
      },
    });
    return { camId: created.camId, isFavorite: created.isFavorite };
  }

  /* ================================================================ */
  /*  Public — Announcements                                           */
  /* ================================================================ */

  /**
   * List announcements from the last 30 days, newest first.
   */
  async listAnnouncements(token: string) {
    await this.validateViewerToken(token);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const items = await this.prisma.camAnnouncement.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    return items.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      priority: a.priority,
      authorName:
        `${a.createdBy.firstName ?? ""} ${a.createdBy.lastName ?? ""}`.trim() ||
        "Admin",
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /**
   * Admin: create a global announcement and optionally push to all active PIP viewers.
   */
  async createAnnouncement(
    userId: string,
    dto: { title: string; body: string; priority?: CamAnnouncementPriority },
  ) {
    if (!dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException("Title and body are required.");
    }
    const announcement = await this.prisma.camAnnouncement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        priority: dto.priority ?? CamAnnouncementPriority.NORMAL,
        createdById: userId,
      },
    });

    // Push to all active PIP viewers who have registered a mobile device
    const tokensWithPush = await this.prisma.documentShareToken.findMany({
      where: {
        documentType: ShareDocumentType.CAM_LIBRARY,
        revokedAt: null,
        cndaAcceptedAt: { not: null },
        questionnaireCompletedAt: { not: null },
        expoPushToken: { not: null },
      },
      select: { expoPushToken: true },
    });

    const pushTokens = tokensWithPush
      .map((t) => t.expoPushToken!)
      .filter(Boolean);

    if (pushTokens.length > 0) {
      this.logger.log(
        `Sending PIP announcement push to ${pushTokens.length} device(s)`,
      );
      // Fire-and-forget Expo push
      const messages = pushTokens.map((pt) => ({
        to: pt,
        title: dto.priority === CamAnnouncementPriority.URGENT
          ? `🔴 ${dto.title.trim()}`
          : `📢 ${dto.title.trim()}`,
        body: dto.body.trim().slice(0, 200),
        data: { type: "pip_announcement", announcementId: announcement.id },
        categoryId: "pip_announcement",
        sound: "default" as const,
      }));

      fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      }).catch((err) =>
        this.logger.warn(`PIP push send failed: ${err?.message}`),
      );
    }

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      priority: announcement.priority,
      createdAt: announcement.createdAt.toISOString(),
      pushSentTo: pushTokens.length,
    };
  }

  /* ================================================================ */
  /*  Public — Mobile Device Registration for PIP Push                  */
  /* ================================================================ */

  /**
   * Register an Expo push token against a PIP share token.
   * Called from the mobile app when PIP mode is activated.
   */
  async registerDevice(
    token: string,
    expoPushToken: string,
  ): Promise<{ registered: boolean }> {
    const viewer = await this.validateViewerToken(token);
    if (!expoPushToken?.trim()) {
      throw new BadRequestException("expoPushToken is required.");
    }
    await this.prisma.documentShareToken.update({
      where: { id: viewer.tokenId },
      data: { expoPushToken: expoPushToken.trim() },
    });
    return { registered: true };
  }
}
