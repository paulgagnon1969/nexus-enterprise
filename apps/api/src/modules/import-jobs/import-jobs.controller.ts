import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { ImportJobsService } from "./import-jobs.service";
import { CreateXactComponentsImportJobDto, CreateXactRawImportJobDto } from "./dto/import-jobs.dto";
import { ImportJobType } from "@prisma/client";

@UseGuards(JwtAuthGuard)
@Controller("projects/:projectId/import-jobs")
export class ProjectImportJobsController {
  constructor(private readonly jobs: ImportJobsService) {}

  @Roles(Role.OWNER, Role.ADMIN)
  @Post("xact-raw")
  async enqueueXactRaw(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateXactRawImportJobDto
  ) {
    const user = req.user as AuthenticatedUser;

    const job = await this.jobs.createJob({
      companyId: user.companyId,
      projectId,
      createdByUserId: user.userId,
      type: ImportJobType.XACT_RAW,
      csvPath: dto.csvPath
    });

    return { jobId: job.id };
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post("xact-components")
  async enqueueXactComponents(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateXactComponentsImportJobDto
  ) {
    const user = req.user as AuthenticatedUser;

    const job = await this.jobs.createJob({
      companyId: user.companyId,
      projectId,
      createdByUserId: user.userId,
      type: ImportJobType.XACT_COMPONENTS,
      csvPath: dto.csvPath,
      estimateVersionId: dto.estimateVersionId
    });

    return { jobId: job.id };
  }

  @Get()
  async listForProject(@Req() req: any, @Param("projectId") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.jobs.listJobsForProject(projectId, user.companyId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller("import-jobs")
export class ImportJobsController {
  constructor(private readonly jobs: ImportJobsService) {}

  @Get("pending")
  async pending(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.jobs.summarizePendingForCompany(user.companyId);
  }

  @Get(":jobId")
  async getOne(@Req() req: any, @Param("jobId") jobId: string) {
    const user = req.user as AuthenticatedUser;
    return this.jobs.getJob(jobId, user.companyId);
  }
}
