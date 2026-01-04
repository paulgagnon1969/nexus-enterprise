import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { EmailService } from "../../common/email.service";
import { NotificationsService } from "../notifications/notifications.service";
import { $Enums } from "@prisma/client";

interface CreateThreadDto {
  subject?: string | null;
  participantUserIds?: string[];
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
    const baseEmails = new Set<string>((dto.externalEmails || []).map(e => e.trim()).filter(Boolean));

    // Expand any recipient groups into concrete userIds/emails
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
            baseEmails.add(m.email.trim());
          }
        }
      }
    }

    const participantUserIds = Array.from(baseUserIds).filter(Boolean);
    const externalEmails = Array.from(baseEmails);

    const result = await this.prisma.$transaction(async tx => {
      const thread = await tx.messageThread.create({
        data: {
          companyId,
          subject: dto.subject ?? null,
          createdById: actor.userId,
          type: $Enums.MessageThreadType.DIRECT,
        },
      });

      const participantsData: any[] = [];
      for (const userId of participantUserIds) {
        participantsData.push({
          threadId: thread.id,
          userId,
          isExternal: false,
        });
      }
      for (const email of externalEmails) {
        participantsData.push({
          threadId: thread.id,
          email,
          isExternal: true,
        });
      }

      const participants = participantsData.length
        ? await tx.messageParticipant.createManyAndReturn({
            data: participantsData,
          } as any)
        : [];

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

      return { thread, participants, message };
    });

    const { thread, participants, message } = result;

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

    // TODO: send email to external participants using EmailService
    // (out of scope for v1; internal web messaging first).

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

    return message;
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
