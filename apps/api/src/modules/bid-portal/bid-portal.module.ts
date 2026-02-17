import { Module } from "@nestjs/common";
import { BidPortalController } from "./bid-portal.controller";
import { BidPortalService } from "./bid-portal.service";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [BidPortalController],
  providers: [BidPortalService],
  exports: [BidPortalService],
})
export class BidPortalModule {}
