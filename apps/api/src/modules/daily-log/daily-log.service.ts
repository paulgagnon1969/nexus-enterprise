import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateDailyLogDto } from "./dto/create-daily-log.dto";
import { Role, DailyLogStatus } from "@prisma/client";
import * as path from "node:path";
import * as fs from "node:fs";

@Injectable()
export class DailyLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
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
      },
    });

    const visibleLogs = logs.filter(l => this.canViewDailyLog(actor, l, project, companyId));

    return visibleLogs.map(l => ({
      ...l,
      notifyUserIdsJson: undefined,
      tagsJson: undefined,
      createdByUser: l.createdBy,
      createdBy: undefined,
    }));
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

    // For now, store files on local disk under a simple uploads directory.
    const uploadsRoot = path.resolve(process.cwd(), "uploads/daily-logs");
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    const ext = path.extname(file.originalname || "");
    const fileName = `${dailyLogId}-${Date.now()}${ext}`;
    const destPath = path.join(uploadsRoot, fileName);

    fs.writeFileSync(destPath, file.buffer);

    const publicUrl = `/uploads/daily-logs/${fileName}`;

    const attachment = await this.prisma.dailyLogAttachment.create({
      data: {
        dailyLogId,
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
    await this.assertProjectAccess(projectId, companyId, actor, Role.ADMIN);

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
        }
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

    const { createdBy, notifyUserIdsJson: _n, tagsJson: _t, ...rest } = created as any;

    return {
      ...rest,
      createdByUser: createdBy,
    };
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
