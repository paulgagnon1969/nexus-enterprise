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
  BadRequestException,
} from "@nestjs/common";
import { Response, Request } from "express";
import { FastifyRequest } from "fastify";
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
import { readSingleFileFromMultipart } from "../../infra/uploads/multipart";

@Controller("document-import")
export class DocumentImportController {
  constructor(private readonly documentImport: DocumentImportService) {}

  // ==================== Public Routes (No Auth Required) ====================

  /**
   * Get a public document by slug (no authentication required)
   * Used for public pages like privacy policy, terms of service, etc.
   * GET /document-import/public/:slug
   */
  @Get("public/:slug")
  async getPublicDocument(@Param("slug") slug: string) {
    return this.documentImport.getPublicDocumentBySlug(slug);
  }

  // ==================== Create Document (from scratch) ====================

  /**
   * Create a new document from scratch with HTML content
   * POST /document-import/documents/create
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/create")
  async createDocument(
    @Req() req: any,
    @Body()
    body: {
      title: string;
      htmlContent: string;
      tags?: string[];
      category?: string;
      description?: string;
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.createDocumentFromScratch(actor, body);
  }

  // ==================== Scan Jobs ====================

  /**
   * Create a new scan job (Admin+ only)
   * POST /document-import/scan-jobs
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("scan-jobs")
  async createScanJob(@Req() req: any, @Body() body: CreateScanJobDto) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.createScanJob(actor, body.scanPath);
  }

  // ==================== File Upload (Browser-Based) ====================

  /**
   * Upload a document file from the browser
   * POST /document-import/upload
   * Expects multipart/form-data with:
   *   - file: the document file
   *   - fileName: original file name
   *   - breadcrumb: JSON array of folder path segments
   *   - fileType: file extension
   *   - folderName: name of the scanned folder (used for scan job)
   *   - scanJobId: (optional) existing scan job ID to add to
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("upload")
  async uploadDocument(@Req() req: FastifyRequest) {
    const actor = (req as any).user as AuthenticatedUser;

    const { file, fields } = await readSingleFileFromMultipart(req, {
      fieldName: "file",
      captureFields: ["fileName", "breadcrumb", "fileType", "folderName", "scanJobId"],
    });

    const fileName = fields.fileName;
    const breadcrumb = fields.breadcrumb ? JSON.parse(fields.breadcrumb) : [];
    const fileType = fields.fileType || "unknown";
    const folderName = fields.folderName || "Index";
    const scanJobId = fields.scanJobId;

    if (!fileName) {
      throw new BadRequestException("fileName is required");
    }

    try {
      const fileBuffer = await file.toBuffer();

      return await this.documentImport.uploadDocument(actor, {
        fileName,
        fileBuffer,
        mimeType: file.mimetype,
        breadcrumb,
        fileType,
        folderName,
        scanJobId,
      });
    } catch (err: any) {
      // Log the error but return a structured error response
      console.error(`Index failed for ${fileName}:`, err?.message || err);
      throw new BadRequestException(`Failed to index ${fileName}: ${err?.message || 'Unknown error'}`);
    }
  }

  /**
   * List all scan jobs for the company
   * GET /document-import/scan-jobs
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/:id/unimport")
  async unimportDocument(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.unimportDocument(actor, id);
  }

  // ==================== HTML Conversion ====================

  /**
   * Get HTML content for a document (for fast rendering)
   * GET /document-import/documents/:id/html
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("documents/:id/html")
  async getDocumentHtml(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getDocumentHtml(actor, id);
  }

  /**
   * Re-convert a document to HTML (Admin+ only)
   * POST /document-import/documents/:id/reconvert
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/:id/reconvert")
  async reconvertDocument(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.reconvertDocument(actor, id);
  }

  // ==================== Imported Documents (for Safety Manual, BKMs) ====================

  /**
   * Get imported documents by type and optionally category
   * GET /document-import/imported
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("imported/categories")
  async getImportedCategories(
    @Req() req: any,
    @Query("type") importToType: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getImportedCategories(actor, importToType);
  }

  // ==================== Tagging & Document Details ====================

  /**
   * Update document details (title, description, tags, category)
   * PATCH /document-import/documents/:id/details
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Patch("documents/:id/details")
  async updateDocumentDetails(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      displayTitle?: string;
      displayDescription?: string;
      tags?: string[];
      category?: string;
      subcategory?: string;
      revisionNotes?: string;
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.updateDocumentDetails(actor, id, body);
  }

  // ==================== Publishing Workflow ====================

  /**
   * Publish a document (make it visible to all users)
   * POST /document-import/documents/:id/publish
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/:id/publish")
  async publishDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body?: {
      displayTitle?: string;
      displayDescription?: string;
      category?: string;
      subcategory?: string;
      tags?: string[];
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.publishDocument(actor, id, body);
  }

  /**
   * Unpublish a document (return to ACTIVE/unpublished status)
   * POST /document-import/documents/:id/unpublish
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/:id/unpublish")
  async unpublishDocument(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.unpublishDocument(actor, id);
  }

  /**
   * Bulk publish multiple documents
   * POST /document-import/documents/bulk-publish
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("documents/bulk-publish")
  async bulkPublishDocuments(
    @Req() req: any,
    @Body()
    body: {
      documentIds: string[];
      category?: string;
      tags?: string[];
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.bulkPublishDocuments(actor, body.documentIds, {
      category: body.category,
      tags: body.tags,
    });
  }

  // ==================== Published Documents (for all users) ====================

  /**
   * Get published documents with optional filtering
   * GET /document-import/published
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("published")
  async getPublishedDocuments(
    @Req() req: any,
    @Query("category") category?: string,
    @Query("subcategory") subcategory?: string,
    @Query("tags") tags?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getPublishedDocuments(actor, {
      category,
      subcategory,
      tags: tags ? tags.split(",").map(t => t.trim()) : undefined,
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * Get categories for published documents
   * GET /document-import/published/categories
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("published/categories")
  async getPublishedCategories(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getPublishedCategories(actor);
  }

  /**
   * Get all tags used in published documents
   * GET /document-import/published/tags
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.MEMBER, Role.ADMIN, Role.OWNER)
  @Get("published/tags")
  async getPublishedTags(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getPublishedTags(actor);
  }

  // ==================== SOPs (Standard Operating Procedures) ====================

  /**
   * Get unpublished/draft SOPs
   * GET /document-import/sops
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("sops")
  async getSOPs(
    @Req() req: any,
    @Query("status") status?: string,
    @Query("module") module?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getSOPs(actor, { status, module });
  }

  /**
   * Publish an SOP
   * POST /document-import/sops/:id/publish
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Post("sops/:id/publish")
  async publishSOP(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body?: {
      category?: string;
      visibleToRoles?: string[];
    }
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.publishSOP(actor, id, body);
  }

  // ==================== Statistics ====================

  /**
   * Get document statistics
   * GET /document-import/stats
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  @Get("stats")
  async getStats(@Req() req: any, @Query("scanJobId") scanJobId?: string) {
    const actor = req.user as AuthenticatedUser;
    return this.documentImport.getDocumentStats(actor, scanJobId);
  }
}
