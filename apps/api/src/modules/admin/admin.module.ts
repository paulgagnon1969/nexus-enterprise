import { Module } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { AdminController } from "./admin.controller";
import { AuthModule } from "../auth/auth.module";
import { AnalyticsModule } from "../analytics/analytics.module";

@Module({
  imports: [AuthModule, AnalyticsModule],
  providers: [AdminService],
  controllers: [AdminController]
})
export class AdminModule {}
