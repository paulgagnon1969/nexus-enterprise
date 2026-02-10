import { Module } from "@nestjs/common";
import { ClaimJournalService } from "./claim-journal.service";
import { CarrierContactsController, JournalEntriesController } from "./claim-journal.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [ClaimJournalService],
  controllers: [CarrierContactsController, JournalEntriesController],
  exports: [ClaimJournalService],
})
export class ClaimJournalModule {}
