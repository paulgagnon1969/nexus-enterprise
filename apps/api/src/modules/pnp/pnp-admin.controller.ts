import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PnpService } from "./pnp.service";
import { PnpCategory } from "@prisma/client";

/**
 * Admin controller for managing the NEXUS System PnP library.
 * All endpoints require SUPER_ADMIN global role.
 */
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
@Controller("admin/pnp")
export class PnpAdminController {
  constructor(private readonly pnp: PnpService) {}

  /**
   * List all system PnP documents.
   */
  @Get()
  listSystemDocuments() {
    return this.pnp.listSystemDocuments();
  }

  /**
   * Get a single system document with version history.
   */
  @Get(":id")
  getSystemDocument(@Param("id") id: string) {
    return this.pnp.getSystemDocument(id);
  }

  /**
   * Create a new system PnP document.
   */
  @Post()
  createSystemDocument(
    @Req() req: any,
    @Body("code") code: string,
    @Body("title") title: string,
    @Body("category") category: PnpCategory,
    @Body("description") description?: string,
    @Body("htmlContent") htmlContent?: string,
    @Body("versionLabel") versionLabel?: string,
    @Body("releaseNotes") releaseNotes?: string,
    @Body("effectiveDate") effectiveDate?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.createSystemDocument(actor.userId, {
      code,
      title,
      category,
      description,
      htmlContent: htmlContent || "",
      versionLabel,
      releaseNotes,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
    });
  }

  /**
   * Update a system PnP document (creates new version if content changes).
   */
  @Patch(":id")
  updateSystemDocument(
    @Param("id") id: string,
    @Req() req: any,
    @Body("title") title?: string,
    @Body("description") description?: string,
    @Body("active") active?: boolean,
    @Body("sortOrder") sortOrder?: number,
    @Body("htmlContent") htmlContent?: string,
    @Body("versionLabel") versionLabel?: string,
    @Body("releaseNotes") releaseNotes?: string,
    @Body("effectiveDate") effectiveDate?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.pnp.updateSystemDocument(actor.userId, id, {
      title,
      description,
      active,
      sortOrder,
      htmlContent,
      versionLabel,
      releaseNotes,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
    });
  }

  /**
   * Seed PnP documents to a specific tenant.
   */
  @Post("seed-tenant/:companyId")
  seedToTenant(
    @Param("companyId") companyId: string,
    @Body("documentIds") documentIds?: string[]
  ) {
    return this.pnp.seedDocumentsToTenant(companyId, documentIds);
  }

  /**
   * Seed PnP documents to all active tenants.
   */
  @Post("seed-all")
  seedToAllTenants(@Body("documentIds") documentIds?: string[]) {
    return this.pnp.seedDocumentsToAllTenants(documentIds);
  }
}
