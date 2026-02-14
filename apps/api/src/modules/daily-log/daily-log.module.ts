import { Module } from "@nestjs/common";
import { DailyLogService } from "./daily-log.service";
import { DailyLogController, DailyLogFeedController } from "./daily-log.controller";
import { DailyLogAttachmentsController } from "./daily-log-attachments.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuditService } from "../../common/audit.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaskService } from "../task/task.service";
import { OcrModule } from "../ocr/ocr.module";

@Module({
  imports: [PrismaModule, NotificationsModule, OcrModule],
  providers: [DailyLogService, AuditService, TaskService],
  controllers: [DailyLogController, DailyLogFeedController, DailyLogAttachmentsController]
})
export class DailyLogModule {}
