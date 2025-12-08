import { Module } from "@nestjs/common";
import { DailyLogService } from "./daily-log.service";
import { DailyLogController } from "./daily-log.controller";
import { DailyLogAttachmentsController } from "./daily-log-attachments.controller";

@Module({
  providers: [DailyLogService],
  controllers: [DailyLogController, DailyLogAttachmentsController]
})
export class DailyLogModule {}
