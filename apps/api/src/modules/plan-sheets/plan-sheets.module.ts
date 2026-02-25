import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { PlanSheetsService } from "./plan-sheets.service";
import { PlanSheetsController, PlanSheetImagesController } from "./plan-sheets.controller";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [PlanSheetsController, PlanSheetImagesController],
  providers: [PlanSheetsService],
  exports: [PlanSheetsService],
})
export class PlanSheetsModule {}
