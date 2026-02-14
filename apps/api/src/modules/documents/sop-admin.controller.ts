import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  Body,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SopSyncService } from "./sop-sync.service";

@Controller("admin/sops")
@UseGuards(JwtAuthGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class SopAdminController {
  constructor(private readonly sopSync: SopSyncService) {}

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
}
