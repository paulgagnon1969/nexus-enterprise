import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { TaskPriorityEnum, TaskStatusEnum } from "./dto/task.dto";
import { Role } from "@prisma/client";

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async listTasks(
    actor: AuthenticatedUser,
    filters: {
      projectId?: string;
      status?: TaskStatusEnum;
      assigneeId?: string;
      priority?: TaskPriorityEnum;
      overdueOnly?: boolean;
      relatedEntityType?: string;
      relatedEntityId?: string;
    }
  ) {
    const { projectId, status, assigneeId, priority, overdueOnly, relatedEntityType, relatedEntityId } = filters;

    const baseWhere: any = {
      companyId: actor.companyId,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(relatedEntityType ? { relatedEntityType } : {}),
      ...(relatedEntityId ? { relatedEntityId } : {}),
      ...(overdueOnly
        ? {
            dueDate: {
              lt: new Date()
            }
          }
        : {})
    };

    const include = {
      assignee: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      createdBy: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    };

    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return this.prisma.task.findMany({
        where: {
          ...baseWhere,
          ...(assigneeId ? { assigneeId } : {})
        },
        include,
        orderBy: { createdAt: "desc" },
      });
    }

    return this.prisma.task.findMany({
      where: {
        ...baseWhere,
        assigneeId: actor.userId
      },
      include,
      orderBy: { createdAt: "desc" },
    });
  }

  async createTask(actor: AuthenticatedUser, dto: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: TaskPriorityEnum;
    dueDate?: Date;
    relatedEntityType?: string;
    relatedEntityId?: string;
  }) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: dto.projectId,
        companyId: actor.companyId
      }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Verify project membership for non-admin users
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      const membership = await this.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: actor.userId,
            projectId: dto.projectId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenException("You do not have access to this project");
      }
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: "TODO",
        priority: dto.priority ?? TaskPriorityEnum.MEDIUM,
        dueDate: dto.dueDate ?? null,
        companyId: actor.companyId,
        projectId: dto.projectId,
        assigneeId: dto.assigneeId ?? null,
        createdByUserId: actor.userId,
        relatedEntityType: dto.relatedEntityType ?? null,
        relatedEntityId: dto.relatedEntityId ?? null,
      }
    });

    await this.audit.log(actor, "TASK_CREATED", {
      companyId: actor.companyId,
      projectId: dto.projectId,
      metadata: { taskId: task.id, title: task.title, relatedEntityType: dto.relatedEntityType, relatedEntityId: dto.relatedEntityId }
    });

    return task;
  }

  async updateStatus(
    actor: AuthenticatedUser,
    taskId: string,
    status: TaskStatusEnum
  ) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        companyId: actor.companyId
      }
    });

    if (!task) {
      throw new NotFoundException("Task not found in this company");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      // Allow assignee to update their own task
      if (task.assigneeId !== actor.userId) {
        throw new ForbiddenException("You cannot update this task");
      }
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status }
    });

    await this.audit.log(actor, "TASK_STATUS_UPDATED", {
      companyId: actor.companyId,
      projectId: task.projectId,
      userId: task.assigneeId ?? undefined,
      metadata: { taskId: task.id, from: task.status, to: status }
    });

    return updated;
  }
}
