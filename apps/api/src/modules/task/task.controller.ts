import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { TaskService } from "./task.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { Roles } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateTaskDto, UpdateTaskStatusDto, TaskPriorityEnum, TaskStatusEnum } from "./dto/task.dto";
import { Role } from "@prisma/client";

@Controller("tasks")
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query("projectId") projectId?: string,
    @Query("status") status?: TaskStatusEnum,
    @Query("assigneeId") assigneeId?: string,
    @Query("priority") priority?: TaskPriorityEnum,
    @Query("overdueOnly") overdueOnly?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.listTasks(actor, {
      projectId,
      status,
      assigneeId,
      priority,
      overdueOnly: overdueOnly === "true"
    });
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  create(@Req() req: any, @Body() dto: CreateTaskDto) {
    const actor = req.user as AuthenticatedUser;

    const mapped = {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
    };

    return this.tasks.createTask(actor, mapped);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateTaskStatusDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.updateStatus(actor, id, dto.status);
  }
}
