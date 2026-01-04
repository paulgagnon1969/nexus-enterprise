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

  async getThread(actor: AuthenticatedUser, id: string) {
    const companyId = this.assertCompanyContext(actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { id, companyId },
      include: {
        participants: true,
        messages: {
          orderBy: { createdAt: "asc" },
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

  async createThread(actor: AuthenticatedUser, dto: CreateThreadDto) {
    const companyId = this.assertCompanyContext(actor);

    const participantUserIds = Array.from(
      new Set([actor.userId, ...(dto.participantUserIds || [])].filter(Boolean)),
    );
    const externalEmails = Array.from(
      new Set((dto.externalEmails || []).map(e => e.trim()).filter(Boolean)),
    );

    const result = await this.prisma.$transaction(async tx => {
      const thread = await tx.messageThread.create({
        data: {
          companyId,
          subject: dto.subject ?? null,
          createdById: actor.userId,
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

  async addMessage(actor: AuthenticatedUser, threadId: string, body: string) {
    const companyId = this.assertCompanyContext(actor);

    const thread = await this.prisma.messageThread.findFirst({
      where: { id: threadId, companyId },
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
}
