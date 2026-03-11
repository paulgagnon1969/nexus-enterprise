import { Module } from "@nestjs/common";
import { CamDashboardController } from "./cam-dashboard.controller";
import { CamDashboardService } from "./cam-dashboard.service";
import { DocumentsModule } from "../documents/documents.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [DocumentsModule, CommonModule],
  controllers: [CamDashboardController],
  providers: [CamDashboardService],
})
export class CamDashboardModule {}
