import { Module } from "@nestjs/common";
import { OshaSyncController } from "./osha-sync.controller";
import { OshaSyncService } from "./osha-sync.service";
import { PrismaModule } from "../../infra/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [OshaSyncController],
  providers: [OshaSyncService],
  exports: [OshaSyncService],
})
export class OshaSyncModule {}
