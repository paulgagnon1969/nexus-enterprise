import { Module } from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ProjectController } from "./project.controller";
import { ImportJobsService } from "../import-jobs/import-jobs.service";

@Module({
  providers: [ProjectService, ImportJobsService],
  controllers: [ProjectController]
})
export class ProjectModule {}
