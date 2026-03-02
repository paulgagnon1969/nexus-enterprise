import { Module } from "@nestjs/common";
import { NexCheckService } from "./nexcheck.service";
import {
  SitePassController,
  SiteDocumentController,
  KioskController,
  CheckInController,
  DelegationController,
  RosterController,
} from "./nexcheck.controller";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [NexCheckService],
  controllers: [
    SitePassController,
    SiteDocumentController,
    KioskController,
    CheckInController,
    DelegationController,
    RosterController,
  ],
  exports: [NexCheckService],
})
export class NexCheckModule {}
