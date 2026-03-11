import { Module } from "@nestjs/common";
import { PublicDocsService } from "./public-docs.service";
import { ManualsModule } from "../manuals/manuals.module";
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
  imports: [ManualsModule],
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
