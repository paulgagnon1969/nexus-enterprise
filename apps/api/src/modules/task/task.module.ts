import { Module } from "@nestjs/common";
import { TaskService } from "./task.service";
import { TaskEscalationService } from "./task-escalation.service";
import { TaskController } from "./task.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  providers: [TaskService, TaskEscalationService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
