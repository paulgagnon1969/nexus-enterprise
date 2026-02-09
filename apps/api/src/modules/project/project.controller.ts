import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  Query
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";
import { ProjectService } from "./project.service";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateProjectDto, AddProjectMemberDto, ImportXactDto, ImportXactComponentsDto, UpdateProjectDto } from "./dto/project.dto";
import {
  AddInvoiceLineItemDto,
  ApplyInvoiceToInvoiceDto,
  ApplyPaymentToInvoiceDto,
  CreateOrGetDraftInvoiceDto,
  IssueInvoiceDto,
  RecordInvoicePaymentDto,
  RecordProjectPaymentDto,
  UpdateInvoiceLineItemDto,
  UpdateInvoicePetlLineDto,
} from "./dto/project-invoice.dto";
import {
  AttachProjectBillFileDto,
  CreateProjectBillDto,
  UpdateProjectBillDto,
} from "./dto/project-bill.dto";
import { CreateProjectPetlArchiveDto } from "./dto/project-petl-archive.dto";
import { ImportJobsService } from "../import-jobs/import-jobs.service";
import { ImportJobType } from "@prisma/client";
import { GcsService } from "../../infra/storage/gcs.service";
import { TaxJurisdictionService } from "./tax-jurisdiction.service";
import fs from "node:fs/promises";
import {
  buildCertifiedPayrollRows,
  buildCertifiedPayrollCsv,
  buildSourcesForProjectWeek,
  CertifiedPayrollSource,
} from "@repo/database";

function normalizeQueryStringArray(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  const cleaned = arr
    .map((v) => String(v ?? "").trim())
    .filter((v) => !!v);
  return cleaned.length ? cleaned : undefined;
}

