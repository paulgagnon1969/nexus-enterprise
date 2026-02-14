import { Module } from "@nestjs/common";
import { PublicDocsService } from "./public-docs.service";
import {
  PublicDocsController,
  PublicManualsController,
  ShareLinksController,
  DocumentShareManagementController,
  ManualShareManagementController,
} from "./public-docs.controller";

@Module({
  controllers: [
    PublicDocsController,
    PublicManualsController,
    ShareLinksController,
    DocumentShareManagementController,
    ManualShareManagementController,
  ],
  providers: [PublicDocsService],
  exports: [PublicDocsService],
})
export class PublicDocsModule {}
