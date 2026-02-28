import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AssetRepository } from "../../infra/prisma-v1/asset.repository";
import { MaintenancePoolRepository } from "../../infra/prisma-v1/maintenance-pool.repository";
import { AssetDeploymentService } from "./asset-deployment.service";
import { AssetMaintenanceService } from "./asset-maintenance.service";
import { AssetScanService } from "./asset-scan.service";
import { AssetController, AssetUsageController } from "./asset.controller";
import { AssetScanController } from "./asset-scan.controller";
import {
  MaintenanceTemplateController,
  MaintenanceTodoController,
  AssetMaintenanceController,
} from "./asset-maintenance.controller";
import { MaintenancePoolController } from "./maintenance-pool.controller";
import { LocationsModule } from "../locations/locations.module";

@Module({
  imports: [PrismaModule, ConfigModule, LocationsModule],
  providers: [AssetRepository, MaintenancePoolRepository, AssetDeploymentService, AssetMaintenanceService, AssetScanService],
  controllers: [
    AssetController,
    AssetScanController,
    AssetUsageController,
    MaintenanceTemplateController,
    MaintenanceTodoController,
    AssetMaintenanceController,
    MaintenancePoolController,
  ],
  exports: [AssetRepository, MaintenancePoolRepository, AssetDeploymentService, AssetMaintenanceService, AssetScanService],
})
export class AssetModule {}
