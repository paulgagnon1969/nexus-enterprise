import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateDailyLogDto } from "./dto/create-daily-log.dto";
import { Role, DailyLogStatus, $Enums } from "@prisma/client";
import * as path from "node:path";
import * as fs from "node:fs";
import { NotificationsService } from "../notifications/notifications.service";
import { TaskService } from "../task/task.service";
import { TaskPriorityEnum } from "../task/dto/task.dto";

@Injectable()
export class DailyLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly tasks: TaskService,
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
   * For now, internal users in the owning company who have project access can view all logs
   * on that project. Later, this can be tightened to respect shareInternal/shareSubs/shareClient
   * and RoleProfile-based permissions.
   */
  private canViewDailyLog(
    actor: AuthenticatedUser,
    log: { projectId: string; effectiveShareClient?: boolean },
    project: { id: string; companyId: string },
    companyId: string
  ): boolean {
    // Same-company requirement
    if (project.companyId !== companyId) return false;

    // Clients should only see logs that are effectively client-visible.
    if (actor.role === Role.CLIENT || actor.profileCode === "CLIENT") {
      return !!log.effectiveShareClient;
    }

    // Owners/Admins in the company can see all logs in their company projects.
    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return true;
    }

    // For now, any internal member who has access to the project (enforced by assertProjectAccess)
    // can see all logs on that project. We can narrow this later based on profileCode.
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

    return attachment;
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

    const created = await this.prisma.dailyLog.create({
      data: {
        projectId,
        createdById: actor.userId,
        logDate: new Date(dto.logDate),
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
        shareInternal: dto.shareInternal ?? true,
        shareSubs: dto.shareSubs ?? false,
        shareClient: dto.shareClient ?? false,
        sharePrivate: dto.sharePrivate ?? false,
        status: DailyLogStatus.SUBMITTED,
        effectiveShareClient: false,
        notifyUserIdsJson,
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
        title: created.title
      }
    });

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
}
