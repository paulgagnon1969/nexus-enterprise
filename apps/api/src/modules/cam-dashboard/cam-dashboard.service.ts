import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EmailService } from "../../common/email.service";
import { MessageBirdSmsClient } from "../../common/messagebird-sms.client";
import { SopSyncService } from "../documents/sop-sync.service";
import {
  CamThreadVisibility,
  ShareAccessType,
  ShareDocumentType,
} from "@prisma/client";
import * as crypto from "crypto";
import type { AuthenticatedUser } from "../auth/jwt.strategy";

/* ------------------------------------------------------------------ */
/*  DTOs                                                               */
/* ------------------------------------------------------------------ */

export interface SendInviteDto {
  recipientEmail: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryMethods: Array<"email" | "sms">;
  message?: string;
}

export interface BulkInviteRecipient {
  email: string;
  name?: string;
  phone?: string;
}

export interface BulkInviteDto {
  recipients: BulkInviteRecipient[];
  deliveryMethods: Array<"email" | "sms">;
  message?: string;
  inviteType?: "cam" | "master_class";
}

export interface CreateTopicDto {
  title: string;
  description?: string;
}

export interface CreateThreadDto {
  topicId?: string;
  camSection?: string;
  title: string;
  body: string;
  visibility?: CamThreadVisibility;
  participantUserIds?: string[];
}

export interface PostMessageDto {
  body: string;
}

export interface PatchThreadDto {
  isPinned?: boolean;
  isFaq?: boolean;
  topicId?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

@Injectable()
export class CamDashboardService {
  private readonly logger = new Logger(CamDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly sms: MessageBirdSmsClient,
    private readonly sopSync: SopSyncService,
  ) {}

  /* ================================================================ */
  /*  ANALYTICS                                                        */
  /* ================================================================ */

  async getAnalytics() {
    const [tokens, accessLogs] = await Promise.all([
      this.prisma.documentShareToken.findMany({
        where: { documentType: ShareDocumentType.CAM_LIBRARY },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          inviterName: true,
          inviterEmail: true,
          inviteeEmail: true,
          inviteeName: true,
          viewCount: true,
          firstViewedAt: true,
          lastViewedAt: true,
          cndaAcceptedAt: true,
          questionnaireCompletedAt: true,
          depth: true,
          parentTokenId: true,
          createdAt: true,
        },
      }),
      this.prisma.documentShareAccessLog.findMany({
        where: {
          token: { documentType: ShareDocumentType.CAM_LIBRARY },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          accessType: true,
          createdAt: true,
          ipAddress: true,
          tokenId: true,
          token: {
            select: {
              inviteeName: true,
              inviteeEmail: true,
              inviterName: true,
            },
          },
        },
      }),
    ]);

    // Funnel
    const totalTokens = tokens.length;
    const opened = tokens.filter((t) => t.viewCount > 0).length;
    const cndaAccepted = tokens.filter((t) => t.cndaAcceptedAt).length;
    const questionnaireCompleted = tokens.filter(
      (t) => t.questionnaireCompletedAt,
    ).length;
    const contentViewed = tokens.filter(
      (t) => t.cndaAcceptedAt && t.questionnaireCompletedAt,
    ).length;

    // Repeat visitors (sorted by viewCount desc)
    const visitors = tokens
      .filter((t) => t.viewCount > 0)
      .map((t) => ({
        email: t.inviteeEmail,
        name: t.inviteeName,
        viewCount: t.viewCount,
        firstVisit: t.firstViewedAt,
        lastVisit: t.lastViewedAt,
        cndaAccepted: !!t.cndaAcceptedAt,
        questionnaireCompleted: !!t.questionnaireCompletedAt,
        accessGranted: !!t.cndaAcceptedAt && !!t.questionnaireCompletedAt,
      }))
      .sort((a, b) => b.viewCount - a.viewCount);

    // Recent activity
    const recentActivity = accessLogs.map((log) => ({
      type: log.accessType,
      name:
        log.token.inviteeName ||
        log.token.inviteeEmail ||
        log.token.inviterName,
      createdAt: log.createdAt,
      ip: log.ipAddress,
    }));

    return {
      funnel: {
        totalTokens,
        opened,
        cndaAccepted,
        questionnaireCompleted,
        contentViewed,
      },
      visitors,
      recentActivity,
    };
  }

