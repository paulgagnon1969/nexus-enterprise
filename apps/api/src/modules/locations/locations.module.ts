import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { LocationsService } from "./locations.service";
import { VendorLocationService } from "./vendor-location.service";
import { TransitCostService } from "./transit-cost.service";
import { LocationsController } from "./locations.controller";
import { InventoryHoldingsController } from "./inventory-holdings.controller";
import { MaterialLotTransitController } from "./material-lot-transit.controller";

@Module({
  imports: [PrismaModule],
  providers: [LocationsService, VendorLocationService, TransitCostService],
  controllers: [LocationsController, InventoryHoldingsController, MaterialLotTransitController],
  exports: [LocationsService, VendorLocationService, TransitCostService],
})
export class LocationsModule {}
