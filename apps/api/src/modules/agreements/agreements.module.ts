import { Module } from "@nestjs/common";
import { AgreementsService } from "./agreements.service";
import { TemplateImportService } from "./template-import.service";
import {
  AgreementsController,
  AgreementTemplatesController,
} from "./agreements.controller";

@Module({
  controllers: [AgreementTemplatesController, AgreementsController],
  providers: [AgreementsService, TemplateImportService],
  exports: [AgreementsService, TemplateImportService],
})
export class AgreementsModule {}
