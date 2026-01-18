import { Module } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { XactScheduleService } from "./xact-schedule.service";
import { XactScheduleController } from "./xact-schedule.controller";

@Module({
  providers: [PrismaService, XactScheduleService],
  controllers: [XactScheduleController],
  exports: [XactScheduleService],
})
export class XactScheduleModule {}