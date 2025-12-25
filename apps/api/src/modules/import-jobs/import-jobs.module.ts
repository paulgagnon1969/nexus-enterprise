import { Module } from "@nestjs/common";
import { ImportJobsService } from "./import-jobs.service";
import { ImportJobsController, ProjectImportJobsController } from "./import-jobs.controller";

@Module({
  providers: [ImportJobsService],
  controllers: [ProjectImportJobsController, ImportJobsController],
  exports: [ImportJobsService]
})
export class ImportJobsModule {}