@Controller("projects")
export class ProjectController {
  constructor(
    private readonly projects: ProjectService,
    private readonly importJobs: ImportJobsService,
    private readonly gcs: GcsService,
    private readonly taxJurisdictions: TaxJurisdictionService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Req() req: any,
    @Query("status") status?: string,
    @Query("tagIds") tagIdsRaw?: string
  ) {
    const user = req.user as AuthenticatedUser;
    const tagIds = tagIdsRaw
      ? tagIdsRaw
          .split(",")
          .map(x => x.trim())
          .filter(Boolean)
      : [];

    return this.projects.listProjectsForUser(
      user.userId,
      user.companyId,
      user.role,
      {
        status: status || undefined,
        tagIds: tagIds.length ? tagIds : undefined
      }
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post()
  create(@Req() req: any, @Body() dto: CreateProjectDto) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createProject(dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  getOne(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getProjectByIdForUser(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch(":id")
  update(@Req() req: any, @Param("id") projectId: string, @Body() dto: UpdateProjectDto) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updateProject(projectId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/participants")
  getParticipants(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getParticipantsForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/members")
  addMember(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: AddProjectMemberDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.addMember(
      projectId,
      dto.userId,
      dto.role,
      user.role,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/hierarchy")
  hierarchy(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getHierarchy(
      projectId,
      user.userId,
      user.companyId,
      user.role
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(":id")
  delete(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deleteProject(projectId, user.companyId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/files")
  async listProjectFiles(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("folderId") folderId?: string,
    @Query("search") search?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listProjectFiles({
      projectId,
      actor: user,
      folderId: folderId || undefined,
      search: search || undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post(":id/files/upload-url")
  async getProjectFileUploadUrl(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { contentType?: string; fileName?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const contentType = body.contentType || "application/octet-stream";

    // Validate project access
    await this.projects.getProjectByIdForUser(projectId, user);

    const key = [
      "project-files",
      user.companyId,
      projectId,
      `${Date.now()}`,
      Math.random().toString(36).slice(2),
    ].join("/");

    const { uploadUrl, fileUri } = await this.gcs.createSignedUploadUrl({
      key,
      contentType,
    });

    return { uploadUrl, fileUri };
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MEMBER)
  @Post(":id/files")
  async registerProjectFile(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      fileUri: string;
      fileName: string;
      mimeType?: string;
      sizeBytes?: number;
      folderId?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.registerProjectFile({
      projectId,
      actor: user,
      fileUri: body.fileUri,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
      folderId: body.folderId ?? null,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/tax-summary")
  async getTaxSummary(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    const project = await this.projects.getProjectByIdForUser(projectId, user);
    return this.taxJurisdictions.getProjectTaxSummary(project.id, project.companyId);
  }

  // Preview Certified Payroll CSV for a given project/week from provided
  // CertifiedPayrollSource[] payload. This wires the CSV writer into the API;
  // later we can replace the sources body with server-side time/payroll data.
  @UseGuards(JwtAuthGuard)
  @Post(":id/certified-payroll/preview")
  async previewCertifiedPayroll(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { sources: CertifiedPayrollSource[] },
  ) {
    const user = req.user as AuthenticatedUser;
    await this.projects.getProjectByIdForUser(projectId, user);

    const sources = (body.sources || []).map((src) => ({
      ...src,
      companyId: user.companyId,
      projectId,
    }));

    const rows = await buildCertifiedPayrollRows(sources);
    const csv = buildCertifiedPayrollCsv(rows);

    // For now, return CSV as a plain string; the caller can save as .csv
    return csv;
  }

  // Download Certified Payroll CSV for a given project and weekEnd date,
  // using server-side PayrollWeekRecord data as the source of truth.
  @UseGuards(JwtAuthGuard)
  @Get(":id/certified-payroll.csv")
  async downloadCertifiedPayrollCsv(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("weekEnd") weekEnd: string,
    @Res() res: any,
  ) {
    const user = req.user as AuthenticatedUser;
    const project = await this.projects.getProjectByIdForUser(projectId, user);

    const weekEndDate = new Date(weekEnd);
    if (Number.isNaN(weekEndDate.getTime())) {
      throw new BadRequestException("Invalid weekEnd date");
    }

    const sources = await buildSourcesForProjectWeek({
      companyId: project.companyId,
      projectId: project.id,
      weekEndDate,
    });

    const rows = await buildCertifiedPayrollRows(sources);
    const csv = buildCertifiedPayrollCsv(rows);

    res
      .setHeader("Content-Type", "text/csv")
      .setHeader(
        "Content-Disposition",
        `attachment; filename="certified-payroll-${project.id}-${weekEnd}.csv"`,
      )
      .send(csv);
  }

  // List distinct payroll employees for this project, aggregated from
  // PayrollWeekRecord. This reflects the roster used for Certified Payroll
  // exports (CBS/CCT for Nexus Fortified Structures in your BIA dataset).
  @UseGuards(JwtAuthGuard)
  @Get(":id/employees")
  async getProjectEmployeesRoster(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    const project = await this.projects.getProjectByIdForUser(projectId, user);
    return this.projects.getProjectEmployees(project.companyId, project.id);
  }

  // Detailed payroll history for a single employee on this project, for use
  // by foremen/PMs reviewing time, pay, and (future) reimbursements.
  @UseGuards(JwtAuthGuard)
  @Get(":id/employees/:employeeId/payroll")
  async getProjectEmployeePayroll(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("employeeId") employeeId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    const project = await this.projects.getProjectByIdForUser(projectId, user);
    return this.projects.getProjectEmployeePayroll(
      project.companyId,
      project.id,
      employeeId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/xact-raw/upload-url")
  async getXactRawUploadUrl(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { contentType?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const contentType = body.contentType || "text/csv";

    // Validate project access
    await this.projects.getProjectByIdForUser(projectId, user);

    const key = [
      "xact-raw",
      user.companyId,
      projectId,
      `${Date.now()}`,
      Math.random().toString(36).slice(2),
    ].join("/");

    const { uploadUrl, fileUri } = await this.gcs.createSignedUploadUrl({
      key,
      contentType,
    });

    console.log("[projects] xact-raw/upload-url", {
      companyId: user.companyId,
      projectId,
      userId: user.userId,
      fileUri,
    });

    return { uploadUrl, fileUri };
  }

  // Signed upload URL for Xact components CSV (GCS-backed)
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/xact-components/upload-url")
  async getXactComponentsUploadUrl(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { contentType?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const contentType = body.contentType || "text/csv";

    // Validate project access
    await this.projects.getProjectByIdForUser(projectId, user);

    const key = [
      "xact-components",
      user.companyId,
      projectId,
      `${Date.now()}`,
      Math.random().toString(36).slice(2),
    ].join("/");

    const { uploadUrl, fileUri } = await this.gcs.createSignedUploadUrl({
      key,
      contentType,
    });

    console.log("[projects] xact-components/upload-url", {
      companyId: user.companyId,
      projectId,
      userId: user.userId,
      fileUri,
    });

    return { uploadUrl, fileUri };
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/import-xact")
  importXact(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: ImportXactDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.importXactForProject(
      projectId,
      user.companyId,
      dto.csvPath,
      user
    );
  }

  // New: create an Xact RAW ImportJob from a storage URI (e.g. gs://...)
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/import-xact-from-uri")
  async importXactFromUri(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { fileUri: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const { fileUri } = body;

    if (!fileUri || !fileUri.trim()) {
      throw new BadRequestException("fileUri is required");
    }

    // Validate project access (throws if not allowed)
    await this.projects.getProjectByIdForUser(projectId, user);

    const job = await this.importJobs.createJob({
      companyId: user.companyId,
      projectId,
      createdByUserId: user.userId,
      type: ImportJobType.XACT_RAW,
      fileUri,
    });

    console.log("[projects] import-xact-from-uri", {
      companyId: user.companyId,
      projectId,
      userId: user.userId,
      fileUri,
      importJobId: job.id,
    });

    return { jobId: job.id };
  }

  // New: create an Xact Components ImportJob from a storage URI (e.g. gs://...)
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/import-xact-components-from-uri")
  async importXactComponentsFromUri(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() body: { fileUri: string; estimateVersionId?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    const { fileUri, estimateVersionId } = body;

    if (!fileUri || !fileUri.trim()) {
      throw new BadRequestException("fileUri is required");
    }

    // Validate project access (throws if not allowed)
    await this.projects.getProjectByIdForUser(projectId, user);

    const job = await this.importJobs.createJob({
      companyId: user.companyId,
      projectId,
      createdByUserId: user.userId,
      type: ImportJobType.XACT_COMPONENTS,
      fileUri,
      estimateVersionId,
    });

    console.log("[projects] import-xact-components-from-uri", {
      companyId: user.companyId,
      projectId,
      userId: user.userId,
      fileUri,
      estimateVersionId: estimateVersionId ?? null,
      importJobId: job.id,
    });

    return { jobId: job.id };
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/import-xact-components")
  importXactComponents(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: ImportXactComponentsDto
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.importXactComponentsForProject(
      projectId,
      user.companyId,
      dto.csvPath,
      user,
      dto.estimateVersionId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl")
  getPetl(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlForProject(
      projectId,
      user.companyId,
      user
    );
  }

  // PETL Archives (Admin/Owner)

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get(":id/petl-archives")
  listPetlArchives(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listPetlArchives(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/petl-archives")
  async createPetlArchive(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: CreateProjectPetlArchiveDto,
  ) {
    const user = req.user as AuthenticatedUser;

    const bundle = await this.projects.buildPetlArchiveBundle(projectId, user);
    const buffer = Buffer.from(JSON.stringify(bundle), "utf8");

    const label = String(dto.label ?? "").trim();
    const fileLabel = label || "petl-archive";

    const dateTag = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${fileLabel}-${dateTag}.json`;

    const key = [
      "petl-archives",
      user.companyId,
      projectId,
      `${Date.now()}`,
      Math.random().toString(36).slice(2),
      fileName,
    ].join("/");

    let fileUri: string;
    try {
      fileUri = await this.gcs.uploadBuffer({
        key,
        buffer,
        contentType: "application/json",
      });
    } catch (err: any) {
      throw new BadRequestException(
        `Failed to upload PETL archive bundle: ${err?.message ?? String(err)}`,
      );
    }

    const projectFile = await this.projects.registerProjectFile({
      projectId,
      actor: user,
      fileUri,
      fileName,
      mimeType: "application/json",
      sizeBytes: buffer.length,
      folderId: null,
    });

    const archive = await this.projects.createPetlArchiveRecord({
      projectId,
      actor: user,
      projectFileId: projectFile.id,
      sourceEstimateVersionId: bundle.sourceEstimateVersion.id,
      label: label || null,
      note: dto.note ?? null,
    });

    return archive;
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/petl-archives/:archiveId/restore")
  async restorePetlArchive(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("archiveId") archiveId: string,
  ) {
    const user = req.user as AuthenticatedUser;

    const archive = await this.projects.getPetlArchiveForProject(projectId, archiveId, user);

    const fileUri = String(archive?.projectFile?.storageUrl ?? "");
    if (!fileUri) {
      throw new BadRequestException("Archive has no storageUrl");
    }

    const localPath = await this.gcs.downloadToTmp(fileUri);

    let bundleText = "";
    try {
      bundleText = await fs.readFile(localPath, "utf8");
    } finally {
      await fs.unlink(localPath).catch(() => undefined);
    }

    let bundle: any;
    try {
      bundle = JSON.parse(bundleText);
    } catch (err: any) {
      throw new BadRequestException(
        `Archive bundle JSON is invalid: ${err?.message ?? String(err)}`,
      );
    }

    return this.projects.restorePetlArchiveFromBundle({
      projectId,
      actor: user,
      archiveId,
      bundle,
    });
  }

  // Admin+ destructive action: delete a single PETL line item (and any related reconciliation/edit data).
  @UseGuards(JwtAuthGuard)
  @Delete(":id/petl/:sowItemId")
  deletePetlLineItem(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deletePetlLineItemForProject(projectId, user.companyId, user, sowItemId);
  }

  // Admin+ destructive action: delete all PETL + components data for this project (wipe estimate imports).
  @UseGuards(JwtAuthGuard)
  @Delete(":id/petl")
  deletePetlAndComponents(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deletePetlAndComponentsForProject(projectId, user.companyId, user);
  }

  // Import note columns (Reimburse Owner / CO Customer Pay / Add to POL) from the
  // PWC Reconcile2 Summary Detail export and attach them as reconciliation entries.
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/petl/import-reconcile-notes")
  async importPetlReconcileNotes(
    @Req() req: FastifyRequest,
    @Param("id") projectId: string,
    @Query("dryRun") dryRun?: string,
  ) {
    const user = (req as any).user as AuthenticatedUser;

    const { file: filePart } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
    });

    const buffer = await filePart.toBuffer();
    const csvText = buffer.toString("utf8");

    const shouldDryRun = dryRun === "1" || dryRun === "true";

    return this.projects.importPetlReconcileNotesFromCsv({
      projectId,
      companyId: user.companyId,
      actor: user,
      csvText,
      dryRun: shouldDryRun,
      fileName: filePart.filename,
    });
  }

  // Field PETL (scope-only) view for PUDL / Daily Logs.
  // Returns PETL rows without pricing so crew/foremen can see scope/quantities.
  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-field")
  getFieldPetl(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getFieldPetlForProject(
      projectId,
      user.companyId,
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/percent")
  updateSinglePetlPercent(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body() body: { newPercent: number; acvOnly?: boolean }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applySinglePetlPercentEdit(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body.newPercent,
      body.acvOnly,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/petl/:sowItemId/line")
  updatePetlLineItem(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body()
    body: {
      qty?: number | null;
      unit?: string | null;
      itemAmount?: number | null;
      rcvAmount?: number | null;
      categoryCode?: string | null;
      selectionCode?: string | null;
      description?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updatePetlLineItemForProject(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body,
    );
  }

  // Pending PETL percent updates (crew/field proposals -> PM approval)

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl/percent-updates/pending")
  listPendingPetlPercentUpdates(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listPendingPetlPercentUpdateSessions(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/percent-updates/:sessionId/approve")
  approvePetlPercentUpdateSession(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: { reviewNote?: string | null },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.approvePetlPercentUpdateSession(projectId, sessionId, user, body.reviewNote ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/percent-updates/:sessionId/reject")
  rejectPetlPercentUpdateSession(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: { reviewNote?: string | null },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.rejectPetlPercentUpdateSession(projectId, sessionId, user, body.reviewNote ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl/:sowItemId/components")
  getPetlComponents(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlComponentsForItem(
      projectId,
      user.companyId,
      user,
      sowItemId
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl/:sowItemId/reconciliation")
  getPetlReconciliation(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlReconciliationForSowItem(
      projectId,
      user.companyId,
      user,
      sowItemId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/reconciliation/placeholder")
  createPetlReconciliationPlaceholder(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body() body: { kind?: string; tag?: string | null; note?: string | null }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createPetlReconciliationPlaceholder(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/reconciliation/credit")
  createPetlReconciliationCredit(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body()
    body: {
      note?: string | null;
      tag?: string | null;
      components?: { itemAmount?: boolean; salesTaxAmount?: boolean; opAmount?: boolean };
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createPetlReconciliationCredit(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/reconciliation/add-manual")
  createPetlReconciliationAddManual(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body()
    body: {
      description?: string | null;
      categoryCode?: string | null;
      selectionCode?: string | null;
      unit?: string | null;
      qty?: number | null;
      unitCost?: number | null;
      itemAmount?: number | null;
      salesTaxAmount?: number | null;
      opAmount?: number | null;
      rcvAmount?: number | null;
      tag?: string | null;
      note?: string | null;
      kind?: string | null;
      isStandaloneChangeOrder?: boolean | null;
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createPetlReconciliationAddManual(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/add-from-cost-book")
  addPetlLinesFromCostBook(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      lines: {
        companyPriceListItemId: string;
        qty?: number | null;
        projectParticleId?: string | null;
        payerType?: string | null;
        tag?: string | null;
        note?: string | null;
      }[];
      locationDescription?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.addPetlLinesFromCostBook(projectId, user.companyId, user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/reconciliation/add-from-cost-book")
  createPetlReconciliationAddFromCostBook(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body()
    body: {
      companyPriceListItemId: string;
      qty?: number | null;
      unitCostOverride?: number | null;
      tag?: string | null;
      note?: string | null;
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createPetlReconciliationAddFromCostBook(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body,
    );
  }

  // GAAP-style replacement: credit the original line (zero it out) and add a replacement
  // line item from the tenant cost book. Restricted to PM/Owner/Admin.
  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/:sowItemId/reconciliation/replace-from-cost-book")
  replacePetlLineItemFromCostBook(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("sowItemId") sowItemId: string,
    @Body()
    body: {
      companyPriceListItemId: string;
      qty?: number | null;
      unitCostOverride?: number | null;
      tag?: string | null;
      note?: string | null;
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.replacePetlLineItemFromCostBook(
      projectId,
      user.companyId,
      user,
      sowItemId,
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-reconciliation/cases/:caseId/history")
  getPetlReconciliationCaseHistory(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("caseId") caseId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlReconciliationCaseHistory(
      projectId,
      user.companyId,
      user,
      caseId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl-reconciliation/entries/:entryId/percent")
  updatePetlReconciliationEntryPercent(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("entryId") entryId: string,
    @Body() body: { newPercent: number }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updatePetlReconciliationEntryPercent(
      projectId,
      user.companyId,
      user,
      entryId,
      body.newPercent,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/petl-reconciliation/entries/:entryId")
  updatePetlReconciliationEntry(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("entryId") entryId: string,
    @Body()
    body: {
      kind?: string | null;
      tag?: string | null;
      status?: string | null;
      description?: string | null;
      categoryCode?: string | null;
      selectionCode?: string | null;
      unit?: string | null;
      qty?: number | null;
      unitCost?: number | null;
      itemAmount?: number | null;
      salesTaxAmount?: number | null;
      opAmount?: number | null;
      rcvAmount?: number | null;
      note?: string | null;
      isPercentCompleteLocked?: boolean | null;
      percentComplete?: number | null;
      // Activity and cost component fields
      activity?: string | null;
      workersWage?: number | null;
      laborBurden?: number | null;
      laborOverhead?: number | null;
      materialCost?: number | null;
      equipmentCost?: number | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updatePetlReconciliationEntry(
      projectId,
      user.companyId,
      user,
      entryId,
      body,
    );
  }

  // Convert a reconciliation entry to a standalone Change Order (CO).
  // This detaches the entry from the original line item, assigns a CO sequence number,
  // and optionally attaches a cost book item with activity-based cost calculation.
  @UseGuards(JwtAuthGuard)
  @Post(":id/petl-reconciliation/entries/:entryId/convert-to-co")
  convertEntryToStandaloneChangeOrder(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("entryId") entryId: string,
    @Body()
    body: {
      companyPriceListItemId?: string | null;
      activity?: string | null; // PetlActivity enum value
      laborCost?: number | null;
      materialCost?: number | null;
      equipmentCost?: number | null;
      description?: string | null;
      qty?: number | null;
      unit?: string | null;
      note?: string | null;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.convertEntryToStandaloneChangeOrder(
      projectId,
      user.companyId,
      user,
      entryId,
      body as any, // activity will be validated in service
    );
  }

  // Revert a standalone Change Order back to a regular reconciliation entry.
  @UseGuards(JwtAuthGuard)
  @Post(":id/petl-reconciliation/entries/:entryId/revert-from-co")
  revertEntryFromStandaloneChangeOrder(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("entryId") entryId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.revertEntryFromStandaloneChangeOrder(
      projectId,
      user.companyId,
      user,
      entryId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl-reconciliation/entries/:entryId/attachments")
  attachPetlReconciliationEntryFile(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("entryId") entryId: string,
    @Body() body: { projectFileId: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.attachPetlReconciliationEntryFile(
      projectId,
      entryId,
      body,
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/petl-reconciliation/entries/:entryId")
  deletePetlReconciliationEntry(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("entryId") entryId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deletePetlReconciliationEntry(
      projectId,
      user.companyId,
      user,
      entryId,
    );
  }

  // Look up historical cost components by CAT/SEL from tenant's PETL data
  @UseGuards(JwtAuthGuard)
  @Get(":id/cost-lookup/cat-sel")
  lookupCostComponentsByCatSel(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("cat") cat?: string,
    @Query("sel") sel?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.lookupCostComponentsByCatSel(
      projectId,
      user.companyId,
      user,
      cat ?? null,
      sel ?? null,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-groups")
  getPetlGroups(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlGroupsForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/recent-activities")
  getRecentActivities(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getRecentActivityForProject(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/estimate-summary")
  getEstimateSummary(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getEstimateSummaryForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/financial-summary")
  getFinancialSummary(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("forceRefresh") forceRefresh?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getFinancialSummaryForProject(
      projectId,
      user.companyId,
      user,
      { forceRefresh: forceRefresh === "true" },
    );
  }

  // Project bills (expenses)

  @UseGuards(JwtAuthGuard)
  @Get(":id/bills")
  listProjectBills(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listProjectBills(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/bills")
  createProjectBill(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: CreateProjectBillDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createProjectBill(projectId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/bills/:billId")
  updateProjectBill(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("billId") billId: string,
    @Body() dto: UpdateProjectBillDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updateProjectBill(projectId, billId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/bills/:billId/attachments")
  attachProjectBillFile(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("billId") billId: string,
    @Body() dto: AttachProjectBillFileDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.attachProjectBillFile(projectId, billId, dto, user);
  }

  // Project billing (invoices + payments)

  @UseGuards(JwtAuthGuard)
  @Get(":id/invoices")
  listProjectInvoices(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listProjectInvoices(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/invoices/draft")
  createOrGetDraftInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: CreateOrGetDraftInvoiceDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.createOrGetDraftInvoice(projectId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/invoices/:invoiceId")
  getProjectInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getProjectInvoice(projectId, invoiceId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/invoices/:invoiceId/petl-lines/:lineId")
  updateInvoicePetlLine(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateInvoicePetlLineDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updateInvoicePetlLine(projectId, invoiceId, lineId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/invoices/:invoiceId/lines")
  addInvoiceLineItem(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: AddInvoiceLineItemDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.addInvoiceLineItem(projectId, invoiceId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/invoices/:invoiceId/lines/:lineId")
  updateInvoiceLineItem(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateInvoiceLineItemDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.updateInvoiceLineItem(projectId, invoiceId, lineId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/invoices/:invoiceId/lines/:lineId")
  deleteInvoiceLineItem(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Param("lineId") lineId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deleteInvoiceLineItem(projectId, invoiceId, lineId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/invoices/:invoiceId")
  deleteDraftInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.deleteDraftInvoice(projectId, invoiceId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/invoices/:invoiceId/issue")
  issueInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: IssueInvoiceDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.issueInvoice(projectId, invoiceId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/invoices/:invoiceId/payments")
  recordInvoicePayment(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: RecordInvoicePaymentDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.recordInvoicePayment(projectId, invoiceId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/invoices/:invoiceId/applications/sources")
  listInvoiceApplicationSources(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listInvoiceApplicationSources(projectId, invoiceId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/invoices/:invoiceId/applications")
  applyInvoiceToInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: ApplyInvoiceToInvoiceDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applyInvoiceToInvoice(projectId, invoiceId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/invoices/:invoiceId/move-petl-lines")
  moveInvoicePetlLinesToNewInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: { lineIds: string[] },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.moveInvoicePetlLinesToNewInvoice(projectId, invoiceId, dto, user);
  }

  // Project payments (cash receipts) - can exist without being tied to an invoice.

  @UseGuards(JwtAuthGuard)
  @Get(":id/payments")
  listProjectPayments(@Req() req: any, @Param("id") projectId: string) {
    const user = req.user as AuthenticatedUser;
    return this.projects.listProjectPayments(projectId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/payments")
  recordProjectPayment(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body() dto: RecordProjectPaymentDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.recordProjectPayment(projectId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/payments/:paymentId/apply")
  applyProjectPaymentToInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: ApplyPaymentToInvoiceDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applyProjectPaymentToInvoice(projectId, paymentId, dto, user);
  }

  // Remove/unapply a payment from a specific invoice.
  // - For application-based payments: deletes the ProjectPaymentApplication row.
  // - For legacy invoice-linked payments: detaches the payment (sets invoiceId to null).
  @UseGuards(JwtAuthGuard)
  @Delete(":id/payments/:paymentId/apply/:invoiceId")
  unapplyProjectPaymentFromInvoice(
    @Req() req: any,
    @Param("id") projectId: string,
    @Param("paymentId") paymentId: string,
    @Param("invoiceId") invoiceId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.unapplyProjectPaymentFromInvoice(projectId, paymentId, invoiceId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-selection-summary")
  getPetlSelectionSummary(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("roomParticleId") roomParticleId?: string | string[],
    @Query("categoryCode") categoryCode?: string | string[],
    @Query("selectionCode") selectionCode?: string | string[],
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlSelectionSummaryForProject(
      projectId,
      user.companyId,
      user,
      {
        roomParticleIds: normalizeQueryStringArray(roomParticleId),
        categoryCodes: normalizeQueryStringArray(categoryCode),
        selectionCodes: normalizeQueryStringArray(selectionCode),
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/petl-components")
  getPetlComponentsForSelection(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("roomParticleId") roomParticleId?: string | string[],
    @Query("categoryCode") categoryCode?: string | string[],
    @Query("selectionCode") selectionCode?: string | string[],
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getPetlComponentsForSelection(
      projectId,
      user.companyId,
      user,
      {
        roomParticleIds: normalizeQueryStringArray(roomParticleId),
        categoryCodes: normalizeQueryStringArray(categoryCode),
        selectionCodes: normalizeQueryStringArray(selectionCode),
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/import-structure/room-buckets")
  getImportStructureRoomBuckets(
    @Req() req: any,
    @Param("id") projectId: string
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getImportRoomBucketsForProject(
      projectId,
      user.companyId,
      user
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/import-structure/room-lines")
  getImportStructureRoomBucketLines(
    @Req() req: any,
    @Param("id") projectId: string,
    @Query("groupCode") groupCode?: string | null,
    @Query("groupDescription") groupDescription?: string | null,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.getImportRoomBucketLinesForProject(
      projectId,
      user.companyId,
      user,
      {
        groupCode: groupCode ?? null,
        groupDescription: groupDescription ?? null,
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/import-structure/assign-buckets-to-unit")
  assignImportStructureBucketsToUnit(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      target: {
        type: "existing" | "new";
        unitId?: string;
        label?: string;
        floor?: number | null;
      };
      buckets: { groupCode: string | null; groupDescription: string | null }[];
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.assignImportRoomBucketsToUnit({
      projectId,
      companyId: user.companyId,
      actor: user,
      target: body.target,
      buckets: body.buckets,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/petl/percentage-edits")
  applyPetlPercentageEdits(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      filters?: {
        roomParticleIds?: string[];
        categoryCodes?: string[];
        selectionCodes?: string[];
        orgGroupCodes?: string[];
      };
      operation?: "set" | "increment" | "decrement";
      percent?: number;
      changes?: { sowItemId: string; oldPercent?: number | null; newPercent: number }[];
    }
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applyPetlPercentageEditsForProject(
      projectId,
      user.companyId,
      user,
      body
    );
  }

  // Accept quantity flags from Field PETL (PUDL) UI.
  @UseGuards(JwtAuthGuard)
  @Post(":id/petl-field/qty-flags")
  applyFieldPetlQuantityFlags(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      items: { sowItemId: string; qtyFlaggedIncorrect: boolean; qtyFieldReported?: number | null; notes?: string | null }[];
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.applyFieldPetlQuantityFlags(
      projectId,
      user.companyId,
      user,
      body,
    );
  }

  // PM/Estimator review of Field PETL quantity flags.
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/petl-field/review-qty")
  reviewFieldPetlQuantityFlags(
    @Req() req: any,
    @Param("id") projectId: string,
    @Body()
    body: {
      items: { sowItemId: string; action: "ACCEPT" | "REJECT"; coSupTag?: string | null }[];
    },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projects.reviewFieldPetlQuantityFlags(
      projectId,
      user.companyId,
      user,
      body,
    );
  }
}
