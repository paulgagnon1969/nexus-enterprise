import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  UseGuards,
  Body,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SopSyncService } from "./sop-sync.service";
import { SystemDocumentsService } from "./system-documents.service";

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

  // =============================================
  // System Documents Management (synced documents)
  // =============================================

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
