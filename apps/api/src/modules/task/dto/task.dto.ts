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
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatusEnum)
  status!: TaskStatusEnum;
}
