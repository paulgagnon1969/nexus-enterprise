import { Module } from "@nestjs/common";
import { DailyLogService } from "./daily-log.service";
import { DailyLogController, DailyLogFeedController } from "./daily-log.controller";
import { DailyLogAttachmentsController } from "./daily-log-attachments.controller";
import { PersonnelRosterController } from "./personnel-roster.controller";
import { TimeEntryController } from "./time-entry.controller";
import { JsaReminderService } from "./jsa-reminder.service";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuditService } from "../../common/audit.service";
import { EmailService } from "../../common/email.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaskService } from "../task/task.service";
import { OcrModule } from "../ocr/ocr.module";
import { WeatherModule } from "../weather/weather.module";

@Module({
  imports: [PrismaModule, NotificationsModule, OcrModule, WeatherModule],
  providers: [DailyLogService, AuditService, TaskService, JsaReminderService, EmailService],
  controllers: [DailyLogController, DailyLogFeedController, DailyLogAttachmentsController, PersonnelRosterController, TimeEntryController]
})
export class DailyLogModule {}
