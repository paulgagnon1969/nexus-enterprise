import { Module } from "@nestjs/common";
import { TenantDocumentsService } from "./tenant-documents.service";
import {
  TenantDocumentsController,
  TenantManualsController,
} from "./tenant-documents.controller";
import { DocumentsModule } from "../documents/documents.module";

@Module({
  imports: [DocumentsModule],
  controllers: [TenantDocumentsController, TenantManualsController],
  providers: [TenantDocumentsService],
  exports: [TenantDocumentsService],
})
export class TenantDocumentsModule {}
