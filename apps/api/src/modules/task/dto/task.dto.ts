import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";

// Local enums to avoid depending on generated Prisma enum exports in build environments
export enum TaskStatusEnum {
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  BLOCKED = "BLOCKED",
  DONE = "DONE",
}

export enum TaskPriorityEnum {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum TaskDispositionEnum {
  NONE = "NONE",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  REASSIGNED = "REASSIGNED",
}

export class CreateTaskDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(TaskPriorityEnum)
  priority?: TaskPriorityEnum;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatusEnum)
  status!: TaskStatusEnum;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsEnum(TaskStatusEnum)
  status?: TaskStatusEnum;

  @IsOptional()
  @IsEnum(TaskPriorityEnum)
  priority?: TaskPriorityEnum;

  @IsOptional()
  @IsISO8601()
  dueDate?: string | null;
}

export class DisposeTaskDto {
  @IsEnum(TaskDispositionEnum)
  disposition!: TaskDispositionEnum;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class AddTaskNoteDto {
  @IsString()
  note!: string;
}
