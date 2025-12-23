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
    }
  ) {
    const { projectId, status, assigneeId, priority, overdueOnly } = filters;

    const baseWhere: any = {
      companyId: actor.companyId,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(overdueOnly
        ? {
            dueDate: {
              lt: new Date()
            }
          }
        : {})
    };

    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return this.prisma.task.findMany({
        where: {
          ...baseWhere,
          ...(assigneeId ? { assigneeId } : {})
        }
      });
    }

    return this.prisma.task.findMany({
      where: {
        ...baseWhere,
        assigneeId: actor.userId
      }
    });
  }

  async createTask(actor: AuthenticatedUser, dto: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    priority?: TaskPriorityEnum;
    dueDate?: Date;
  }) {
    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new ForbiddenException("Only company OWNER or ADMIN can create tasks");
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: dto.projectId,
        companyId: actor.companyId
      }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
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
        assigneeId: dto.assigneeId ?? null
      }
    });

    await this.audit.log(actor, "TASK_CREATED", {
      companyId: actor.companyId,
      projectId: dto.projectId,
      metadata: { taskId: task.id, title: task.title }
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
