import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
  Body,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SopSyncService } from "./sop-sync.service";
import { SystemDocumentsService } from "./system-documents.service";
import { RequiresModule } from "../billing/module.guard";

@RequiresModule('DOCUMENTS')
@Controller("admin/sops")
@UseGuards(JwtAuthGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class SopAdminController {
  constructor(
    private readonly sopSync: SopSyncService,
    private readonly systemDocs: SystemDocumentsService,
  ) {}

  /**
   * GET /admin/sops/staged
   * List all staged SOPs with their sync status
   */
  @Get("staged")
  async listStagedSops() {
    return this.sopSync.listStagedSops();
  }

  /**
   * GET /admin/sops/staged/:code
   * Get a single staged SOP with preview
   */
  @Get("staged/:code")
  async getStagedSop(@Param("code") code: string) {
    const sop = await this.sopSync.getStagedSop(code);
    if (!sop) {
      return { error: "SOP not found", code };
    }
    return sop;
  }

  /**
   * POST /admin/sops/sync
   * Sync all staged SOPs to SystemDocument
   * Body: { codes?: string[] } - optional list of specific codes to sync
   */
  @Post("sync")
  async syncSops(
    @Req() req: any,
    @Body() body: { codes?: string[] },
  ) {
    const actor = req.user as AuthenticatedUser;

    if (body.codes && body.codes.length > 0) {
      // Sync specific SOPs
      const results = [];
      for (const code of body.codes) {
        const result = await this.sopSync.syncSopByCode(code, actor);
        results.push(result);
      }
      return {
        timestamp: new Date().toISOString(),
        results,
        summary: {
          total: results.length,
          created: results.filter((r) => r.action === "created").length,
          updated: results.filter((r) => r.action === "updated").length,
          unchanged: results.filter((r) => r.action === "unchanged").length,
          errors: results.filter((r) => r.action === "error").length,
        },
      };
    }

    // Sync all
    return this.sopSync.syncAllSops(actor);
  }

  /**
   * POST /admin/sops/sync/:code
   * Sync a single SOP by code
   */
  @Post("sync/:code")
  async syncSingleSop(
    @Req() req: any,
    @Param("code") code: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.sopSync.syncSopByCode(code, actor);
  }

  /**
   * GET /admin/sops/cam-manual
   * Get CAM data grouped by module for the CAM System Manual.
   * Modules sorted by aggregate CAM score.
   */
  @Get("cam-manual")
  async getCamManual() {
    return this.sopSync.getCamManualData();
  }

  /**
   * GET /admin/sops/cam-detail/:code
   * Get a single CAM's rendered HTML content by its file code.
   */
  @Get("cam-detail/:code")
  async getCamDetail(@Param("code") code: string) {
    return this.sopSync.getCamDetailHtml(code);
  }

  /**
   * GET /admin/sops/cam-handbook-html
   * Get full CAM handbook with HTML content for print/handbook view.
   * Same grouping as cam-manual but includes rendered HTML body of each CAM.
   */
  @Get("cam-handbook-html")
  async getCamHandbookHtml() {
    return this.sopSync.getCamHandbookHtml();
  }

  /**
   * GET /admin/sops/elm-creek-manual
   * Get Elm Creek Prospectus data grouped by chapter for the document library card.
   */
  @Get("elm-creek-manual")
  async getElmCreekManual() {
    return this.sopSync.getElmCreekManualData();
  }

  /**
   * POST /admin/sops/sync-cams
   * Sync all CAM files from docs/cams/ to SystemDocument
   * and link to ModuleCatalog via camDocumentId.
   */
  @Post("sync-cams")
  async syncCams(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.sopSync.syncAllCams(actor);
  }

  // =============================================
  // System Documents Management (synced documents)
  // =============================================

  /**
   * GET /admin/sops/documents/search?q=<query>
   * Full-text search across all SystemDocuments (metadata + content).
   * Returns results grouped by category with highlighted snippets.
   */
  @Get("documents/search")
  async searchDocuments(@Query("q") q: string) {
    return this.systemDocs.searchDocuments(q);
  }

  /**
   * GET /admin/sops/documents
   * List all SystemDocuments with publication status
   */
  @Get("documents")
  async listSystemDocuments() {
    return this.systemDocs.listAll();
  }

  /**
   * GET /admin/sops/documents/:id
   * Get a single SystemDocument with full details
   */
  @Get("documents/:id")
  async getSystemDocument(@Param("id") id: string) {
    return this.systemDocs.getById(id);
  }

  /**
   * PATCH /admin/sops/documents/:id
   * Update SystemDocument metadata (title, description, tags, category)
   */
  @Patch("documents/:id")
  async updateSystemDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: {
      title?: string;
      description?: string;
      category?: string;
      subcategory?: string;
      tags?: string[];
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.systemDocs.update(id, body, actor);
  }

  /**
   * POST /admin/sops/documents/:id/publish
   * Publish a document to tenants
   * Body: { targetType: "ALL_TENANTS" | "SINGLE_TENANT", targetCompanyId?: string }
   */
  @Post("documents/:id/publish")
  async publishDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: {
      targetType: "ALL_TENANTS" | "SINGLE_TENANT";
      targetCompanyId?: string;
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.systemDocs.publish(id, body.targetType, body.targetCompanyId, actor);
  }

  /**
   * POST /admin/sops/documents/:id/unpublish
   * Retract a publication
   * Body: { publicationId: string }
   */
  @Post("documents/:id/unpublish")
  async unpublishDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { publicationId: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.systemDocs.unpublish(body.publicationId, actor);
  }
}
