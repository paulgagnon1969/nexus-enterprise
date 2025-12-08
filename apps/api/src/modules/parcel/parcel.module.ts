import { Module } from "@nestjs/common";
import { ParcelService } from "./parcel.service";
import { ParcelController } from "./parcel.controller";

@Module({
  providers: [ParcelService],
  controllers: [ParcelController]
})
export class ParcelModule {}
