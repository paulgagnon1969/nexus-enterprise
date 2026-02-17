import { Module } from "@nestjs/common";
import { BidRequestController } from "./bid-request.controller";
import { BidRequestService } from "./bid-request.service";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [BidRequestController],
  providers: [BidRequestService],
  exports: [BidRequestService],
})
export class BidRequestModule {}
