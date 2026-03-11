import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { InvoicePaymentService } from "./invoice-payment.service";
import { InvoiceActivityService } from "./invoice-activity.service";
import { InvoicePaymentController } from "./invoice-payment.controller";
import { ProjectController } from "./project.controller";
import { ImportJobsService } from "../import-jobs/import-jobs.service";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";
import { TenantClientService } from "./tenant-client.service";
import { TenantClientController } from "./tenant-client.controller";
import { OrgTemplateService } from "./org-template.service";
import { OrgTemplateController } from "./org-template.controller";
import { ProjectCollaborationService } from "./project-collaboration.service";
import { ProjectCollaborationController, CollaborationPortalController } from "./project-collaboration.controller";
import { SupplierCatalogModule } from "../supplier-catalog/supplier-catalog.module";
import { NotificationsService } from "../notifications/notifications.service";
import { GeocodingModule } from "../geocoding/geocoding.module";
import { NexfindModule } from "../nexfind/nexfind.module";

@Module({
  imports: [SupplierCatalogModule, GeocodingModule, NexfindModule],
  providers: [ProjectService, InvoicePaymentService, InvoiceActivityService, ImportJobsService, TaxJurisdictionService, TenantClientService, OrgTemplateService, ProjectCollaborationService, NotificationsService],
  controllers: [ProjectController, InvoicePaymentController, TenantClientController, OrgTemplateController, ProjectCollaborationController, CollaborationPortalController],
  exports: [ProjectCollaborationService, InvoicePaymentService],
})
export class ProjectModule {}
