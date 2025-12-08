import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from "class-validator";
import { TaskStatus, TaskPriority } from "@prisma/client";

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
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