  async getReferralTree() {
    const tokens = await this.prisma.documentShareToken.findMany({
      where: { documentType: ShareDocumentType.CAM_LIBRARY },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        token: true,
        inviterName: true,
        inviterEmail: true,
        inviteeEmail: true,
        inviteeName: true,
        parentTokenId: true,
        depth: true,
        viewCount: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        createdAt: true,
      },
    });

    // Build tree structure
    const byId = new Map(tokens.map((t) => [t.id, t]));
    const roots = tokens.filter((t) => !t.parentTokenId);
    const childrenOf = new Map<string, typeof tokens>();
    for (const t of tokens) {
      if (t.parentTokenId) {
        const arr = childrenOf.get(t.parentTokenId) || [];
        arr.push(t);
        childrenOf.set(t.parentTokenId, arr);
      }
    }

    interface TreeNode {
      id: string;
      inviterName: string | null;
      inviterEmail: string;
      inviteeName: string | null;
      inviteeEmail: string | null;
      depth: number;
      viewCount: number;
      gateStatus: string;
      createdAt: Date;
      children: TreeNode[];
    }

    function buildNode(t: (typeof tokens)[0]): TreeNode {
      const gateStatus = t.cndaAcceptedAt
        ? t.questionnaireCompletedAt
          ? "viewing"
          : "cnda_accepted"
        : t.viewCount > 0
          ? "opened"
          : "pending";
      return {
        id: t.id,
        inviterName: t.inviterName,
        inviterEmail: t.inviterEmail,
        inviteeName: t.inviteeName,
        inviteeEmail: t.inviteeEmail,
        depth: t.depth,
        viewCount: t.viewCount,
        gateStatus,
        createdAt: t.createdAt,
        children: (childrenOf.get(t.id) || []).map(buildNode),
      };
    }

