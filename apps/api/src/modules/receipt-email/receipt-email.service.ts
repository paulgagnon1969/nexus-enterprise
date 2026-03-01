import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { EmailReceiptStatus } from "@prisma/client";
import { TaskService } from "../task/task.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ReceiptEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TaskService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    filters: {
      status?: EmailReceiptStatus;
      projectId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { companyId: actor.companyId };
    if (filters.status) where.status = filters.status;
    if (filters.projectId) where.projectId = filters.projectId;

    const [items, total] = await Promise.all([
      this.prisma.emailReceipt.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          ocrResult: {
            select: {
              vendorName: true,
              vendorStoreNumber: true,
              vendorCity: true,
              vendorState: true,
              totalAmount: true,
              receiptDate: true,
              lineItemsJson: true,
              confidence: true,
            },
          },
          assignedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.prisma.emailReceipt.count({ where }),
    ]);

    return { items, total };
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const receipt = await this.prisma.emailReceipt.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        project: { select: { id: true, name: true } },
        ocrResult: true,
        assignedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!receipt) throw new NotFoundException("Email receipt not found");
    return receipt;
  }

  async assign(actor: AuthenticatedUser, id: string, projectId: string) {
    const receipt = await this.prisma.emailReceipt.findFirst({
      where: { id, companyId: actor.companyId },
      include: { ocrResult: { select: { vendorName: true, totalAmount: true, receiptDate: true } } },
    });
    if (!receipt) throw new NotFoundException("Email receipt not found");

    // Verify project belongs to this company
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: actor.companyId },
      select: { id: true, name: true, teamTreeJson: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    // Update receipt
    const updated = await this.prisma.emailReceipt.update({
      where: { id },
      data: {
        status: EmailReceiptStatus.ASSIGNED,
        projectId,
        assignedByUserId: actor.userId,
        assignedAt: new Date(),
      },
      include: {
        project: { select: { id: true, name: true } },
        ocrResult: {
          select: {
            vendorName: true,
            totalAmount: true,
            receiptDate: true,
          },
        },
      },
    });

    // Create task for project team
    const vendorName = receipt.ocrResult?.vendorName || "Unknown vendor";
    const totalAmount = receipt.ocrResult?.totalAmount
      ? `$${Number(receipt.ocrResult.totalAmount).toFixed(2)}`
      : "";

    await this.tasks.createTask(actor, {
      projectId,
      title: `Review assigned receipt: ${vendorName} ${totalAmount}`,
      description: `Receipt from ${receipt.senderEmail} assigned to this project by ${actor.email}.\n\nReceipt ID: ${id}`,
      priority: "MEDIUM" as any,
      relatedEntityType: "EMAIL_RECEIPT",
      relatedEntityId: id,
    });

    // Notify project team
    const teamTree = (project.teamTreeJson as Record<string, string[]>) ?? {};
    for (const userIds of Object.values(teamTree)) {
      if (!Array.isArray(userIds)) continue;
      for (const userId of userIds) {
        if (userId === actor.userId) continue; // Don't notify the assigner
        await this.notifications.createNotification({
          userId,
          companyId: actor.companyId,
          projectId,
          title: `Receipt assigned: ${vendorName} ${totalAmount}`,
          body: `A receipt was assigned to "${project.name}" by ${actor.email}.`,
          metadata: { emailReceiptId: id },
        });
      }
    }

    return updated;
  }

  async unassign(actor: AuthenticatedUser, id: string) {
    const receipt = await this.prisma.emailReceipt.findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!receipt) throw new NotFoundException("Email receipt not found");

    return this.prisma.emailReceipt.update({
      where: { id },
      data: {
        status: EmailReceiptStatus.UNASSIGNED,
        projectId: null,
        assignedByUserId: actor.userId,
        assignedAt: new Date(),
      },
    });
  }

  async getSummary(actor: AuthenticatedUser) {
    const base = { companyId: actor.companyId };

    const [pendingOcr, pendingMatch, matched, assigned, unassigned, total] = await Promise.all([
      this.prisma.emailReceipt.count({ where: { ...base, status: EmailReceiptStatus.PENDING_OCR } }),
      this.prisma.emailReceipt.count({ where: { ...base, status: EmailReceiptStatus.PENDING_MATCH } }),
      this.prisma.emailReceipt.count({ where: { ...base, status: EmailReceiptStatus.MATCHED } }),
      this.prisma.emailReceipt.count({ where: { ...base, status: EmailReceiptStatus.ASSIGNED } }),
      this.prisma.emailReceipt.count({ where: { ...base, status: EmailReceiptStatus.UNASSIGNED } }),
      this.prisma.emailReceipt.count({ where: base }),
    ]);

    return {
      pendingOcr,
      pendingMatch,
      matched,
      assigned,
      unassigned,
      total,
      needsAttention: pendingMatch + matched,
    };
  }
}
