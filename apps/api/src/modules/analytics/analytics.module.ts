import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";
import { ActivityTrackingInterceptor } from "./activity-tracking.interceptor";
import { NexIntService } from "./nexint.service";

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    NexIntService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityTrackingInterceptor,
    },
  ],
  exports: [AnalyticsService, NexIntService],
})
export class AnalyticsModule {}