    return {
      totalTokens: tokens.length,
      maxDepth: Math.max(0, ...tokens.map((t) => t.depth)),
      viralCoefficient:
        tokens.length > 1
          ? +(tokens.filter((t) => t.parentTokenId).length / roots.length).toFixed(2)
          : 0,
      tree: roots.map(buildNode),
    };
  }

  /* ================================================================ */
  /*  INVITE DELIVERY                                                  */
  /* ================================================================ */

  async sendInvite(actor: AuthenticatedUser, dto: SendInviteDto) {
    const email = (dto.recipientEmail || "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Recipient email is required");
    if (!dto.deliveryMethods || dto.deliveryMethods.length === 0) {
      throw new BadRequestException("At least one delivery method is required");
    }

    // Look up inviter name
    const inviter = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const inviterName =
      `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() ||
      actor.email;

    // Create the share token
    const token = crypto.randomBytes(24).toString("hex");
    await this.prisma.documentShareToken.create({
      data: {
        token,
        documentType: ShareDocumentType.CAM_LIBRARY,
        inviterEmail: actor.email,
        inviterName,
        inviterUserId: actor.userId,
        inviteeEmail: email,
        inviteeName: dto.recipientName ?? null,
        depth: 0,
      },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/cam-access/${token}`;

    const deliveryResults: Record<string, any> = {};

    // Send email
    if (dto.deliveryMethods.includes("email")) {
      try {
        const result = await this.email.sendCamInvite({
          toEmail: email,
          recipientName: dto.recipientName,
          inviterName,
          message: dto.message,
          shareUrl,
        });
        deliveryResults.email = { sent: true, ...result };
        this.logger.log(`CAM invite email sent to ${email}`);
      } catch (err: any) {
        deliveryResults.email = { sent: false, error: err?.message };
        this.logger.error(`CAM invite email failed for ${email}: ${err?.message}`);
      }
    }

    // Send SMS
    if (dto.deliveryMethods.includes("sms")) {
      const phone = (dto.recipientPhone || "").trim();
      if (!phone) {
        deliveryResults.sms = { sent: false, error: "No phone number provided" };
      } else {
        try {
          const smsBody = `${inviterName} invited you to review the Nexus CAM Library. View here: ${shareUrl}`;
          await this.sms.sendSms(phone, smsBody);
          deliveryResults.sms = { sent: true };
          this.logger.log(`CAM invite SMS sent to ${phone}`);
        } catch (err: any) {
          deliveryResults.sms = { sent: false, error: err?.message };
          this.logger.error(`CAM invite SMS failed for ${phone}: ${err?.message}`);
        }
      }
    }

    return {
      token,
      shareUrl,
      recipientEmail: email,
      recipientName: dto.recipientName ?? null,
      delivery: deliveryResults,
    };
  }

  async sendMasterClassInvite(actor: AuthenticatedUser, dto: SendInviteDto) {
    const email = (dto.recipientEmail || "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Recipient email is required");
    if (!dto.deliveryMethods || dto.deliveryMethods.length === 0) {
      throw new BadRequestException("At least one delivery method is required");
    }

    const inviter = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const inviterName =
      `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() ||
      actor.email;

    const token = crypto.randomBytes(24).toString("hex");
    await this.prisma.documentShareToken.create({
      data: {
        token,
        documentType: ShareDocumentType.CAM_DOCUMENT,
        documentRef: "MASTER_CLASS",
        inviterEmail: actor.email,
        inviterName,
        inviterUserId: actor.userId,
        inviteeEmail: email,
        inviteeName: dto.recipientName ?? null,
        depth: 0,
      },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/cam-access/${token}?doc=master-class`;

    const deliveryResults: Record<string, any> = {};

    if (dto.deliveryMethods.includes("email")) {
      try {
        const result = await this.email.sendMasterClassInvite({
          toEmail: email,
          recipientName: dto.recipientName,
          inviterName,
          message: dto.message,
          shareUrl,
        });
        deliveryResults.email = { sent: true, ...result };
        this.logger.log(`Master Class invite email sent to ${email}`);
      } catch (err: any) {
        deliveryResults.email = { sent: false, error: err?.message };
        this.logger.error(`Master Class invite email failed for ${email}: ${err?.message}`);
      }
    }

    if (dto.deliveryMethods.includes("sms")) {
      const phone = (dto.recipientPhone || "").trim();
      if (!phone) {
        deliveryResults.sms = { sent: false, error: "No phone number provided" };
      } else {
        try {
          const smsBody = `${inviterName} invited you to the Nexus Master Class. Start here: ${shareUrl}`;
          await this.sms.sendSms(phone, smsBody);
          deliveryResults.sms = { sent: true };
          this.logger.log(`Master Class invite SMS sent to ${phone}`);
        } catch (err: any) {
          deliveryResults.sms = { sent: false, error: err?.message };
          this.logger.error(`Master Class invite SMS failed for ${phone}: ${err?.message}`);
        }
      }
    }

    return {
      token,
      shareUrl,
      recipientEmail: email,
      recipientName: dto.recipientName ?? null,
      delivery: deliveryResults,
    };
  }

  async sendBulkInvites(actor: AuthenticatedUser, dto: BulkInviteDto) {
    if (!dto.recipients?.length) {
      throw new BadRequestException("At least one recipient is required");
    }
    if (dto.recipients.length > 200) {
      throw new BadRequestException("Maximum 200 recipients per batch");
    }

    const results: Array<{
      email: string;
      name?: string;
      success: boolean;
      shareUrl?: string;
      delivery?: Record<string, any>;
      error?: string;
    }> = [];

    const sendFn =
      dto.inviteType === "master_class"
        ? this.sendMasterClassInvite.bind(this)
        : this.sendInvite.bind(this);

    for (const r of dto.recipients) {
      try {
        const res = await sendFn(actor, {
          recipientEmail: r.email,
          recipientName: r.name,
          recipientPhone: r.phone,
          deliveryMethods: dto.deliveryMethods,
          message: dto.message,
        });
        results.push({
          email: r.email,
          name: r.name,
          success: true,
          shareUrl: res.shareUrl,
          delivery: res.delivery,
        });
      } catch (err: any) {
        results.push({
          email: r.email,
          name: r.name,
          success: false,
          error: err?.message || "Unknown error",
        });
        this.logger.error(`Bulk invite failed for ${r.email}: ${err?.message}`);
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { total: dto.recipients.length, sent, failed, results };
  }

  async resendInvite(actor: AuthenticatedUser, tokenId: string) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { id: tokenId },
      select: {
        id: true,
        token: true,
        documentType: true,
        inviteeEmail: true,
        inviteeName: true,
        inviterName: true,
        inviterEmail: true,
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("Token not found");
    }

    if (!record.inviteeEmail) {
      throw new BadRequestException("No recipient email on this token");
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/cam-access/${record.token}`;

    const result = await this.email.sendCamInvite({
      toEmail: record.inviteeEmail,
      recipientName: record.inviteeName ?? undefined,
      inviterName: record.inviterName || record.inviterEmail,
      shareUrl,
    });

    return { resent: true, email: record.inviteeEmail, ...result };
  }

  async listInvites() {
    const tokens = await this.prisma.documentShareToken.findMany({
      where: { documentType: ShareDocumentType.CAM_LIBRARY },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        inviterName: true,
        inviterEmail: true,
        inviteeEmail: true,
        inviteeName: true,
        viewCount: true,
        firstViewedAt: true,
        lastViewedAt: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        createdAt: true,
      },
    });

    return tokens.map((t) => ({
      id: t.id,
      token: t.token,
      inviterName: t.inviterName,
      recipientEmail: t.inviteeEmail,
      recipientName: t.inviteeName,
      viewCount: t.viewCount,
      firstViewed: t.firstViewedAt,
      lastViewed: t.lastViewedAt,
      cndaAccepted: !!t.cndaAcceptedAt,
      questionnaireCompleted: !!t.questionnaireCompletedAt,
      accessGranted: !!t.cndaAcceptedAt && !!t.questionnaireCompletedAt,
      status: t.cndaAcceptedAt
        ? t.questionnaireCompletedAt
          ? "viewing"
          : "cnda_accepted"
        : t.viewCount > 0
          ? "opened"
          : "pending",
      createdAt: t.createdAt,
    }));
  }

  async getInvitesBySender(userId: string) {
    const tokens = await this.prisma.documentShareToken.findMany({
      where: {
        inviterUserId: userId,
        documentType: {
          in: [ShareDocumentType.CAM_LIBRARY, ShareDocumentType.CAM_DOCUMENT],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentType: true,
        documentRef: true,
        inviteeEmail: true,
        inviteeName: true,
        viewCount: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        createdAt: true,
      },
    });

    return tokens.map((t) => ({
      id: t.id,
      type:
        t.documentType === ShareDocumentType.CAM_DOCUMENT &&
        t.documentRef === "MASTER_CLASS"
          ? "master_class"
          : "cam_library",
      recipientEmail: t.inviteeEmail,
      recipientName: t.inviteeName,
      viewCount: t.viewCount,
      status: t.cndaAcceptedAt
        ? t.questionnaireCompletedAt
          ? "viewing"
          : "cnda_accepted"
        : t.viewCount > 0
          ? "opened"
          : "pending",
      createdAt: t.createdAt,
    }));
  }

  /* ================================================================ */
  /*  DISCUSSION — Topics                                              */
  /* ================================================================ */

  async listTopics() {
    const topics = await this.prisma.camDiscussionTopic.findMany({
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { threads: true } },
      },
    });
    return topics.map((t) => ({
      ...t,
      threadCount: t._count.threads,
      _count: undefined,
    }));
  }

  async createTopic(actor: AuthenticatedUser, dto: CreateTopicDto) {
    return this.prisma.camDiscussionTopic.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        createdById: actor.userId,
      },
    });
  }

  /* ================================================================ */
  /*  DISCUSSION — Threads                                             */
  /* ================================================================ */

  async listThreads(
    actor: AuthenticatedUser,
    filters?: { topicId?: string; camSection?: string },
  ) {
    const where: any = {};
    if (filters?.topicId) where.topicId = filters.topicId;
    if (filters?.camSection) where.camSection = filters.camSection;

    // Show PUBLIC + own NOTE threads; PRIVATE only if participant
    where.OR = [
      { visibility: CamThreadVisibility.PUBLIC },
      { visibility: CamThreadVisibility.NOTE, createdById: actor.userId },
      {
        visibility: CamThreadVisibility.PRIVATE,
        participants: { some: { userId: actor.userId } },
      },
    ];

    const threads = await this.prisma.camDiscussionThread.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      include: {
        _count: { select: { messages: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        topic: { select: { id: true, title: true } },
      },
    });

    return threads.map((t) => ({
      id: t.id,
      topicId: t.topicId,
      topicTitle: t.topic?.title ?? null,
      camSection: t.camSection,
      title: t.title,
      visibility: t.visibility,
      isPinned: t.isPinned,
      isFaq: t.isFaq,
      messageCount: t._count.messages,
      createdBy: {
        id: t.createdBy.id,
        name:
          `${t.createdBy.firstName ?? ""} ${t.createdBy.lastName ?? ""}`.trim() ||
          t.createdBy.email,
      },
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async createThread(actor: AuthenticatedUser, dto: CreateThreadDto) {
    const visibility = dto.visibility || CamThreadVisibility.PUBLIC;

    const thread = await this.prisma.camDiscussionThread.create({
      data: {
        topicId: dto.topicId ?? null,
        camSection: dto.camSection ?? null,
        title: dto.title,
        visibility,
        createdById: actor.userId,
        messages: {
          create: {
            authorId: actor.userId,
            body: dto.body,
          },
        },
        ...(visibility === CamThreadVisibility.PRIVATE &&
        dto.participantUserIds?.length
          ? {
              participants: {
                createMany: {
                  data: [
                    { userId: actor.userId },
                    ...dto.participantUserIds
                      .filter((id) => id !== actor.userId)
                      .map((id) => ({ userId: id })),
                  ],
                },
              },
            }
          : {}),
      },
      include: {
        messages: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return thread;
  }

  async getThreadMessages(actor: AuthenticatedUser, threadId: string) {
    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        visibility: true,
        createdById: true,
        title: true,
        camSection: true,
        isFaq: true,
        isPinned: true,
        participants: { select: { userId: true } },
      },
    });

    if (!thread) throw new NotFoundException("Thread not found");

    // Access check
    if (thread.visibility === CamThreadVisibility.NOTE) {
      if (thread.createdById !== actor.userId) {
        throw new ForbiddenException("This is a private note");
      }
    } else if (thread.visibility === CamThreadVisibility.PRIVATE) {
      const isParticipant = thread.participants.some(
        (p) => p.userId === actor.userId,
      );
      if (!isParticipant) {
        throw new ForbiddenException("Not a participant of this thread");
      }
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

    return {
      thread: {
        id: thread.id,
        title: thread.title,
        camSection: thread.camSection,
        isFaq: thread.isFaq,
        isPinned: thread.isPinned,
        visibility: thread.visibility,
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        author: {
          id: m.author.id,
          name:
            `${m.author.firstName ?? ""} ${m.author.lastName ?? ""}`.trim() ||
            m.author.email,
        },
        createdAt: m.createdAt,
      })),
    };
  }

  async postMessage(
    actor: AuthenticatedUser,
    threadId: string,
    dto: PostMessageDto,
  ) {
    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        visibility: true,
        createdById: true,
        participants: { select: { userId: true } },
      },
    });

    if (!thread) throw new NotFoundException("Thread not found");

    // Access check
    if (
      thread.visibility === CamThreadVisibility.NOTE &&
      thread.createdById !== actor.userId
    ) {
      throw new ForbiddenException("This is a private note");
    }
    if (thread.visibility === CamThreadVisibility.PRIVATE) {
      if (!thread.participants.some((p) => p.userId === actor.userId)) {
        throw new ForbiddenException("Not a participant of this thread");
      }
    }

    const message = await this.prisma.camDiscussionMessage.create({
      data: {
        threadId,
        authorId: actor.userId,
        body: dto.body,
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

    return {
      id: message.id,
      body: message.body,
      author: {
        id: message.author.id,
        name:
          `${message.author.firstName ?? ""} ${message.author.lastName ?? ""}`.trim() ||
          message.author.email,
      },
      createdAt: message.createdAt,
    };
  }

  async patchThread(threadId: string, dto: PatchThreadDto) {
    const thread = await this.prisma.camDiscussionThread.findUnique({
      where: { id: threadId },
    });
    if (!thread) throw new NotFoundException("Thread not found");

    const data: any = {};
    if (dto.isPinned !== undefined) data.isPinned = dto.isPinned;
    if (dto.isFaq !== undefined) data.isFaq = dto.isFaq;
    if (dto.topicId !== undefined) data.topicId = dto.topicId;

    return this.prisma.camDiscussionThread.update({
      where: { id: threadId },
      data,
    });
  }

  /* ================================================================ */
  /*  HANDBOOK CONTENT (passthrough)                                   */
  /* ================================================================ */

  async getHandbookContent() {
    return this.sopSync.getCamHandbookHtml();
  }
}
