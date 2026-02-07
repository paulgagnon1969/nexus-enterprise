import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  StreamableFile,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard, RolesGuard, Roles, Role } from "../auth/auth.guards";
import { DocumentImportService } from "./document-import.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  CreateScanJobDto,
  UpdateStagedDocumentDto,
  BulkUpdateStagedDocumentsDto,
  ListStagedDocumentsQueryDto,
  ListScanJobsQueryDto,
} from "./dto/document-import.dto";
import { StagedDocumentStatus, DocumentScanJobStatus } from "@prisma/client";
import * as fs from "fs";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("document-import")
export class DocumentImportController {
  constructor(private readonly documentImport: DocumentImportService) {}

  // ==================== Scan Jobs ====================

  /**
   * Create a new scan job (Admin+ only)
   * POST /document-import/scan-jobs
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("scan-jobs")
  async createScanJob(@Req() req: any, @Body() body: CreateScanJobDto) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.createScanJob(actor, body.scanPath);
  }

  /**
   * List all scan jobs for the company
   * GET /document-import/scan-jobs
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("scan-jobs")
  async listScanJobs(@Req() req: any, @Query() query: ListScanJobsQueryDto) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.listScanJobs(actor, {
      status: query.status as DocumentScanJobStatus | undefined,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    });
  }

  /**
   * Get a specific scan job
   * GET /document-import/scan-jobs/:id
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("scan-jobs/:id")
  async getScanJob(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getScanJob(actor, id);
  }

  // ==================== Staged Documents ====================

  /**
   * List staged documents with filtering and pagination
   * GET /document-import/documents
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("documents")
  async listDocuments(@Req() req: any, @Query() query: ListStagedDocumentsQueryDto) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.listStagedDocuments(actor, {
      scanJobId: query.scanJobId,
      status: query.status as StagedDocumentStatus | "ALL" | undefined,
      fileType: query.fileType,
      search: query.search,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    });
  }

  /**
   * Get a specific staged document
   * GET /document-import/documents/:id
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("documents/:id")
  async getDocument(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getStagedDocument(actor, id);
  }

  /**
   * Update a staged document (e.g., archive/unarchive)
   * PATCH /document-import/documents/:id
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch("documents/:id")
  async updateDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: UpdateStagedDocumentDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.updateStagedDocument(actor, id, {
      status: body.status,
    });
  }

  /**
   * Bulk update multiple documents
   * POST /document-import/documents/bulk-update
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/bulk-update")
  async bulkUpdateDocuments(@Req() req: any, @Body() body: BulkUpdateStagedDocumentsDto) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.bulkUpdateStagedDocuments(
      actor,
      body.documentIds,
      body.status
    );
  }

  // ==================== Preview / QuickLook ====================

  /**
   * Get document preview/stream for QuickLook
   * GET /document-import/documents/:id/preview
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("documents/:id/preview")
  async getDocumentPreview(
    @Req() req: any,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const actor = req.user as AuthenticatedUser;
    const preview = await this.documentImport.getDocumentPreview(actor, id);

    res.set({
      "Content-Type": preview.mimeType,
      "Content-Disposition": `inline; filename="${preview.fileName}"`,
    });

    const fileStream = fs.createReadStream(preview.filePath);
    return new StreamableFile(fileStream);
  }

  // ==================== Import Workflow ====================

  /**
   * Import a single document to Safety Manual, BKM, etc.
   * POST /document-import/documents/:id/import
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/:id/import")
  async importDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      importToType: string;
      importToCategory: string;
      displayTitle?: string;
      displayDescription?: string;
      oshaReference?: string;
      sortOrder?: number;
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.importDocument(actor, id, body);
  }

  /**
   * Bulk import multiple documents
   * POST /document-import/documents/bulk-import
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/bulk-import")
  async bulkImportDocuments(
    @Req() req: any,
    @Body()
    body: {
      documentIds: string[];
      importToType: string;
      importToCategory: string;
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.bulkImportDocuments(actor, body.documentIds, {
      importToType: body.importToType,
      importToCategory: body.importToCategory,
    });
  }

  /**
   * Unimport a document (return to ACTIVE status)
   * POST /document-import/documents/:id/unimport
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/:id/unimport")
  async unimportDocument(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.unimportDocument(actor, id);
  }

  // ==================== Imported Documents (for Safety Manual, BKMs) ====================

  /**
   * Get imported documents by type and optionally category
   * GET /document-import/imported
   */
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("imported")
  async getImportedDocuments(
    @Req() req: any,
    @Query("type") importToType: string,
    @Query("category") importToCategory?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getImportedDocuments(actor, {
      importToType,
      importToCategory,
    });
  }

  /**
   * Get categories with imported documents for a given type
   * GET /document-import/imported/categories
   */
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("imported/categories")
  async getImportedCategories(
    @Req() req: any,
    @Query("type") importToType: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getImportedCategories(actor, importToType);
  }

  // ==================== Statistics ====================

  /**
   * Get document statistics
   * GET /document-import/stats
   */
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("stats")
  async getStats(@Req() req: any, @Query("scanJobId") scanJobId?: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getDocumentStats(actor, scanJobId);
  }
}
