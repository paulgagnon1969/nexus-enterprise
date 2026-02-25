import { Module } from "@nestjs/common";
import { ReferralsService } from "./referrals.service";
import { ReferralsController } from "./referrals.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { PersonalContactsService } from "../user/personal-contacts.service";
import { PersonalContactsController } from "../user/personal-contacts.controller";
import { ContactsDirectoryService } from "../user/contacts-directory.service";
import { ContactsDirectoryController } from "../user/contacts-directory.controller";

@Module({
  imports: [PrismaModule],
  providers: [ReferralsService, PersonalContactsService, ContactsDirectoryService],
  controllers: [ReferralsController, PersonalContactsController, ContactsDirectoryController],
})
export class ReferralsModule {}
