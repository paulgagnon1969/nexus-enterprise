import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AssetRepository } from "../../infra/prisma-v1/asset.repository";
import { AssetDeploymentService } from "./asset-deployment.service";
import { AssetMaintenanceService } from "./asset-maintenance.service";
import { AssetController, AssetUsageController } from "./asset.controller";
import {
  MaintenanceTemplateController,
  MaintenanceTodoController,
  AssetMaintenanceController,
} from "./asset-maintenance.controller";
import { LocationsModule } from "../locations/locations.module";

@Module({
  imports: [PrismaModule, LocationsModule],
  providers: [AssetRepository, AssetDeploymentService, AssetMaintenanceService],
  controllers: [
    AssetController,
    AssetUsageController,
    MaintenanceTemplateController,
    MaintenanceTodoController,
    AssetMaintenanceController,
  ],
  exports: [AssetRepository, AssetDeploymentService, AssetMaintenanceService],
})
export class AssetModule {}
