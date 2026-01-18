import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { LocationsService } from "./locations.service";
import { LocationsController } from "./locations.controller";
import { InventoryHoldingsController } from "./inventory-holdings.controller";

@Module({
  imports: [PrismaModule],
  providers: [LocationsService],
  controllers: [LocationsController, InventoryHoldingsController],
  exports: [LocationsService],
})
export class LocationsModule {}
