import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { ImportJobsService } from "../import-jobs/import-jobs.service";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";
import { TenantClientService } from "./tenant-client.service";
import { TenantClientController } from "./tenant-client.controller";
import { OrgTemplateService } from "./org-template.service";
import { OrgTemplateController } from "./org-template.controller";
import { SupplierCatalogModule } from "../supplier-catalog/supplier-catalog.module";
import { NotificationsService } from "../notifications/notifications.service";

@Module({
  imports: [SupplierCatalogModule],
  providers: [ProjectService, ImportJobsService, TaxJurisdictionService, TenantClientService, OrgTemplateService, NotificationsService],
  controllers: [ProjectController, TenantClientController, OrgTemplateController]
})
export class ProjectModule {}
