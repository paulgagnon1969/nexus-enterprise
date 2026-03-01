import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AssetRepository } from "../../infra/prisma-v1/asset.repository";
import { MaintenancePoolRepository } from "../../infra/prisma-v1/maintenance-pool.repository";
import { AssetDeploymentService } from "./asset-deployment.service";
import { AssetMaintenanceService } from "./asset-maintenance.service";
import { AssetScanService } from "./asset-scan.service";
import { PlacardService } from "./placard.service";
import { AssetController, AssetUsageController } from "./asset.controller";
import { AssetScanController } from "./asset-scan.controller";
import { PlacardController } from "./placard.controller";
import {
  MaintenanceTemplateController,
  MaintenanceTodoController,
  AssetMaintenanceController,
} from "./asset-maintenance.controller";
import { MaintenancePoolController } from "./maintenance-pool.controller";
import { LocationsModule } from "../locations/locations.module";

@Module({
  imports: [PrismaModule, ConfigModule, LocationsModule],
  providers: [AssetRepository, MaintenancePoolRepository, AssetDeploymentService, AssetMaintenanceService, AssetScanService, PlacardService],
  controllers: [
    AssetController,
    AssetScanController,
    AssetUsageController,
    PlacardController,
    MaintenanceTemplateController,
    MaintenanceTodoController,
    AssetMaintenanceController,
    MaintenancePoolController,
  ],
  exports: [AssetRepository, MaintenancePoolRepository, AssetDeploymentService, AssetMaintenanceService, AssetScanService, PlacardService],
})
export class AssetModule {}
