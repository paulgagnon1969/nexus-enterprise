import { Module } from "@nestjs/common";
import { PricingController } from "./pricing.controller";

@Module({
  controllers: [PricingController],
})
export class PricingModule {}