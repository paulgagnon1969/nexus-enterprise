import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AnalyticsService } from "./analytics.service";
import { ActivityTrackingInterceptor } from "./activity-tracking.interceptor";

@Module({
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
