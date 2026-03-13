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

    // Check mute status for this viewer
    const participant = await this.prisma.camDiscussionParticipant.findUnique({
      where: {
        threadId_userId: { threadId, userId: viewer.userId },
      },
      select: { muted: true },
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

    if (participants.length === 0) return;

    const preview = messageBody.length > 200
      ? messageBody.slice(0, 197) + "..."
      : messageBody;

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";

    // In-app notifications
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

    // Email notifications — look up each participant's share token for their PIP link
    const emailPromises = participants
      .filter((p) => p.user.email)
      .map(async (p) => {
        // Find this user's share token for PIP link
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

    await Promise.all([...inAppPromises, ...emailPromises]);

    this.logger.log(
      `Dispatched ${participants.length} notification(s) for thread "${threadTitle}"`,
    );
  }
}
