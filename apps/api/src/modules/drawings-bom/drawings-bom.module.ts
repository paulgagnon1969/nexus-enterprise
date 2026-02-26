import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { DrawingsBomService } from "./drawings-bom.service";
import { DrawingsBomController } from "./drawings-bom.controller";
import { BomCabinetMatcherService } from "./bom-cabinet-matcher.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [DrawingsBomController],
  providers: [DrawingsBomService, BomCabinetMatcherService],
  exports: [DrawingsBomService, BomCabinetMatcherService],
})
export class DrawingsBomModule {}
