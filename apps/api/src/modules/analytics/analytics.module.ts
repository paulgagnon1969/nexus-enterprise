import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./analytics.controller";
import { ActivityTrackingInterceptor } from "./activity-tracking.interceptor";

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityTrackingInterceptor,
    },
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
