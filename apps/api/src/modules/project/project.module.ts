import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { ImportJobsService } from "../import-jobs/import-jobs.service";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";

@Module({
  providers: [ProjectService, ImportJobsService, TaxJurisdictionService],
  controllers: [ProjectController]
})
export class ProjectModule {}
