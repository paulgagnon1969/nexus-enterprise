import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { LocationsService } from "./locations.service";
import { VendorLocationService } from "./vendor-location.service";
import { LocationsController } from "./locations.controller";
import { InventoryHoldingsController } from "./inventory-holdings.controller";

@Module({
  imports: [PrismaModule],
  providers: [LocationsService, VendorLocationService],
  controllers: [LocationsController, InventoryHoldingsController],
  exports: [LocationsService, VendorLocationService],
})
export class LocationsModule {}
