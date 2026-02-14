import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { SopAdminController } from "./sop-admin.controller";
import { SopSyncService } from "./sop-sync.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DocumentsController, SopAdminController],
  providers: [DocumentsService, SopSyncService],
  exports: [SopSyncService],
})
export class DocumentsModule {}
