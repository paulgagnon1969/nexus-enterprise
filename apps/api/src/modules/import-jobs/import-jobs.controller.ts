import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { ImportJobsService } from "./import-jobs.service";
import { CreateXactComponentsAllocationJobDto, CreateXactComponentsImportJobDto, CreateXactRawImportJobDto } from "./dto/import-jobs.dto";
import { ImportJobType } from "@prisma/client";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

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

  @Roles(Role.OWNER, Role.ADMIN)
  @Post("xact-components/allocate")
  async enqueueXactComponentsAllocation(
    @Req() req: any,
    @Param("projectId") projectId: string,
    @Body() dto: CreateXactComponentsAllocationJobDto,
  ) {
    const user = req.user as AuthenticatedUser;

    const job = await this.jobs.createJob({
      companyId: user.companyId,
      projectId,
      createdByUserId: user.userId,
      type: ImportJobType.XACT_COMPONENTS_ALLOCATE,
      estimateVersionId: dto.estimateVersionId,
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

  @Roles(Role.OWNER, Role.ADMIN)
  @Post("bia-lcp")
  async enqueueBiaLcp(@Req() req: FastifyRequest) {
    const user = (req as any).user as AuthenticatedUser;

    const parts = (req as any).files
      ? (req as any).files()
      : (async function* () {})();

    const baseTmpDir = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
    const biaDir = path.join(baseTmpDir, "ncc_uploads", "bia_lcp");
    await fs.promises.mkdir(biaDir, { recursive: true });

    const savedFiles: string[] = [];

    for await (const part of parts as any) {
      if (!part.file || (part.fieldname && part.fieldname !== "files")) {
        continue;
      }

      const safeName = (part.filename || "upload.csv").replace(/[^a-zA-Z0-9_.-]/g, "_");
      const dest = path.join(
        biaDir,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await fs.promises.writeFile(dest, Buffer.concat(chunks));
      savedFiles.push(dest);
    }

    if (savedFiles.length === 0) {
      throw new BadRequestException("At least one CSV file is required for BIA LCP import.");
    }

    const job = await this.jobs.createJob({
      companyId: user.companyId,
      projectId: undefined,
      createdByUserId: user.userId,
      type: ImportJobType.BIA_LCP,
      csvPath: biaDir,
    });

    return { jobId: job.id, savedFiles };
  }

  @Roles(Role.OWNER, Role.ADMIN)
  @Post("fortified-payroll-admin")
  async enqueueFortifiedPayrollAdmin(@Req() req: FastifyRequest) {
    const user = (req as any).user as AuthenticatedUser;

    const parts = (req as any).files
      ? (req as any).files()
      : (async function* () {})();

    const baseTmpDir = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
    const importDir = path.join(baseTmpDir, "ncc_uploads", "fortified_payroll_admin");
    await fs.promises.mkdir(importDir, { recursive: true });

    let savedFile: string | null = null;

    for await (const part of parts as any) {
      if (!part.file || (part.fieldname && part.fieldname !== "file" && part.fieldname !== "files")) {
        continue;
      }

      if (savedFile) {
        throw new BadRequestException("Only one CSV file is allowed for this import.");
      }

      const safeName = (part.filename || "upload.csv").replace(/[^a-zA-Z0-9_.-]/g, "_");
      const dest = path.join(
        importDir,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`,
      );

      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      await fs.promises.writeFile(dest, Buffer.concat(chunks));
      savedFile = dest;
    }

    if (!savedFile) {
      throw new BadRequestException("A CSV file is required for the Fortified payroll admin import.");
    }

    const job = await this.jobs.createJob({
      companyId: user.companyId,
      projectId: undefined,
      createdByUserId: user.userId,
      type: "FORTIFIED_PAYROLL_ADMIN" as ImportJobType,
      csvPath: savedFile,
    });

    return { jobId: job.id, savedFile };
  }

  @Get("xact-components/report")
  async xactComponentsReport(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.jobs.getXactComponentsIngestionReport(user.companyId);
  }

  @Get(":jobId")
  async getOne(@Req() req: any, @Param("jobId") jobId: string) {
    const user = req.user as AuthenticatedUser;
    return this.jobs.getJob(jobId, user.companyId);
  }
}
