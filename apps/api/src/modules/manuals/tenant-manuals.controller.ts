import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Res,
  Query,
  Header,
  UseGuards,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { JwtAuthGuard, Role, Roles, RolesGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ManualRenderService } from "./manual-render.service";
import { ManualPdfService } from "./manual-pdf.service";
import { ManualVersionChangeType } from "@prisma/client";
import {
  CreateManualDto,
  UpdateManualDto,
  CreateChapterDto,
  UpdateChapterDto,
  CreateManualViewDto,
  UpdateManualViewDto,
} from "./dto/manual.dto";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) {
    throw new ForbiddenException("Authentication required");
  }
  return user;
}

/**
 * Tenant Manuals Controller
 * Handles CRUD for tenant-owned manuals (ownerCompanyId set to current company).
 * Regular users can view, ADMIN/OWNER can create/edit.
 */
@Controller("manuals")
@UseGuards(JwtAuthGuard)
export class TenantOwnedManualsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderService: ManualRenderService,
    private readonly pdfService: ManualPdfService,
  ) {}

  /** Verify the manual belongs to the user's company and return it */
  private async assertTenantManualAccess(userId: string, companyId: string, manualId: string) {
    const manual = await this.prisma.manual.findFirst({
      where: { id: manualId, ownerCompanyId: companyId },
    });
    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }
    return manual;
  }

  /**
   * List tenant-owned manuals for current company
   */
  @Get()
  async listManuals(@Req() req: FastifyRequest) {
    const user = getUser(req);

    return this.prisma.manual.findMany({
      where: {
        ownerCompanyId: user.companyId,
        status: { not: "ARCHIVED" },
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { chapters: true, documents: { where: { active: true } } } },
      },
      orderBy: [{ status: "asc" }, { title: "asc" }],
    });
  }

  /**
   * Get a specific tenant-owned manual
   */
  @Get(":id")
  async getManual(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);

    const manual = await this.prisma.manual.findFirst({
      where: {
        id,
        ownerCompanyId: user.companyId,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        chapters: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          include: {
            documents: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  select: {
                    id: true,
                    code: true,
                    title: true,
                    category: true,
                    currentVersion: { select: { versionNo: true } },
                  },
                },
              },
            },
          },
        },
        documents: {
          where: { active: true, chapterId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            systemDocument: {
              select: {
                id: true,
                code: true,
                title: true,
                category: true,
                currentVersion: { select: { versionNo: true } },
              },
            },
          },
        },
      },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    return manual;
  }

  /**
   * Create a tenant-owned manual
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async createManual(@Req() req: FastifyRequest, @Body() dto: CreateManualDto) {
    const user = getUser(req);

    // Check for duplicate code within this tenant
    const existing = await this.prisma.manual.findFirst({
      where: {
        code: dto.code,
        ownerCompanyId: user.companyId,
      },
    });

    if (existing) {
      throw new ForbiddenException(`Manual with code "${dto.code}" already exists`);
    }

    const manual = await this.prisma.$transaction(async (tx) => {
      const newManual = await tx.manual.create({
        data: {
          code: dto.code,
          title: dto.title,
          description: dto.description,
          iconEmoji: dto.iconEmoji ?? "📘",
          createdByUserId: user.userId,
          currentVersion: 1,
          ownerCompanyId: user.companyId, // Tenant-owned
          isNexusInternal: false,
        },
      });

      await tx.manualVersion.create({
        data: {
          manualId: newManual.id,
          version: 1,
          changeType: ManualVersionChangeType.INITIAL,
          changeNotes: "Manual created",
          createdByUserId: user.userId,
          structureSnapshot: { chapters: [], documents: [] },
        },
      });

      return newManual;
    });

    return this.getManual(req, manual.id);
  }

  /**
   * Update a tenant-owned manual
   */
  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async updateManual(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateManualDto
  ) {
    const user = getUser(req);

    const manual = await this.prisma.manual.findFirst({
      where: { id, ownerCompanyId: user.companyId },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    await this.prisma.manual.update({
      where: { id },
      data: {
        title: dto.title ?? manual.title,
        description: dto.description ?? manual.description,
        iconEmoji: dto.iconEmoji ?? manual.iconEmoji,
      },
    });

    return this.getManual(req, id);
  }

  /**
   * Archive a tenant-owned manual
   */
  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async archiveManual(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);

    const manual = await this.prisma.manual.findFirst({
      where: { id, ownerCompanyId: user.companyId },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    await this.prisma.manual.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Add a chapter to a tenant-owned manual
   */
  @Post(":id/chapters")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async addChapter(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: CreateChapterDto
  ) {
    const user = getUser(req);

    const manual = await this.prisma.manual.findFirst({
      where: { id, ownerCompanyId: user.companyId },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    // Get max sort order
    const maxOrder = await this.prisma.manualChapter.aggregate({
      where: { manualId: id, active: true },
      _max: { sortOrder: true },
    });

    await this.prisma.manualChapter.create({
      data: {
        manualId: id,
        title: dto.title,
        description: dto.description,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    return this.getManual(req, id);
  }

  /**
   * Update a chapter
   */
  @Put(":id/chapters/:chapterId")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async updateChapter(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("chapterId") chapterId: string,
    @Body() dto: UpdateChapterDto
  ) {
    const user = getUser(req);

    const manual = await this.prisma.manual.findFirst({
      where: { id, ownerCompanyId: user.companyId },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    await this.prisma.manualChapter.update({
      where: { id: chapterId },
      data: {
        title: dto.title,
        description: dto.description,
        sortOrder: dto.sortOrder,
      },
    });

    return this.getManual(req, id);
  }

  /**
   * Remove a chapter
   */
  @Delete(":id/chapters/:chapterId")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async removeChapter(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("chapterId") chapterId: string
  ) {
    const user = getUser(req);

    const manual = await this.prisma.manual.findFirst({
      where: { id, ownerCompanyId: user.companyId },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    await this.prisma.manualChapter.update({
      where: { id: chapterId },
      data: { active: false },
    });

    return this.getManual(req, id);
  }

  // =========================================================================
  // Views
  // =========================================================================

  @Get(":id/views")
  async listViews(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    await this.assertTenantManualAccess(user.userId, user.companyId, id);
    return this.prisma.manualView.findMany({
      where: { manualId: id },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { createdBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  @Post(":id/views")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async createView(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: CreateManualViewDto
  ) {
    const user = getUser(req);
    await this.assertTenantManualAccess(user.userId, user.companyId, id);
    return this.prisma.manualView.create({
      data: {
        manualId: id,
        name: dto.name,
        description: dto.description,
        mapping: dto.mapping ?? {},
        createdByUserId: user.userId,
      },
      include: { createdBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  @Put(":id/views/:viewId")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async updateView(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("viewId") viewId: string,
    @Body() dto: UpdateManualViewDto
  ) {
    const user = getUser(req);
    await this.assertTenantManualAccess(user.userId, user.companyId, id);
    // If setting default, unset others
    if (dto.isDefault) {
      await this.prisma.manualView.updateMany({
        where: { manualId: id, isDefault: true, id: { not: viewId } },
        data: { isDefault: false },
      });
    }
    return this.prisma.manualView.update({
      where: { id: viewId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.mapping !== undefined && { mapping: dto.mapping }),
      },
      include: { createdBy: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
  }

  @Delete(":id/views/:viewId")
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.OWNER)
  async deleteView(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Param("viewId") viewId: string
  ) {
    const user = getUser(req);
    await this.assertTenantManualAccess(user.userId, user.companyId, id);
    await this.prisma.manualView.delete({ where: { id: viewId } });
    return { success: true };
  }

  // =========================================================================
  // Rendering & Export
  // =========================================================================

  /**
   * Get table of contents for a tenant-owned manual
   */
  @Get(":id/toc")
  async getTableOfContents(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);

    // Verify access
    const manual = await this.prisma.manual.findFirst({
      where: { id, ownerCompanyId: user.companyId },
    });

    if (!manual) {
      throw new ForbiddenException("Manual not found or access denied");
    }

    return this.renderService.getTableOfContents(id);
  }

  /**
   * Render tenant-owned manual as HTML
   */
  @Get(":id/render")
  @Header("Content-Type", "text/html")
  async renderManual(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("id") id: string,
    @Query("toc") includeToc?: string,
    @Query("cover") includeCover?: string,
    @Query("revisions") includeRevisions?: string,
    @Query("compact") compact?: string,
    @Query("viewId") viewId?: string,
    @Query("baseUrl") baseUrl?: string
  ) {
    const user = getUser(req);
    await this.assertTenantManualAccess(user.userId, user.companyId, id);

    const html = await this.renderService.renderManualHtml(id, {
      includeToc: includeToc !== "false",
      includeCoverPage: includeCover !== "false",
      includeRevisionMarkers: includeRevisions !== "false",
      compactToc: compact === "true",
      viewId: viewId || undefined,
      baseUrl: baseUrl || '',
      userContext: {
        userId: user.userId,
        userName: user.email,
      },
    });

    return reply.type("text/html").send(html);
  }

  /**
   * Download tenant-owned manual as PDF
   */
  @Get(":id/pdf")
  async downloadPdf(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param("id") id: string,
    @Query("compact") compact?: string,
    @Query("viewId") viewId?: string
  ) {
    const user = getUser(req);
    const manual = await this.assertTenantManualAccess(user.userId, user.companyId, id);

    if (!this.pdfService.isAvailable()) {
      throw new ServiceUnavailableException(
        "PDF generation is not available."
      );
    }

    const filename = this.pdfService.generateFilename(
      manual.title,
      manual.currentVersion
    );

    const pdfBuffer = await this.pdfService.generatePdf(id, {
      compactToc: compact === "true",
      viewId: viewId || undefined,
      userContext: {
        userId: user.userId,
        userName: user.email,
      },
    });

    return reply
      .type("application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdfBuffer);
  }
}
