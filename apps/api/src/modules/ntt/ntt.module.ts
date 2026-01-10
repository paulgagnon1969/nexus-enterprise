import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { NttController } from "./ntt.controller";
import { NttService } from "./ntt.service";
import { NttTicketReadGuard, NttTicketManageGuard } from "./ntt.guards";

@Module({
  imports: [PrismaModule],
  controllers: [NttController],
  providers: [NttService, NttTicketReadGuard, NttTicketManageGuard],
  exports: [NttService],
})
export class NttModule {}
