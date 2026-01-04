import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { Prisma, $Enums } from "@prisma/client";

export interface CreateNotificationParams {
  userId: string;
  companyId?: string | null;
  projectId?: string | null;
  kind?: $Enums.NotificationKind | null;
  channel?: $Enums.NotificationChannel | null;
  title: string;
  body: string;
  metadata?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(params: CreateNotificationParams) {
    const {
      userId,
      companyId = null,
      projectId = null,
      kind = $Enums.NotificationKind.GENERIC,
      channel = $Enums.NotificationChannel.IN_APP,
      title,
      body,
      metadata,
    } = params;

    return this.prisma.notification.create({
      data: {
        userId,
        companyId: companyId || undefined,
        projectId: projectId || undefined,
        kind: kind ?? $Enums.NotificationKind.GENERIC,
        channel: channel ?? $Enums.NotificationChannel.IN_APP,
        title,
        body,
        metadata: metadata ?? undefined,
      },
    });
  }

  async listForUser(actor: AuthenticatedUser, opts?: { onlyUnread?: boolean }) {
    const where: any = { userId: actor.userId };
    if (opts?.onlyUnread) {
      where.isRead = false;
    }

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markAsRead(actor: AuthenticatedUser, id: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== actor.userId) {
      return null;
    }

    if (notif.isRead) return notif;

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
