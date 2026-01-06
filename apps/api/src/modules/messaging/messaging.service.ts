import { Injectable, ForbiddenException, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { EmailService } from "../../common/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { $Enums } from "@prisma/client";

interface CreateThreadDto {
  subject?: string | null;
  participantUserIds?: string[];
  toExternalEmails?: string[];
  ccExternalEmails?: string[];
  bccExternalEmails?: string[];
  externalEmails?: string[];
  groupIds?: string[];
  attachments?: {
    kind: $Enums.AttachmentKind;
    url: string;
    filename?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    assetId?: string | null;
  }[];
  body: string;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertCompanyContext(actor: AuthenticatedUser) {
    if (!actor.companyId) {
      throw new ForbiddenException("Missing company context");
    }
    return actor.companyId;
  }

  async listThreadsForUser(actor: AuthenticatedUser) {
    const companyId = this.assertCompanyContext(actor);

    return this.prisma.messageThread.findMany({
      where: {
        companyId,
        type: $Enums.MessageThreadType.DIRECT,
        participants: {
          some: {
            OR: [
              { userId: actor.userId },
              {
                isExternal: false,
              },
            ],
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        participants: {
          select: {
            id: true,
            userId: true,
            email: true,
            displayName: true,
            isExternal: true,
            lastReadAt: true,
            headerRole: true,
          },
        },
      },
    });
  }

  async listBoardThreads(actor: AuthenticatedUser) {
    const companyId = this.assertCompanyContext(actor);

    return this.prisma.messageThread.findMany({
      where: {
        companyId,
        type: $Enums.MessageThreadType.BOARD,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  }

  async getThread(actor: AuthenticatedUser, id: string) {
    const companyId = this.assertCompanyContext(actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { id, companyId, type: $Enums.MessageThreadType.DIRECT },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException("Message thread not found");
    }

    const isParticipant = thread.participants.some(
      p => p.userId === actor.userId || (!p.userId && !p.isExternal),
    );
    if (!isParticipant) {
      throw new ForbiddenException("You are not a participant in this thread");
    }

    return thread;
  }

  async getBoardThread(actor: AuthenticatedUser, id: string) {
    const companyId = this.assertCompanyContext(actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { id, companyId, type: $Enums.MessageThreadType.BOARD },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: true,
          },
        },
      },
    });

    if (!thread) {
      throw new NotFoundException("Board thread not found");
    }

    return thread;
  }

  async createThread(actor: AuthenticatedUser, dto: CreateThreadDto) {
    const companyId = this.assertCompanyContext(actor);

    const baseUserIds = new Set<string>([actor.userId, ...(dto.participantUserIds || [])]);

    const toExternal = new Set<string>();
    const ccExternal = new Set<string>();
    const bccExternal = new Set<string>();

    const addMany = (target: Set<string>, values?: string[]) => {
      if (!values) return;
      for (const raw of values) {
        const email = (raw || "").trim();
        if (!email) continue;
        target.add(email);
      }
    };

    addMany(toExternal, dto.toExternalEmails);
    addMany(ccExternal, dto.ccExternalEmails);
    addMany(bccExternal, dto.bccExternalEmails);

    const hasExplicitBuckets =
      toExternal.size > 0 || ccExternal.size > 0 || bccExternal.size > 0;

    // Backward compatibility: if the caller only provided externalEmails,
    // treat them as BCC by default.
    if (!hasExplicitBuckets && dto.externalEmails && dto.externalEmails.length > 0) {
      addMany(bccExternal, dto.externalEmails);
    }

    // Expand any recipient groups into concrete userIds/emails.
    if (dto.groupIds && dto.groupIds.length > 0) {
      const groups = await this.prisma.messageRecipientGroup.findMany({
        where: {
          id: { in: dto.groupIds },
          companyId,
          ownerId: actor.userId,
        },
        include: { members: true },
      });

      for (const g of groups) {
        for (const m of g.members) {
          if (m.userId) {
            baseUserIds.add(m.userId);
          }
          if (m.email) {
            const email = m.email.trim();
            if (!email) continue;
            // If the caller already assigned this email to a specific header
            // bucket, do not override it. Otherwise, default group emails to BCC.
            if (!toExternal.has(email) && !ccExternal.has(email) && !bccExternal.has(email)) {
              bccExternal.add(email);
            }
          }
        }
      }
    }

    const participantUserIds = Array.from(baseUserIds).filter(Boolean);
    const toExternalEmails = Array.from(toExternal);
    const ccExternalEmails = Array.from(ccExternal);
    const bccExternalEmails = Array.from(bccExternal);

    const result = await this.prisma.$transaction(async tx => {
      const thread = await tx.messageThread.create({
        data: {
          companyId,
          subject: dto.subject ?? null,
          createdById: actor.userId,
          type: $Enums.MessageThreadType.DIRECT,
        },
      });

      const participantsData: Parameters<typeof tx.messageParticipant.create>[0]["data"][] = [];

      for (const userId of participantUserIds) {
        participantsData.push({
          threadId: thread.id,
          userId,
          isExternal: false,
          headerRole: $Enums.MessageHeaderRole.TO,
        });
      }

      const pushExternal = (emails: string[], role: $Enums.MessageHeaderRole) => {
        for (const email of emails) {
          participantsData.push({
            threadId: thread.id,
            email,
            isExternal: true,
            headerRole: role,
          });
        }
      };

      pushExternal(toExternalEmails, $Enums.MessageHeaderRole.TO);
      pushExternal(ccExternalEmails, $Enums.MessageHeaderRole.CC);
      pushExternal(bccExternalEmails, $Enums.MessageHeaderRole.BCC);

      const participants = participantsData.length
        ? await tx.messageParticipant.createManyAndReturn({
            data: participantsData as any,
          } as any)
        : [];

      const message = await tx.message.create({
        data: {
          threadId: thread.id,
          senderId: actor.userId,
          senderEmail: actor.email,
          body: dto.body,
        },
      });

      if (dto.attachments && dto.attachments.length > 0) {
        await tx.messageAttachment.createMany({
          data: dto.attachments.map(a => ({
            messageId: message.id,
            kind: a.kind,
            url: a.url,
            filename: a.filename || null,
            mimeType: a.mimeType || null,
            sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
            assetId: a.assetId || null,
          })),
        });
      }

      return { thread, participants, message };
    });

    const { thread, participants, message } = result;

    // In-app notifications for internal users
    const internalRecipients = (participants || []).filter(
      p => !p.isExternal && p.userId && p.userId !== actor.userId,
    );

    if (internalRecipients.length > 0) {
      const title =
        thread.subject && thread.subject.trim().length > 0
          ? `New message: ${thread.subject}`
          : "New direct message";

      const bodyPreview =
        message.body.length > 160 ? `${message.body.slice(0, 157)}...` : message.body;

      await Promise.all(
        internalRecipients.map(recipient =>
          this.notifications.createNotification({
            userId: recipient.userId!,
            companyId,
            kind: $Enums.NotificationKind.DIRECT_MESSAGE,
            title,
            body: bodyPreview,
            metadata: {
              threadId: thread.id,
              messageId: message.id,
            },
          }),
        ),
      );
    }

    // Outbound email to external recipients (single email with To/CC/BCC)
    const externalRecipients = (participants || []).filter(p => p.isExternal && p.email);
    if (externalRecipients.length > 0) {
      const baseSubject =
        thread.subject && thread.subject.trim().length > 0
          ? thread.subject
          : "New message from Nexus";
      const subject = this.addThreadTokenToSubject(baseSubject, thread.id);
      const textBody = message.body;
      const htmlBody = this.renderMessageHtml(actor.email, subject, message.body);

      const toList = externalRecipients
        .filter(p => p.headerRole === $Enums.MessageHeaderRole.TO)
        .map(p => p.email!) as string[];
      const ccList = externalRecipients
        .filter(p => p.headerRole === $Enums.MessageHeaderRole.CC)
        .map(p => p.email!) as string[];
      const bccList = externalRecipients
        .filter(p => p.headerRole === $Enums.MessageHeaderRole.BCC)
        .map(p => p.email!) as string[];

      // If everything is BCC/CC only, ensure there is at least one visible
      // "to" address for providers that require it. Prefer the actor's email
      // so they receive a copy.
      if (toList.length === 0 && (ccList.length > 0 || bccList.length > 0)) {
        if (actor.email) {
          toList.push(actor.email);
        } else if (bccList.length > 0) {
          toList.push(bccList[0]);
        } else if (ccList.length > 0) {
          toList.push(ccList[0]);
        }
      }

      if (toList.length === 0 && ccList.length === 0 && bccList.length === 0) {
        return result;
      }

      this.logger.log(
        `createThread: attempting outbound email for thread ${thread.id} to=${JSON.stringify(
          toList,
        )} cc=${JSON.stringify(ccList)} bcc=${JSON.stringify(bccList)}`,
      );

      try {
        const sendResult = await this.email.sendMail({
          to: toList,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: bccList.length > 0 ? bccList : undefined,
          subject,
          html: htmlBody,
          text: textBody,
        });
        this.logger.log(
          `createThread: email send result for thread ${thread.id}: ${JSON.stringify(sendResult)}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to send message email to external recipients: ${err?.message ?? err}`,
        );
      }
    }

    return result;
  }

  async createBoardThread(
    actor: AuthenticatedUser,
    dto: {
      subject?: string | null;
      body: string;
      attachments?: {
        kind: $Enums.AttachmentKind;
        url: string;
        filename?: string | null;
        mimeType?: string | null;
        sizeBytes?: number | null;
        assetId?: string | null;
      }[];
    },
  ) {
    const companyId = this.assertCompanyContext(actor);

    const result = await this.prisma.$transaction(async tx => {
      const thread = await tx.messageThread.create({
        data: {
          companyId,
          subject: dto.subject ?? null,
          createdById: actor.userId,
          type: $Enums.MessageThreadType.BOARD,
        },
      });

      // Ensure author is a participant for tracking/read-state purposes.
      await tx.messageParticipant.create({
        data: {
          threadId: thread.id,
          userId: actor.userId,
          isExternal: false,
        },
      });

      const message = await tx.message.create({
        data: {
          threadId: thread.id,
          senderId: actor.userId,
          senderEmail: null,
          body: dto.body,
        },
      });

      if (dto.attachments && dto.attachments.length > 0) {
        await tx.messageAttachment.createMany({
          data: dto.attachments.map(a => ({
            messageId: message.id,
            kind: a.kind,
            url: a.url,
            filename: a.filename || null,
            mimeType: a.mimeType || null,
            sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
            assetId: a.assetId || null,
          })),
        });
      }

      return { thread, message };
    });

    return result;
  }

  async addMessage(
    actor: AuthenticatedUser,
    threadId: string,
    body: string,
    attachments?: {
      kind: $Enums.AttachmentKind;
      url: string;
      filename?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
      assetId?: string | null;
    }[],
  ) {
    const companyId = this.assertCompanyContext(actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { id: threadId, companyId, type: $Enums.MessageThreadType.DIRECT },
      include: { participants: true },
    });
    if (!thread) {
      throw new NotFoundException("Message thread not found");
    }

    const isParticipant = thread.participants.some(
      p => p.userId === actor.userId || (!p.userId && !p.isExternal),
    );
    if (!isParticipant) {
      throw new ForbiddenException("You are not a participant in this thread");
    }

    const message = await this.prisma.message.create({
      data: {
        threadId,
        senderId: actor.userId,
        senderEmail: actor.email,
        body,
      },
    });

    if (attachments && attachments.length > 0) {
      await this.prisma.messageAttachment.createMany({
        data: attachments.map(a => ({
          messageId: message.id,
          kind: a.kind,
          url: a.url,
          filename: a.filename || null,
          mimeType: a.mimeType || null,
          sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
          assetId: a.assetId || null,
        })),
      });
    }

    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    const internalRecipients = thread.participants.filter(
      p => !p.isExternal && p.userId && p.userId !== actor.userId,
    );

    if (internalRecipients.length > 0) {
      const title =
        thread.subject && thread.subject.trim().length > 0
          ? `New message: ${thread.subject}`
          : "New direct message";

      const bodyPreview = body.length > 160 ? `${body.slice(0, 157)}...` : body;

      await Promise.all(
        internalRecipients.map(recipient =>
          this.notifications.createNotification({
            userId: recipient.userId!,
            companyId,
            kind: $Enums.NotificationKind.DIRECT_MESSAGE,
            title,
            body: bodyPreview,
            metadata: {
              threadId,
              messageId: message.id,
            },
          }),
        ),
      );
    }

    // Email all external participants on new messages as well (single email with To/CC/BCC).
    const externalRecipients = thread.participants.filter(p => p.isExternal && p.email);
    if (externalRecipients.length > 0) {
      const baseSubject =
        thread.subject && thread.subject.trim().length > 0
          ? thread.subject
          : "New message from Nexus";
      const subject = this.addThreadTokenToSubject(baseSubject, thread.id);
      const textBody = body;
      const htmlBody = this.renderMessageHtml(actor.email, subject, body);

      const toList = externalRecipients
        .filter(p => p.headerRole === $Enums.MessageHeaderRole.TO)
        .map(p => p.email!) as string[];
      const ccList = externalRecipients
        .filter(p => p.headerRole === $Enums.MessageHeaderRole.CC)
        .map(p => p.email!) as string[];
      const bccList = externalRecipients
        .filter(p => p.headerRole === $Enums.MessageHeaderRole.BCC)
        .map(p => p.email!) as string[];

      if (toList.length === 0 && (ccList.length > 0 || bccList.length > 0)) {
        if (actor.email) {
          toList.push(actor.email);
        } else if (bccList.length > 0) {
          toList.push(bccList[0]);
        } else if (ccList.length > 0) {
          toList.push(ccList[0]);
        }
      }

      if (toList.length === 0 && ccList.length === 0 && bccList.length === 0) {
        return message;
      }

      this.logger.log(
        `addMessage: attempting outbound email for thread ${thread.id} to=${JSON.stringify(
          toList,
        )} cc=${JSON.stringify(ccList)} bcc=${JSON.stringify(bccList)}`,
      );

      try {
        const sendResult = await this.email.sendMail({
          to: toList,
          cc: ccList.length > 0 ? ccList : undefined,
          bcc: ccList.length > 0 ? bccList : undefined,
          subject,
          html: htmlBody,
          text: textBody,
        });
        this.logger.log(
          `addMessage: email send result for thread ${thread.id}: ${JSON.stringify(sendResult)}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to send reply email to external recipients: ${err?.message ?? err}`,
        );
      }
    }

    return message;
  }

  /**
   * Append a stable thread token to the subject so inbound email handlers can
   * reliably map replies back to a MessageThread.
   */
  private addThreadTokenToSubject(subject: string, threadId: string): string {
    const token = `[NCC-THREAD:${threadId}]`;
    if (!subject) return token;
    if (subject.includes(token)) return subject;
    return `${subject} ${token}`;
  }

  /**
   * Called by the inbound email webhook/worker to attach an external email
   * reply to an existing thread without a logged-in actor.
   */
  async addInboundEmailToThread(payload: {
    threadId: string;
    fromEmail: string;
    subject?: string | null;
    body: string;
  }) {
    const email = payload.fromEmail.trim().toLowerCase();
    if (!email) {
      this.logger.warn("addInboundEmailToThread called without fromEmail");
      return null;
    }

    const thread = await this.prisma.messageThread.findFirst({
      where: { id: payload.threadId },
      include: { participants: true },
    });

    if (!thread) {
      this.logger.warn(
        `addInboundEmailToThread: thread not found for id=${payload.threadId} from=${email}`,
      );
      return null;
    }

    // Ensure there is an external participant representing this email address.
    let existing = thread.participants.find(
      p => p.isExternal && p.email && p.email.toLowerCase() === email,
    );

    if (!existing) {
      existing = await this.prisma.messageParticipant.create({
        data: {
          threadId: thread.id,
          email,
          isExternal: true,
          headerRole: $Enums.MessageHeaderRole.TO,
        },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: null,
        senderEmail: email,
        body: payload.body,
      },
    });

    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    });

    // Notify internal participants that a new external reply arrived.
    const internalRecipients = thread.participants.filter(p => !p.isExternal && p.userId);

    if (internalRecipients.length > 0) {
      const title =
        thread.subject && thread.subject.trim().length > 0
          ? `New reply on: ${thread.subject}`
          : "New reply on direct message";

      const bodyPreview =
        payload.body.length > 160
          ? `${payload.body.slice(0, 157)}...`
          : payload.body;

      await Promise.all(
        internalRecipients.map(recipient =>
          this.notifications.createNotification({
            userId: recipient.userId!,
            companyId: thread.companyId,
            kind: $Enums.NotificationKind.DIRECT_MESSAGE,
            title,
            body: bodyPreview,
            metadata: {
              threadId: thread.id,
              messageId: message.id,
            },
          }),
        ),
      );
    }

    this.logger.log(
      `addInboundEmailToThread: stored inbound email for thread=${thread.id} from=${email}`,
    );

    return message;
  }

  private renderMessageHtml(fromEmail: string, subject: string, body: string): string {
    const safeBody = this.escapeHtml(body).replace(/\r?\n/g, "<br/>");
    const safeSubject = this.escapeHtml(subject || "");
    const safeFrom = this.escapeHtml(fromEmail || "");

    return `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 12px; font-size: 16px;">${safeSubject || "New message from Nexus"}</h2>
        ${safeFrom ? `<p style="margin: 0 0 12px; color: #4b5563;">From: <strong>${safeFrom}</strong></p>` : ""}
        <div style="margin: 0 0 16px; white-space: normal;">${safeBody}</div>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">This message was sent via Nexus Contractor Connect.</p>
      </div>
    `.trim();
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async addBoardMessage(
    actor: AuthenticatedUser,
    threadId: string,
    body: string,
    attachments?: {
      kind: $Enums.AttachmentKind;
      url: string;
      filename?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
      assetId?: string | null;
    }[],
  ) {
    const companyId = this.assertCompanyContext(actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { id: threadId, companyId, type: $Enums.MessageThreadType.BOARD },
      include: { participants: true },
    });
    if (!thread) {
      throw new NotFoundException("Board thread not found");
    }

    // If actor is not yet a participant, add them so future DM-like features can
    // track read-state per user.
    const isParticipant = thread.participants.some(p => p.userId === actor.userId);
    if (!isParticipant) {
      await this.prisma.messageParticipant.create({
        data: {
          threadId,
          userId: actor.userId,
          isExternal: false,
        },
      });
    }

    const message = await this.prisma.message.create({
      data: {
        threadId,
        senderId: actor.userId,
        senderEmail: null,
        body,
      },
    });

    if (attachments && attachments.length > 0) {
      await this.prisma.messageAttachment.createMany({
        data: attachments.map(a => ({
          messageId: message.id,
          kind: a.kind,
          url: a.url,
          filename: a.filename || null,
          mimeType: a.mimeType || null,
          sizeBytes: typeof a.sizeBytes === "number" ? a.sizeBytes : null,
          assetId: a.assetId || null,
        })),
      });
    }

    await this.prisma.messageThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return message;
  }
}
