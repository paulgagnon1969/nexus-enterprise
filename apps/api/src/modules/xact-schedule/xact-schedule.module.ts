import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { XactScheduleService } from "./xact-schedule.service";
import { XactScheduleController } from "./xact-schedule.controller";

@Module({
  imports: [PrismaModule],
  providers: [XactScheduleService],
  controllers: [XactScheduleController],
  exports: [XactScheduleService],
})
export class XactScheduleModule {}
