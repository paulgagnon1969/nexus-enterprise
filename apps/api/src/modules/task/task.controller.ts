import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { TaskService } from "./task.service";
import { TaskEscalationService } from "./task-escalation.service";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateTaskDto, UpdateTaskStatusDto, UpdateTaskDto, DisposeTaskDto, AddTaskNoteDto, TaskPriorityEnum, TaskStatusEnum } from "./dto/task.dto";

@Controller("tasks")
export class TaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly escalation: TaskEscalationService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query("projectId") projectId?: string,
    @Query("status") status?: TaskStatusEnum,
    @Query("assigneeId") assigneeId?: string,
    @Query("priority") priority?: TaskPriorityEnum,
    @Query("overdueOnly") overdueOnly?: string,
    @Query("relatedEntityType") relatedEntityType?: string,
    @Query("relatedEntityId") relatedEntityId?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.listTasks(actor, {
      projectId,
      status,
      assigneeId,
      priority,
      overdueOnly: overdueOnly === "true",
      relatedEntityType,
      relatedEntityId,
    });
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Get("summary")
  summary(
    @Req() req: any,
    @Query("projectId") projectId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.getTaskSummary(actor, projectId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.updateTask(actor, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/dispose")
  dispose(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: DisposeTaskDto,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.disposeTask(actor, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/notes")
  addNote(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: AddTaskNoteDto,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.addTaskNote(actor, id, dto.note);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/activities")
  activities(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.tasks.getTaskActivities(actor, id);
  }

  /** On-demand escalation check (admin only). */
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post("escalate")
  async triggerEscalation() {
    await this.escalation.checkAndEscalateOverdueTasks();
    return { ok: true };
  }
}
