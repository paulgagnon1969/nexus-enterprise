import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { DrawingsBomService } from "./drawings-bom.service";
import { DrawingsBomController } from "./drawings-bom.controller";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [DrawingsBomController],
  providers: [DrawingsBomService],
  exports: [DrawingsBomService],
})
export class DrawingsBomModule {}
