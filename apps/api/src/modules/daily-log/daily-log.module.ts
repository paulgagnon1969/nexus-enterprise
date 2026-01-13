import { Module } from "@nestjs/common";
import { DailyLogService } from "./daily-log.service";
import { DailyLogController } from "./daily-log.controller";
import { DailyLogAttachmentsController } from "./daily-log-attachments.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuditService } from "../../common/audit.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaskService } from "../task/task.service";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [DailyLogService, AuditService, TaskService],
  controllers: [DailyLogController, DailyLogAttachmentsController]
})
export class DailyLogModule {}
