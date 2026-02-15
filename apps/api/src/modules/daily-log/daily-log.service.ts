import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateDailyLogDto, DailyLogTypeDto } from "./dto/create-daily-log.dto";
import { UpdateDailyLogDto } from "./dto/update-daily-log.dto";
import { Role, DailyLogStatus, DailyLogType, ProjectBillStatus, $Enums } from "@prisma/client";
import * as path from "node:path";
import * as fs from "node:fs";
import { NotificationsService } from "../notifications/notifications.service";
import { TaskService } from "../task/task.service";
import { TaskPriorityEnum } from "../task/dto/task.dto";
import { ReceiptOcrService } from "../ocr/receipt-ocr.service";

// Profile codes that are considered PM+ level (can edit logs, see delayed logs, publish)
const PM_PLUS_PROFILES = new Set(["PM", "EXECUTIVE"]);
// Profile codes that can flag logs as delayed (foreman/super)
const CAN_DELAY_PROFILES = new Set(["FOREMAN", "SUPERINTENDENT"]);
// Profile codes that can view RECEIPT_EXPENSE logs (Foreman+)
const RECEIPT_VISIBLE_PROFILES = new Set(["FOREMAN", "SUPERINTENDENT", "PM", "EXECUTIVE"]);

@Injectable()
export class DailyLogService {
  private readonly logger = new Logger(DailyLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tasks: TaskService,
    private readonly receiptOcr: ReceiptOcrService,
  ) {}

