import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { ReferralsService } from "./referrals.service";
import { ReferralsController } from "./referrals.controller";

@Module({
  imports: [PrismaModule],
  providers: [ReferralsService],
  controllers: [ReferralsController],
})
export class ReferralsModule {}
