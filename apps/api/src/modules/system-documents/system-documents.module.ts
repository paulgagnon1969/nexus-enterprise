import { Module } from "@nestjs/common";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { SystemDocumentsService } from "./system-documents.service";
import {
  SystemDocumentsController,
  TenantSystemDocumentsController,
  TenantDocumentCopiesController,
} from "./system-documents.controller";
import { PublicationGroupsModule } from "../publication-groups/publication-groups.module";

@Module({
  imports: [PrismaModule, PublicationGroupsModule],
  controllers: [
    SystemDocumentsController,
    TenantSystemDocumentsController,
    TenantDocumentCopiesController,
  ],
  providers: [SystemDocumentsService],
  exports: [SystemDocumentsService],
})
export class SystemDocumentsModule {}