  private async assertProjectAccess(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    requiredCompanyRole: Role | null = null
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (requiredCompanyRole && actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only OWNER or ADMIN can perform this action");
    }

    if (!requiredCompanyRole && actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId
          }
        }
      });

      if (!membership) {
        throw new ForbiddenException("You do not have access to this project");
      }
    }

    return project;
  }

  /**
   * Check if actor is PM+ level (OWNER, ADMIN, or PM/EXECUTIVE profile).
   */
  private isPmOrAbove(actor: AuthenticatedUser): boolean {
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return true;
    }
    if (actor.profileCode && PM_PLUS_PROFILES.has(actor.profileCode)) {
      return true;
    }
    return false;
  }

  /**
   * Check if actor can flag logs as delayed (FOREMAN or SUPERINTENDENT).
   */
  private canDelayPublish(actor: AuthenticatedUser): boolean {
    if (actor.profileCode && CAN_DELAY_PROFILES.has(actor.profileCode)) {
      return true;
    }
    return false;
  }

  /**
   * Check if actor can edit a specific log.
   * - Creator can always edit their own log
   * - PM+ can edit any log
   */
  private canEditLog(
    actor: AuthenticatedUser,
    log: { createdById: string },
  ): boolean {
    // Creator can edit
    if (log.createdById === actor.userId) {
      return true;
    }
    // PM+ can edit
    return this.isPmOrAbove(actor);
  }

  /**
   * Check if actor can view RECEIPT_EXPENSE logs (Foreman+ or author).
   */
  private canViewReceiptExpense(actor: AuthenticatedUser, createdById: string): boolean {
    // Author can always see their own receipts
    if (actor.userId === createdById) return true;
    // Company Owner/Admin can see all
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) return true;
    // Foreman+ profiles can see
    if (actor.profileCode && RECEIPT_VISIBLE_PROFILES.has(actor.profileCode)) return true;
    return false;
  }

  /**
   * Visibility rules for daily logs:
   * - Company must match
   * - Clients only see effectiveShareClient logs
   * - Delayed logs only visible to: author, PM+
   * - RECEIPT_EXPENSE logs only visible to: author, Foreman+
   * - Otherwise, project members can see all logs
   */
  private canViewDailyLog(
    actor: AuthenticatedUser,
    log: { projectId: string; effectiveShareClient?: boolean; isDelayedPublish?: boolean; createdById: string; type?: DailyLogType | null },
    project: { id: string; companyId: string },
    companyId: string
  ): boolean {
    // Same-company requirement
    if (project.companyId !== companyId) return false;

    // Clients should only see logs that are effectively client-visible.
    if (actor.role === Role.CLIENT || actor.profileCode === "CLIENT") {
      return !!log.effectiveShareClient;
    }

    // RECEIPT_EXPENSE logs: only author or Foreman+ can see
    if (log.type === DailyLogType.RECEIPT_EXPENSE) {
      return this.canViewReceiptExpense(actor, log.createdById);
    }

    // Delayed logs: only author or PM+ can see
    if (log.isDelayedPublish) {
      if (log.createdById === actor.userId) return true;
      return this.isPmOrAbove(actor);
    }

    // Owners/Admins in the company can see all logs in their company projects.
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return true;
    }

    // For now, any internal member who has access to the project (enforced by assertProjectAccess)
    // can see all logs on that project.
    return true;
  }

  async listForProject(projectId: string, companyId: string, actor: AuthenticatedUser) {
    const project = await this.assertProjectAccess(projectId, companyId, actor, null);

    const logs = await this.prisma.dailyLog.findMany({
      where: { projectId },
      orderBy: { logDate: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
          },
        },
        attachments: true,
        building: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        unit: {
          select: {
            id: true,
            label: true,
            floor: true,
          },
        },
        roomParticle: {
          select: {
            id: true,
            name: true,
            fullLabel: true,
          },
        },
        sowItem: {
          select: {
            id: true,
            description: true,
          },
        },
      },
    });

    const visibleLogs = logs.filter(l => this.canViewDailyLog(actor, l, project, companyId));

    return visibleLogs.map((l: any) => {
      const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, ...rest } = l;
      return {
        ...rest,
        createdByUser: createdBy,
      };
    });
  }

  async listAttachments(
    dailyLogId: string,
    companyId: string,
    actor: AuthenticatedUser
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: dailyLogId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!this.canViewDailyLog(actor, log, log.project, companyId)) {
      throw new ForbiddenException("You do not have access to this daily log");
    }

    const attachments = await this.prisma.dailyLogAttachment.findMany({
      where: { dailyLogId },
      orderBy: { createdAt: "asc" },
    });

    return attachments;
  }

  async addAttachment(
    dailyLogId: string,
    companyId: string,
    actor: AuthenticatedUser,
    file: {
      originalname?: string;
      mimetype?: string;
      buffer: Buffer;
      size?: number;
    }
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: dailyLogId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!file) {
      throw new NotFoundException("No file uploaded");
    }

    // For now, continue storing files on local disk under an uploads directory.
    const uploadsRoot = path.resolve(process.cwd(), "uploads/daily-logs");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    const ext = path.extname(file.originalname || "");
    const fileName = `${dailyLogId}-${Date.now()}${ext}`;
    const destPath = path.join(uploadsRoot, fileName);

    fs.writeFileSync(destPath, file.buffer);

    const publicUrl = `/uploads/daily-logs/${fileName}`;

    // Create a ProjectFile record so this attachment is visible in the project Files container.
    const projectFile = await this.prisma.projectFile.create({
      data: {
        companyId,
        projectId: log.projectId,
        storageUrl: publicUrl,
        fileName: file.originalname || fileName,
        mimeType: file.mimetype || null,
        sizeBytes: typeof file.size === "number" ? file.size : null,
        createdById: actor.userId,
      },
    });

    const attachment = await this.prisma.dailyLogAttachment.create({
      data: {
        dailyLogId,
        projectFileId: projectFile.id,
        fileUrl: publicUrl,
        fileName: file.originalname || fileName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    await this.audit.log(actor, "DAILY_LOG_ATTACHMENT_ADDED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId,
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        projectFileId: projectFile.id,
      },
    });

    return attachment;
  }

  async addAttachmentLink(
    dailyLogId: string,
    companyId: string,
    actor: AuthenticatedUser,
    payload: {
      fileUrl: string;
      fileName?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
    },
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: dailyLogId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!payload.fileUrl) {
      throw new NotFoundException("fileUrl is required");
    }

    // Optionally create a ProjectFile in the future; for now, just persist the link.
    const attachment = await this.prisma.dailyLogAttachment.create({
      data: {
        dailyLogId,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName ?? null,
        mimeType: payload.mimeType ?? null,
        sizeBytes:
          typeof payload.sizeBytes === "number" ? payload.sizeBytes : null,
      },
    });

    await this.audit.log(actor, "DAILY_LOG_ATTACHMENT_LINKED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId,
        attachmentId: attachment.id,
        fileUrl: attachment.fileUrl,
      },
    });

    // Auto-trigger OCR for image attachments on RECEIPT_EXPENSE logs
    if (log.type === DailyLogType.RECEIPT_EXPENSE) {
      const isImage = payload.mimeType?.startsWith('image/') || 
        payload.fileUrl?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
      if (isImage) {
        try {
          // Create a temporary ProjectFile record for OCR
          const projectFile = await this.prisma.projectFile.create({
            data: {
              companyId,
              projectId: log.projectId,
              storageUrl: payload.fileUrl,
              fileName: payload.fileName ?? 'receipt',
              mimeType: payload.mimeType ?? 'image/jpeg',
            },
          });
          // Update attachment with projectFileId
          await this.prisma.dailyLogAttachment.update({
            where: { id: attachment.id },
            data: { projectFileId: projectFile.id },
          });
          // Trigger OCR
          await this.receiptOcr.processReceiptAsync({
            projectFileId: projectFile.id,
            dailyLogId,
          });
          this.logger.log(`Triggered OCR for attachment ${attachment.id} on receipt log ${dailyLogId}`);
        } catch (ocrErr: any) {
          this.logger.warn(`OCR trigger failed for attachment ${attachment.id}: ${ocrErr?.message ?? ocrErr}`);
        }
      }
    }

    return attachment;
  }

  /**
   * Manually trigger OCR for all image attachments on a daily log
   */
  async triggerOcrForLog(
    dailyLogId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: dailyLogId, project: { companyId } },
      include: {
        project: true,
        attachments: true,
      },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    const results: { attachmentId: string; status: string; error?: string }[] = [];

    for (const attachment of log.attachments) {
      const isImage = attachment.mimeType?.startsWith('image/') ||
        attachment.fileUrl?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);

      if (!isImage) {
        results.push({ attachmentId: attachment.id, status: 'skipped', error: 'Not an image' });
        continue;
      }

      try {
        let projectFileId = attachment.projectFileId;

        // Create ProjectFile if needed
        if (!projectFileId) {
          const projectFile = await this.prisma.projectFile.create({
            data: {
              companyId,
              projectId: log.projectId,
              storageUrl: attachment.fileUrl,
              fileName: attachment.fileName ?? 'attachment',
              mimeType: attachment.mimeType ?? 'image/jpeg',
            },
          });
          projectFileId = projectFile.id;

          await this.prisma.dailyLogAttachment.update({
            where: { id: attachment.id },
            data: { projectFileId },
          });
        }

        await this.receiptOcr.processReceiptAsync({
          projectFileId,
          dailyLogId,
        });

        results.push({ attachmentId: attachment.id, status: 'triggered' });
        this.logger.log(`Triggered OCR for attachment ${attachment.id}`);
      } catch (err: any) {
        results.push({ attachmentId: attachment.id, status: 'failed', error: err?.message });
        this.logger.warn(`OCR trigger failed for attachment ${attachment.id}: ${err?.message ?? err}`);
      }
    }

    return { dailyLogId, results };
  }

  /**
   * Delete an attachment from a daily log
   */
  async deleteAttachment(
    dailyLogId: string,
    attachmentId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: dailyLogId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    const attachment = await this.prisma.dailyLogAttachment.findFirst({
      where: { id: attachmentId, dailyLogId },
    });

    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }

    await this.prisma.dailyLogAttachment.delete({
      where: { id: attachmentId },
    });

    await this.audit.log(actor, "DAILY_LOG_ATTACHMENT_DELETED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId,
        attachmentId,
        fileName: attachment.fileName,
      },
    });

    return { success: true, attachmentId };
  }

  async createForProject(
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    dto: CreateDailyLogDto
  ) {
    const project = await this.assertProjectAccess(projectId, companyId, actor, null);

    const tagsJson = dto.tags && dto.tags.length ? JSON.stringify(dto.tags) : null;
    const notifyUserIdsJson =
      dto.notifyUserIds && dto.notifyUserIds.length
        ? JSON.stringify(dto.notifyUserIds)
        : null;

    // Determine log type (default PUDL)
    const logType = dto.type ? (dto.type as unknown as DailyLogType) : DailyLogType.PUDL;
    const isReceiptExpense = logType === DailyLogType.RECEIPT_EXPENSE;

    // For RECEIPT_EXPENSE, override visibility to private
    const shareInternal = isReceiptExpense ? false : (dto.shareInternal ?? true);
    const shareSubs = isReceiptExpense ? false : (dto.shareSubs ?? false);
    const shareClient = isReceiptExpense ? false : (dto.shareClient ?? false);
    const sharePrivate = isReceiptExpense ? true : (dto.sharePrivate ?? false);

    const created = await this.prisma.dailyLog.create({
      data: {
        projectId,
        createdById: actor.userId,
        logDate: new Date(dto.logDate),
        type: logType,
        title: dto.title ?? null,
        tagsJson,
        weatherSummary: dto.weatherSummary ?? null,
        crewOnSite: dto.crewOnSite ?? null,
        workPerformed: dto.workPerformed ?? null,
        issues: dto.issues ?? null,
        safetyIncidents: dto.safetyIncidents ?? null,
        manpowerOnsite: dto.manpowerOnsite ?? null,
        personOnsite: dto.personOnsite ?? null,
        confidentialNotes: dto.confidentialNotes ?? null,
        buildingId: dto.buildingId ?? null,
        unitId: dto.unitId ?? null,
        roomParticleId: dto.roomParticleId ?? null,
        sowItemId: dto.sowItemId ?? null,
        shareInternal,
        shareSubs,
        shareClient,
        sharePrivate,
        status: DailyLogStatus.SUBMITTED,
        effectiveShareClient: false,
        notifyUserIdsJson,
        // Receipt/expense fields
        expenseVendor: isReceiptExpense ? (dto.expenseVendor ?? null) : null,
        expenseAmount: isReceiptExpense && dto.expenseAmount != null ? dto.expenseAmount : null,
        expenseDate: isReceiptExpense && dto.expenseDate ? new Date(dto.expenseDate) : null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true
          }
        },
        building: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        unit: {
          select: {
            id: true,
            label: true,
            floor: true,
          },
        },
        roomParticle: {
          select: {
            id: true,
            name: true,
            fullLabel: true,
          },
        },
        sowItem: {
          select: {
            id: true,
            description: true,
          },
        },
      }
    });

    await this.audit.log(actor, "DAILY_LOG_CREATED", {
      companyId,
      projectId,
      metadata: {
        dailyLogId: created.id,
        logDate: created.logDate,
        title: created.title,
        type: logType,
      }
    });

    // Handle attachments from projectFileIds
    const attachedProjectFiles: { id: string; storageUrl: string; fileName: string; mimeType: string | null }[] = [];
    if (dto.attachmentProjectFileIds && dto.attachmentProjectFileIds.length > 0) {
      for (const fileId of dto.attachmentProjectFileIds) {
        try {
          const projectFile = await this.prisma.projectFile.findFirst({
            where: { id: fileId, projectId, companyId },
          });
          if (projectFile) {
            await this.prisma.dailyLogAttachment.create({
              data: {
                dailyLogId: created.id,
                projectFileId: projectFile.id,
                fileUrl: projectFile.storageUrl,
                fileName: projectFile.fileName,
                mimeType: projectFile.mimeType,
                sizeBytes: projectFile.sizeBytes,
              },
            });
            attachedProjectFiles.push({
              id: projectFile.id,
              storageUrl: projectFile.storageUrl,
              fileName: projectFile.fileName,
              mimeType: projectFile.mimeType,
            });
          }
        } catch (err: any) {
          this.logger.warn(`Failed to attach file ${fileId}: ${err?.message ?? err}`);
        }
      }
    }

    // For RECEIPT_EXPENSE logs: create draft bill and trigger OCR
    if (isReceiptExpense) {
      await this.handleReceiptExpenseLog(created.id, projectId, companyId, actor, dto, attachedProjectFiles);
    }

    // If the Person Onsite is not currently a project participant, create a
    // follow-up Task for tenant admins to add them to the project roster.
    await this.createPersonOnsiteTaskIfNeeded(dto, actor, projectId, companyId, project);

    // Best-effort: notify any explicitly tagged users on this log.
    if (created.notifyUserIdsJson) {
      try {
        const ids = JSON.parse(created.notifyUserIdsJson) as string[];
        if (Array.isArray(ids) && ids.length) {
          const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
          const project = await this.prisma.project.findUnique({
            where: { id: projectId },
            select: { id: true, name: true },
          });

          const title = project
            ? `New daily log on ${project.name}`
            : "New daily log submitted";
          const body = created.title
            ? `${created.title} (${new Date(created.logDate).toLocaleDateString()})`
            : `Daily log for ${new Date(created.logDate).toLocaleDateString()}`;

          for (const userId of uniqueIds) {
            await this.notifications.createNotification({
              userId,
              companyId,
              projectId,
              kind: $Enums.NotificationKind.PROJECT,
              channel: $Enums.NotificationChannel.IN_APP,
              title,
              body,
              metadata: {
                type: "daily_log_created",
                dailyLogId: created.id,
                projectId,
              },
            });
          }
        }
      } catch {
        // ignore
      }
    }

    const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, ...rest } = created as any;

    return {
      ...rest,
      createdByUser: createdBy,
    };
  }

  private async createPersonOnsiteTaskIfNeeded(
    dto: CreateDailyLogDto,
    actor: AuthenticatedUser,
    projectId: string,
    companyId: string,
    project: { id: string; name: string },
  ) {
    const raw = dto.personOnsite;
    if (!raw || !raw.trim()) return;

    const names = raw
      .split(/[;,]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!names.length) return;

    // Look at existing project participants to see if these appear to be
    // known people on the job (by email or full name).
    const memberships = await this.prisma.projectMembership.findMany({
      where: { projectId, companyId },
      include: {
        user: true,
      },
    });

    const isKnownName = (name: string): boolean => {
      const normalized = name.toLowerCase();
      return memberships.some((m: any) => {
        if (!m.user) return false;
        const email = (m.user.email || "").toLowerCase();
        if (email && normalized === email) return true;
        const fullName = [m.user.firstName, m.user.lastName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (fullName && normalized === fullName) return true;
        return false;
      });
    };

    const unknownNames = names.filter(name => !isKnownName(name));
    if (!unknownNames.length) return;

    const dateLabel = dto.logDate
      ? new Date(dto.logDate).toLocaleDateString()
      : "recent date";

    for (const name of unknownNames) {
      const title = `Confirm onsite person for ${project.name}: ${name}`;
      const description =
        `Daily log for ${dateLabel} on project "${project.name}" lists "${name}" as Person Onsite, ` +
        "but they are not currently a project participant. Please add them as a project member/user or confirm.";

      try {
        // Create one medium-priority task per unknown name.
        // If task creation fails for a given name, continue with others.
        // eslint-disable-next-line no-await-in-loop
        await this.tasks.createTask(actor, {
          projectId,
          title,
          description,
          priority: TaskPriorityEnum.MEDIUM,
        });
      } catch {
        // Best-effort only; do not block log save on task failures.
      }
    }
  }

  /**
   * Handle RECEIPT_EXPENSE daily log:
   * 1. Create a draft ProjectBill linked to this daily log
   * 2. Copy attachments to the bill
   * 3. Trigger OCR for image attachments
   */
  private async handleReceiptExpenseLog(
    dailyLogId: string,
    projectId: string,
    companyId: string,
    actor: AuthenticatedUser,
    dto: CreateDailyLogDto,
    attachedFiles: { id: string; storageUrl: string; fileName: string; mimeType: string | null }[],
  ): Promise<void> {
    try {
      // Determine vendor name and amount
      const vendorName = dto.expenseVendor?.trim() || 'Receipt from Daily Log';
      const totalAmount = dto.expenseAmount ?? 0;
      const billDate = dto.expenseDate ? new Date(dto.expenseDate) : new Date(dto.logDate);

      // Create draft bill
      const bill = await this.prisma.projectBill.create({
        data: {
          companyId,
          projectId,
          vendorName,
          billDate,
          totalAmount,
          status: ProjectBillStatus.DRAFT,
          memo: `Auto-created from Daily Log receipt submission`,
          sourceDailyLogId: dailyLogId,
          createdByUserId: actor.userId,
        },
      });

      // Link the bill back to the daily log
      await this.prisma.dailyLog.update({
        where: { id: dailyLogId },
        data: { sourceBillId: bill.id },
      });

      // Create a line item for the bill
      await this.prisma.projectBillLineItem.create({
        data: {
          billId: bill.id,
          kind: 'OTHER',
          description: dto.title || `Receipt - ${vendorName}`,
          amount: totalAmount,
        },
      });

      this.logger.log(`Created draft bill ${bill.id} for receipt daily log ${dailyLogId}`);

      // Copy attachments to the bill and trigger OCR for images
      for (const file of attachedFiles) {
        // Create bill attachment
        await this.prisma.projectBillAttachment.create({
          data: {
            billId: bill.id,
            projectFileId: file.id,
            fileUrl: file.storageUrl,
            fileName: file.fileName,
            mimeType: file.mimeType,
          },
        });

        // Trigger OCR for image files
        const isImage = file.mimeType && (
          file.mimeType.startsWith('image/') ||
          file.mimeType === 'application/pdf'
        );

        if (isImage) {
          try {
            await this.receiptOcr.processReceiptAsync({
              projectFileId: file.id,
              dailyLogId,
              billId: bill.id,
            });
            this.logger.log(`Triggered OCR for file ${file.id} on daily log ${dailyLogId}`);
          } catch (ocrErr: any) {
            this.logger.warn(`OCR trigger failed for file ${file.id}: ${ocrErr?.message ?? ocrErr}`);
          }
        }
      }

      await this.audit.log(actor, "RECEIPT_BILL_CREATED", {
        companyId,
        projectId,
        metadata: {
          dailyLogId,
          billId: bill.id,
          vendorName,
          totalAmount,
        },
      });
    } catch (err: any) {
      this.logger.error(`Failed to create bill for receipt daily log ${dailyLogId}: ${err?.message ?? err}`);
      // Don't throw - let the daily log creation succeed even if bill creation fails
    }
  }

  async approveLog(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only OWNER or ADMIN can approve daily logs");
    }

    const updated = await this.prisma.dailyLog.update({
      where: { id: log.id },
      data: {
        status: DailyLogStatus.APPROVED,
        effectiveShareClient: log.shareClient,
      },
    });

    await this.audit.log(actor, "DAILY_LOG_APPROVED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId: log.id,
        shareClient: log.shareClient,
      },
    });

    // Best-effort: notify creator that their daily log was approved.
    try {
      if (log.createdById) {
        const project = await this.prisma.project.findUnique({
          where: { id: log.projectId },
          select: { id: true, name: true },
        });
        const title = project
          ? `Daily log approved on ${project.name}`
          : "Daily log approved";
        const body = `Your daily log for ${new Date(log.logDate).toLocaleDateString()} was approved.`;

        await this.notifications.createNotification({
          userId: log.createdById,
          companyId,
          projectId: log.projectId,
          kind: $Enums.NotificationKind.PROJECT,
          channel: $Enums.NotificationChannel.IN_APP,
          title,
          body,
          metadata: {
            type: "daily_log_approved",
            dailyLogId: log.id,
            projectId: log.projectId,
          },
        });
      }
    } catch {
      // ignore
    }

    return updated;
  }

  /**
   * List all daily logs across projects the user has access to.
   * Supports optional filtering by project IDs.
   */
  async listForUser(
    companyId: string,
    actor: AuthenticatedUser,
    filters?: { projectIds?: string[]; limit?: number; offset?: number },
  ) {
    const { userId, role } = actor;
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // Determine which projects the user can access
    let projectIds: string[];

    if (filters?.projectIds?.length) {
      // User specified projects - verify access to each
      const requestedIds = filters.projectIds;

      if (role === Role.OWNER || role === Role.ADMIN) {
        // Admins can access all company projects - just verify they belong to company
        const projects = await this.prisma.project.findMany({
          where: { id: { in: requestedIds }, companyId },
          select: { id: true },
        });
        projectIds = projects.map((p) => p.id);
      } else {
        // Members can only access projects they're assigned to
        const memberships = await this.prisma.projectMembership.findMany({
          where: {
            userId,
            companyId,
            projectId: { in: requestedIds },
          },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }
    } else {
      // No filter - get all accessible projects
      if (role === Role.OWNER || role === Role.ADMIN) {
        const projects = await this.prisma.project.findMany({
          where: { companyId },
          select: { id: true },
        });
        projectIds = projects.map((p) => p.id);
      } else {
        const memberships = await this.prisma.projectMembership.findMany({
          where: { userId, companyId },
          select: { projectId: true },
        });
        projectIds = memberships.map((m) => m.projectId);
      }
    }

    if (!projectIds.length) {
      return { items: [], total: 0, limit, offset };
    }

    // Fetch logs with project info
    const [logs, total] = await Promise.all([
      this.prisma.dailyLog.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { logDate: "desc" },
        skip: offset,
        take: limit,
        include: {
          project: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          attachments: {
            select: { id: true, fileName: true, fileUrl: true },
          },
        },
      }),
      this.prisma.dailyLog.count({
        where: { projectId: { in: projectIds } },
      }),
    ]);

    // Filter based on visibility (clients can only see effectiveShareClient logs)
    const visibleLogs = logs.filter((log) => {
      if (actor.role === Role.CLIENT || actor.profileCode === "CLIENT") {
        return !!log.effectiveShareClient;
      }
      return true;
    });

    const items = visibleLogs.map((l: any) => {
      const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, project, ...rest } = l;
      return {
        ...rest,
        projectId: project.id,
        projectName: project.name,
        createdByUser: createdBy,
      };
    });

    return { items, total, limit, offset };
  }

  /**
   * Get a single daily log by ID with full details.
   */
  async getById(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: {
        project: {
          select: { id: true, name: true, companyId: true },
        },
        createdBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        attachments: true,
        building: {
          select: { id: true, name: true, code: true },
        },
        unit: {
          select: { id: true, label: true, floor: true },
        },
        roomParticle: {
          select: { id: true, name: true, fullLabel: true },
        },
        sowItem: {
          select: { id: true, description: true },
        },
      },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found");
    }

    // Check access
    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!this.canViewDailyLog(actor, log, log.project, companyId)) {
      throw new ForbiddenException("You do not have access to this daily log");
    }

    const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, project, ...rest } = log as any;
    return {
      ...rest,
      projectId: project.id,
      projectName: project.name,
      createdByUser: createdBy,
    };
  }

  async rejectLog(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found in this company");
    }

    if (actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ForbiddenException("Only OWNER or ADMIN can reject daily logs");
    }

    const updated = await this.prisma.dailyLog.update({
      where: { id: log.id },
      data: {
        status: DailyLogStatus.REJECTED,
        effectiveShareClient: false,
      },
    });

    await this.audit.log(actor, "DAILY_LOG_REJECTED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId: log.id,
      },
    });

    return updated;
  }

  /**
   * Update a daily log with revision tracking.
   * Only creator or PM+ can edit.
   */
  async updateLog(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
    dto: UpdateDailyLogDto,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!this.canEditLog(actor, log)) {
      throw new ForbiddenException("You do not have permission to edit this daily log");
    }

    // Build the changes object (only include fields that are actually changing)
    const editableFields = [
      "logDate", "title", "weatherSummary", "crewOnSite", "workPerformed",
      "issues", "safetyIncidents", "manpowerOnsite", "personOnsite",
      "confidentialNotes", "buildingId", "unitId", "roomParticleId", "sowItemId",
      "shareInternal", "shareSubs", "shareClient", "sharePrivate",
    ] as const;

    const changes: Record<string, any> = {};
    const previousValues: Record<string, any> = {};

    for (const field of editableFields) {
      if (dto[field] !== undefined) {
        const currentValue = (log as any)[field];
        const newValue = field === "logDate" && dto.logDate
          ? new Date(dto.logDate)
          : dto[field];

        // Only record if value actually changed
        if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
          changes[field] = newValue;
          previousValues[field] = currentValue;
        }
      }
    }

    // Handle tags separately
    if (dto.tags !== undefined) {
      const newTagsJson = dto.tags.length ? JSON.stringify(dto.tags) : null;
      if (log.tagsJson !== newTagsJson) {
        changes["tagsJson"] = newTagsJson;
        previousValues["tagsJson"] = log.tagsJson;
      }
    }

    // If nothing changed, return the log as-is
    if (Object.keys(changes).length === 0) {
      const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, project, ...rest } = log as any;
      return { ...rest, projectId: project.id, projectName: project.name };
    }

    // Get the next revision number
    const lastRevision = await this.prisma.dailyLogRevision.findFirst({
      where: { dailyLogId: logId },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true },
    });
    const nextRevisionNumber = (lastRevision?.revisionNumber ?? 0) + 1;

    // Create revision record and update log in a transaction
    const [_, updated] = await this.prisma.$transaction([
      this.prisma.dailyLogRevision.create({
        data: {
          dailyLogId: logId,
          revisionNumber: nextRevisionNumber,
          editedById: actor.userId,
          changesJson: JSON.stringify(changes),
          previousValuesJson: JSON.stringify(previousValues),
        },
      }),
      this.prisma.dailyLog.update({
        where: { id: logId },
        data: changes,
        include: {
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    await this.audit.log(actor, "DAILY_LOG_UPDATED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId: logId,
        revisionNumber: nextRevisionNumber,
        changedFields: Object.keys(changes),
      },
    });

    const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, project, ...rest } = updated as any;
    return {
      ...rest,
      projectId: project.id,
      projectName: project.name,
      createdByUser: createdBy,
    };
  }

  /**
   * Flag a daily log as "delay publish".
   * Only FOREMAN or SUPERINTENDENT can do this.
   * Makes the log invisible to everyone except author and PM+.
   */
  async delayPublishLog(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    // Only FOREMAN/SUPER or PM+ can delay publish
    if (!this.canDelayPublish(actor) && !this.isPmOrAbove(actor)) {
      throw new ForbiddenException(
        "Only Foreman, Superintendent, or PM+ can flag a log for delayed publication"
      );
    }

    const updated = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: {
        isDelayedPublish: true,
        delayedById: actor.userId,
        delayedAt: new Date(),
        // Clear any previous publish info
        publishedById: null,
        publishedAt: null,
      },
    });

    await this.audit.log(actor, "DAILY_LOG_DELAY_PUBLISH", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId: logId,
        delayedById: actor.userId,
      },
    });

    return updated;
  }

  /**
   * Publish a delayed log (make it visible again).
   * Only PM+ can do this.
   */
  async publishLog(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!this.isPmOrAbove(actor)) {
      throw new ForbiddenException("Only PM or above can publish delayed logs");
    }

    const updated = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: {
        isDelayedPublish: false,
        publishedById: actor.userId,
        publishedAt: new Date(),
      },
    });

    await this.audit.log(actor, "DAILY_LOG_PUBLISHED", {
      companyId,
      projectId: log.projectId,
      metadata: {
        dailyLogId: logId,
        publishedById: actor.userId,
      },
    });

    return updated;
  }

  /**
   * Get revision history for a daily log.
   */
  async getRevisions(
    logId: string,
    companyId: string,
    actor: AuthenticatedUser,
  ) {
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: logId, project: { companyId } },
      include: { project: true },
    });

    if (!log) {
      throw new NotFoundException("Daily log not found");
    }

    await this.assertProjectAccess(log.projectId, companyId, actor, null);

    if (!this.canViewDailyLog(actor, log, log.project, companyId)) {
      throw new ForbiddenException("You do not have access to this daily log");
    }

    const revisions = await this.prisma.dailyLogRevision.findMany({
      where: { dailyLogId: logId },
      orderBy: { revisionNumber: "desc" },
      include: {
        editedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    return revisions.map((r) => ({
      id: r.id,
      revisionNumber: r.revisionNumber,
      editedAt: r.editedAt,
      editedBy: r.editedBy,
      changes: JSON.parse(r.changesJson),
      previousValues: JSON.parse(r.previousValuesJson),
    }));
  }
}
