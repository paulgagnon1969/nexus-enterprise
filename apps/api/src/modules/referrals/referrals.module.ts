import { Module } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { ReferralsController } from "./referrals.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { PersonalContactsService } from "../user/personal-contacts.service";
import { PersonalContactsController } from "../user/personal-contacts.controller";

@Module({
  imports: [PrismaModule],
  providers: [ReferralsService, PersonalContactsService],
  controllers: [ReferralsController, PersonalContactsController],
})
export class ReferralsModule {}
