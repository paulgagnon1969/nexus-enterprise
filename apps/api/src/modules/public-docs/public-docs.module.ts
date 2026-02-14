import { Module } from "@nestjs/common";
import { PublicDocsService } from "./public-docs.service";
import {
  PublicPortalController,
  PublicDocsController,
  PublicManualsController,
  ShareLinksController,
  DocumentShareManagementController,
  ManualShareManagementController,
} from "./public-docs.controller";

@Module({
  controllers: [
    PublicPortalController,
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
