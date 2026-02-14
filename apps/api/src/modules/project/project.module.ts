import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { ImportJobsService } from "../import-jobs/import-jobs.service";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";
import { TenantClientService } from "./tenant-client.service";
import { TenantClientController } from "./tenant-client.controller";

@Module({
  providers: [ProjectService, ImportJobsService, TaxJurisdictionService, TenantClientService],
  controllers: [ProjectController, TenantClientController]
})
export class ProjectModule {}
