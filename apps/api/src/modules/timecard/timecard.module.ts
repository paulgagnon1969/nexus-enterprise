import { Module } from "@nestjs/common";
import { TimecardService } from "./timecard.service";
import { TimecardController } from "./timecard.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [TimecardService],
  controllers: [TimecardController],
})
export class TimecardModule {}
