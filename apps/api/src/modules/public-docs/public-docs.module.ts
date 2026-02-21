import { Module } from "@nestjs/common";
import { PublicDocsService } from "./public-docs.service";
import {
  PublicPortalController,
  PublicDocsController,
  PublicManualsController,
  ShareLinksController,
  DocumentShareManagementController,
  ManualShareManagementController,
  SecureDocumentShareController,
  ReaderGroupController,
} from "./public-docs.controller";

@Module({
  controllers: [
    PublicPortalController,
    PublicDocsController,
    PublicManualsController,
    ShareLinksController,
    DocumentShareManagementController,
    ManualShareManagementController,
    SecureDocumentShareController,
    ReaderGroupController,
  ],
  providers: [PublicDocsService],
  exports: [PublicDocsService],
})
export class PublicDocsModule {}
