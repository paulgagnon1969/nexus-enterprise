import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  ForbiddenException,
  ServiceUnavailableException,
  Header,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { JwtAuthGuard, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { ManualsService } from "./manuals.service";
import { ManualRenderService } from "./manual-render.service";
import { ManualPdfService } from "./manual-pdf.service";
import {
  CreateManualDto,
  UpdateManualDto,
  PublishManualDto,
  CreateChapterDto,
  UpdateChapterDto,
  ReorderChaptersDto,
  AddDocumentToManualDto,
  UpdateManualDocumentDto,
  ReorderDocumentsDto,
} from "./dto/manual.dto";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) {
    throw new ForbiddenException("Authentication required");
  }
  return user;
}

/**
 * Check if user has system-level manual management access.
 * Allows SUPER_ADMIN and NCC_SYSTEM_DEVELOPER roles.
 */
function assertSystemManualAccess(user: AuthenticatedUser) {
  const allowedRoles = [GlobalRole.SUPER_ADMIN, GlobalRole.NCC_SYSTEM_DEVELOPER];
  if (!allowedRoles.includes(user.globalRole as GlobalRole)) {
    throw new ForbiddenException("SUPER_ADMIN or NCC_SYSTEM_DEVELOPER access required");
  }
}

/** @deprecated Use assertSystemManualAccess for manual endpoints */
function assertSuperAdmin(user: AuthenticatedUser) {
  if (user.globalRole !== GlobalRole.SUPER_ADMIN) {
    throw new ForbiddenException("SUPER_ADMIN access required");
  }
}

@Controller("system/manuals")
@UseGuards(JwtAuthGuard)
export class ManualsController {
  constructor(
    private readonly manualsService: ManualsService,
    private readonly renderService: ManualRenderService,
    private readonly pdfService: ManualPdfService
  ) {}

  // =========================================================================
  // Manual CRUD
  // =========================================================================

  @Get()
  async listManuals(
    @Req() req: FastifyRequest,
    @Query("status") status?: string,
    @Query("includeArchived") includeArchived?: string
  ) {
    const user = getUser(req);
    assertSystemManualAccess(user);
    return this.manualsService.listManuals({
      status,
      includeArchived: includeArchived === "true",
      userGlobalRole: user.globalRole as GlobalRole,
    });
  }

  @Get(":id")
  async getManual(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSystemManualAccess(user);
    return this.manualsService.getManualWithAccessCheck(id, user.globalRole as GlobalRole);
  }

  @Post()
  async createManual(@Req() req: FastifyRequest, @Body() dto: CreateManualDto) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.createManual(user.userId, dto);
  }

  @Put(":id")
  async updateManual(@Req() req: FastifyRequest, @Param("id") id: string, @Body() dto: UpdateManualDto) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.updateManual(id, dto);
  }

  @Delete(":id")
  async archiveManual(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.archiveManual(id);
  }

  @Post(":id/publish")
  async publishManual(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: PublishManualDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.publishManual(id, user.userId, dto);
  }

  @Get(":id/versions")
  async getVersionHistory(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.getVersionHistory(id);
  }

  @Get(":id/available-documents")
  async getAvailableDocuments(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.getAvailableDocuments(id);
  }

  // =========================================================================
  // Chapter Management
  // =========================================================================

  @Post(":id/chapters")
  async addChapter(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: CreateChapterDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.addChapter(id, user.userId, dto);
  }

  @Put(":id/chapters/:chapterId")
  async updateChapter(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("chapterId") chapterId: string,
    @Body() dto: UpdateChapterDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.updateChapter(id, chapterId, dto);
  }

  @Delete(":id/chapters/:chapterId")
  async removeChapter(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("chapterId") chapterId: string
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.removeChapter(id, chapterId, user.userId);
  }

  @Post(":id/chapters/reorder")
  async reorderChapters(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: ReorderChaptersDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.reorderChapters(id, user.userId, dto);
  }

  // =========================================================================
  // Document Management
  // =========================================================================

  @Post(":id/documents")
  async addDocument(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: AddDocumentToManualDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.addDocument(id, user.userId, dto);
  }

  @Put(":id/documents/:docId")
  async updateDocument(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("docId") docId: string,
    @Body() dto: UpdateManualDocumentDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.updateDocument(id, docId, dto);
  }

  @Delete(":id/documents/:docId")
  async removeDocument(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("docId") docId: string
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.removeDocument(id, docId, user.userId);
  }

  @Post(":id/documents/reorder")
  async reorderDocuments(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Query("chapterId") chapterId: string | undefined,
    @Body() dto: ReorderDocumentsDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.manualsService.reorderDocuments(
      id,
      user.userId,
      chapterId || null,
      dto
    );
  }

  // =========================================================================
  // Rendering & Export
  // =========================================================================

  @Get(":id/toc")
  async getTableOfContents(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.renderService.getTableOfContents(id);
  }

  @Get(":id/render")
  @Header("Content-Type", "text/html")
  async renderManual(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("id") id: string,
    @Query("toc") includeToc?: string,
    @Query("cover") includeCover?: string,
    @Query("revisions") includeRevisions?: string
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const html = await this.renderService.renderManualHtml(id, {
      includeToc: includeToc !== "false",
      includeCoverPage: includeCover !== "false",
      includeRevisionMarkers: includeRevisions !== "false",
    });

    return reply.type("text/html").send(html);
  }

  @Get(":id/pdf")
  async downloadPdf(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("id") id: string
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    if (!this.pdfService.isAvailable()) {
      throw new ServiceUnavailableException(
        "PDF generation is not available. Install puppeteer on the server."
      );
    }

    // Get manual info for filename
    const manual = await this.manualsService.getManual(id);
    const filename = this.pdfService.generateFilename(
      manual.title,
      manual.currentVersion
    );

    // Generate PDF
    const pdfBuffer = await this.pdfService.generatePdf(id);

    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdfBuffer);
  }
}
