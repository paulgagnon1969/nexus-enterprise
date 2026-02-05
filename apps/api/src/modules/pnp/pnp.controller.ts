import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PnpService } from "./pnp.service";

@UseGuards(JwtAuthGuard)
@Controller("pnp")
export class PnpController {
  constructor(private readonly pnp: PnpService) {}

  /**
   * List all PnP documents for the tenant.
   * Non-admin users only see approved documents.
   */
  @Get()
  listDocuments(
    @Req() req: any,
    @Query("includeRejected") includeRejected?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.listTenantDocuments(actor, includeRejected === "true");
  }

  /**
   * List documents pending review (ADMIN/OWNER only).
   */
  @Get("pending")
  listPending(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.listPendingReview(actor);
  }

  /**
   * Get a single document with version history.
   */
  @Get(":id")
  getDocument(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.getTenantDocument(actor, id);
  }

  /**
   * Get rendered document with disclaimer injected.
   */
  @Get(":id/rendered")
  getRendered(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.getRenderedDocument(actor, id);
  }

  /**
   * Update a document (ADMIN/OWNER only).
   * Triggers fork if modifying system-seeded content.
   */
  @Patch(":id")
  updateDocument(
    @Param("id") id: string,
    @Req() req: any,
    @Body("title") title?: string,
    @Body("description") description?: string,
    @Body("htmlContent") htmlContent?: string,
    @Body("versionLabel") versionLabel?: string,
    @Body("versionNotes") versionNotes?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.updateTenantDocument(actor, id, {
      title,
      description,
      htmlContent,
      versionLabel,
      versionNotes,
    });
  }

  /**
   * Approve a document (ADMIN/OWNER only).
   */
  @Post(":id/approve")
  approveDocument(
    @Param("id") id: string,
    @Req() req: any,
    @Body("notes") notes?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.approveDocument(actor, id, notes);
  }

  /**
   * Reject a document (ADMIN/OWNER only).
   */
  @Post(":id/reject")
  rejectDocument(
    @Param("id") id: string,
    @Req() req: any,
    @Body("notes") notes?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.rejectDocument(actor, id, notes);
  }

  /**
   * Revert a forked document to the latest system version (ADMIN/OWNER only).
   */
  @Post(":id/revert")
  revertDocument(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.revertToSystemVersion(actor, id);
  }
}
