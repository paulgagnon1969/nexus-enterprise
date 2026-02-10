import { Module } from "@nestjs/common";
import { TimecardService } from "./timecard.service";
import { TimecardController } from "./timecard.controller";
import { TimecardMobileController } from "./timecard-mobile.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [TimecardService],
  controllers: [TimecardController, TimecardMobileController],
})
export class TimecardModule {}
