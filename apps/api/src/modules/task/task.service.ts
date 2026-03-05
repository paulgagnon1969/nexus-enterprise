import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { PushService } from "../notifications/push.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { TaskPriorityEnum, TaskStatusEnum, TaskDispositionEnum, DisposeTaskDto, UpdateTaskDto } from "./dto/task.dto";
import { Role } from "@prisma/client";

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  /** Shared include clause for task queries — includes group members. */
  private get taskInclude() {
    return {
      assignee: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      createdBy: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      completedBy: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
      project: {
        select: { id: true, name: true },
      },
      groupMembers: {
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      },
    };
  }

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

    if (actor.role === Role.OWNER || actor.role === Role.ADMIN) {
      return this.prisma.task.findMany({
        where: {
          ...baseWhere,
          ...(assigneeId ? { assigneeId } : {})
        },
        include: this.taskInclude,
        orderBy: { createdAt: "desc" },
      });
    }

    // Non-admin: show tasks where user is direct assignee OR a group member
    return this.prisma.task.findMany({
      where: {
        ...baseWhere,
        OR: [
          { assigneeId: actor.userId },
          { groupMembers: { some: { userId: actor.userId } } },
        ],
      },
      include: this.taskInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async createTask(actor: AuthenticatedUser, dto: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string;
    assigneeIds?: string[];
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

    // Determine assignment mode:
    // - assigneeIds (2+) → group task (assigneeId=null, create TaskGroupMember rows)
    // - assigneeIds (1) or assigneeId → single-assignee task
    const groupIds = dto.assigneeIds?.filter(Boolean) ?? [];
    const isGroup = groupIds.length > 1;
    const singleAssigneeId = isGroup ? null : (groupIds[0] ?? dto.assigneeId ?? null);

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        status: "TODO",
        priority: dto.priority ?? TaskPriorityEnum.MEDIUM,
        dueDate: dto.dueDate ?? null,
        companyId: actor.companyId,
        projectId: dto.projectId,
        assigneeId: singleAssigneeId,
        createdByUserId: actor.userId,
        relatedEntityType: dto.relatedEntityType ?? null,
        relatedEntityId: dto.relatedEntityId ?? null,
        // Create group member rows in the same transaction
        ...(isGroup
          ? {
              groupMembers: {
                createMany: {
                  data: groupIds.map((userId) => ({ userId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: this.taskInclude,
    });

    // Activity log
    await this.prisma.taskActivity.create({
      data: {
        taskId: task.id,
        actorUserId: actor.userId,
        action: "CREATED",
        newValue: task.title,
      },
    });

    await this.audit.log(actor, "TASK_CREATED", {
      companyId: actor.companyId,
      projectId: dto.projectId,
      metadata: { taskId: task.id, title: task.title, isGroup, memberCount: groupIds.length, relatedEntityType: dto.relatedEntityType, relatedEntityId: dto.relatedEntityId }
    });

    return task;
  }

  /** Check if actor can act on a task (is assignee, group member, creator, or admin). */
  private async canActOnTask(actor: AuthenticatedUser, task: { assigneeId: string | null; createdByUserId: string | null; id: string }): Promise<boolean> {
    if (actor.role === "OWNER" || actor.role === "ADMIN") return true;
    if (task.assigneeId === actor.userId) return true;
    if (task.createdByUserId === actor.userId) return true;
    // Check group membership
    const member = await this.prisma.taskGroupMember.findUnique({
      where: { TaskGroupMember_task_user_key: { taskId: task.id, userId: actor.userId } },
    });
    return !!member;
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

    if (!(await this.canActOnTask(actor, task))) {
      throw new ForbiddenException("You cannot update this task");
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        // Record who completed the task (works for both single and group tasks)
        ...(status === "DONE" ? { completedByUserId: actor.userId } : {}),
        // Clear completedBy when reopened
        ...(task.status === "DONE" && status !== "DONE" ? { completedByUserId: null } : {}),
      },
      include: this.taskInclude,
    });

    // Activity log
    const action = status === "DONE" ? "COMPLETED" : (task.status === "DONE" ? "REOPENED" : "STATUS_CHANGED");
    await this.prisma.taskActivity.create({
      data: {
        taskId: task.id,
        actorUserId: actor.userId,
        action,
        previousValue: task.status,
        newValue: status,
      },
    });

    // Notify originator when task is reopened
    if (action === "REOPENED" && task.createdByUserId && task.createdByUserId !== actor.userId) {
      await this.notifyOriginator(task.createdByUserId, task.companyId, task.projectId, task.id, `Task "${task.title}" was reopened`);
    }

    await this.audit.log(actor, "TASK_STATUS_UPDATED", {
      companyId: actor.companyId,
      projectId: task.projectId,
      userId: task.assigneeId ?? undefined,
      metadata: { taskId: task.id, from: task.status, to: status }
    });

    return updated;
  }

  async updateTask(actor: AuthenticatedUser, taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId: actor.companyId },
    });

    if (!task) {
      throw new NotFoundException("Task not found in this company");
    }

    if (!(await this.canActOnTask(actor, task))) {
      throw new ForbiddenException("You cannot update this task");
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: this.taskInclude,
    });

    // Activity log for reassignment
    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      await this.prisma.taskActivity.create({
        data: {
          taskId: task.id,
          actorUserId: actor.userId,
          action: "REASSIGNED",
          previousValue: task.assigneeId ?? undefined,
          newValue: dto.assigneeId ?? undefined,
        },
      });
    }

    await this.audit.log(actor, "TASK_UPDATED", {
      companyId: actor.companyId,
      projectId: task.projectId,
      userId: task.assigneeId ?? undefined,
      metadata: { taskId: task.id, changes: dto },
    });

    return updated;
  }

  /**
   * Dashboard summary: count tasks by urgency bucket for a project.
   * - overdue: past dueDate, not DONE
   * - dueNow: due today, not DONE
   * - comingDue: due within next 7 days, not DONE
   * - total: all non-DONE tasks
   */
  async getTaskSummary(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<{ overdue: number; dueNow: number; comingDue: number; total: number }> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysOut = new Date(endOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    const baseWhere: any = {
      companyId: actor.companyId,
      projectId,
      status: { not: 'DONE' },
    };

    const [overdue, dueNow, comingDue, total] = await Promise.all([
      this.prisma.task.count({
        where: { ...baseWhere, dueDate: { lt: startOfToday } },
      }),
      this.prisma.task.count({
        where: { ...baseWhere, dueDate: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.task.count({
        where: { ...baseWhere, dueDate: { gte: endOfToday, lt: sevenDaysOut } },
      }),
      this.prisma.task.count({ where: baseWhere }),
    ]);

    return { overdue, dueNow, comingDue, total };
  }

  // ── Disposition workflow ──────────────────────────────────────────

  async disposeTask(actor: AuthenticatedUser, taskId: string, dto: DisposeTaskDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId: actor.companyId },
    });
    if (!task) throw new NotFoundException("Task not found in this company");

    if (!(await this.canActOnTask(actor, task))) {
      throw new ForbiddenException("You cannot dispose this task");
    }

    const data: any = {
      disposition: dto.disposition,
      dispositionNote: dto.note ?? null,
      dispositionAt: new Date(),
      dispositionByUserId: actor.userId,
    };

    // Side effects per disposition
    if (dto.disposition === TaskDispositionEnum.REJECTED) {
      data.status = "TODO"; // send back to originator
    }
    if (dto.disposition === TaskDispositionEnum.REASSIGNED && dto.assigneeId) {
      data.assigneeId = dto.assigneeId;
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: this.taskInclude,
    });

    // Activity log
    await this.prisma.taskActivity.create({
      data: {
        taskId: task.id,
        actorUserId: actor.userId,
        action: "DISPOSITION_SET",
        note: dto.note,
        previousValue: task.disposition,
        newValue: dto.disposition,
      },
    });

    // If reassigned, also log the reassignment
    if (dto.disposition === TaskDispositionEnum.REASSIGNED && dto.assigneeId) {
      await this.prisma.taskActivity.create({
        data: {
          taskId: task.id,
          actorUserId: actor.userId,
          action: "REASSIGNED",
          previousValue: task.assigneeId ?? undefined,
          newValue: dto.assigneeId,
        },
      });
    }

    // Notify the originator (feedback loop)
    if (task.createdByUserId && task.createdByUserId !== actor.userId) {
      const label = dto.disposition === TaskDispositionEnum.APPROVED
        ? "approved"
        : dto.disposition === TaskDispositionEnum.REJECTED
          ? "rejected"
          : "reassigned";
      const body = dto.note
        ? `Task "${task.title}" was ${label}. Note: ${dto.note}`
        : `Task "${task.title}" was ${label}.`;
      await this.notifyOriginator(task.createdByUserId, task.companyId, task.projectId, task.id, body);
    }

    await this.audit.log(actor, "TASK_DISPOSITION", {
      companyId: actor.companyId,
      projectId: task.projectId,
      metadata: { taskId: task.id, disposition: dto.disposition, note: dto.note },
    });

    return updated;
  }

  // ── Notes ─────────────────────────────────────────────────────────

  async addTaskNote(actor: AuthenticatedUser, taskId: string, note: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId: actor.companyId },
    });
    if (!task) throw new NotFoundException("Task not found in this company");

    const activity = await this.prisma.taskActivity.create({
      data: {
        taskId,
        actorUserId: actor.userId,
        action: "NOTE_ADDED",
        note,
      },
      include: {
        actor: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    return activity;
  }

  // ── Activity log ──────────────────────────────────────────────────

  async getTaskActivities(actor: AuthenticatedUser, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId: actor.companyId },
    });
    if (!task) throw new NotFoundException("Task not found in this company");

    return this.prisma.taskActivity.findMany({
      where: { taskId },
      include: {
        actor: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async notifyOriginator(
    originatorUserId: string,
    companyId: string,
    projectId: string,
    taskId: string,
    body: string,
  ) {
    try {
      // In-app notification
      await this.prisma.notification.create({
        data: {
          userId: originatorUserId,
          companyId,
          projectId,
          kind: "TASK_DISPOSITION",
          channel: "IN_APP",
          title: "Task Update",
          body,
          metadata: { taskId },
        },
      });

      // Push notification
      await this.push.sendToUsers([originatorUserId], {
        title: "Task Update",
        body,
        data: { taskId, screen: "todos" },
      });
    } catch (err) {
      this.logger.warn(`Failed to notify originator ${originatorUserId}: ${err}`);
    }
  }
}
