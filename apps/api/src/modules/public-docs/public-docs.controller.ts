import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard, GlobalRoles, GlobalRolesGuard, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PublicDocsService } from "./public-docs.service";
import {
  AccessShareLinkDto,
  CreateShareLinkDto,
  UpdatePublicSettingsDto,
} from "./dto/public-doc.dto";

// Helper to extract user from request
function getUser(req: { user: AuthenticatedUser }): AuthenticatedUser {
  return req.user;
}

/**
 * Public Portal Controller
 * Landing page listing all public content (no auth required)
 */
@Controller("portal")
export class PublicPortalController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Get all public manuals and documents
   * No auth required
   */
  @Get()
  async getPublicPortal() {
    return this.service.getPublicPortal();
  }
}

/**
 * Public Documents Controller
 * Endpoints for accessing public documents and share links (no auth required)
 */
@Controller("docs")
export class PublicDocsController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Get a public document by slug
   * No auth required - document must have isPublic=true
   */
  @Get(":slug")
  async getPublicDocument(@Param("slug") slug: string) {
    return this.service.getPublicDocument(slug);
  }
}

/**
 * Public Manuals Controller
 * Endpoints for accessing public manuals (no auth required)
 */
@Controller("manuals/public")
export class PublicManualsController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Get a public manual by slug
   * No auth required - manual must have isPublic=true
   */
  @Get(":slug")
  async getPublicManual(@Param("slug") slug: string) {
    return this.service.getPublicManual(slug);
  }
}

/**
 * Share Links Controller
 * Endpoints for accessing content via share tokens (no auth required)
 */
@Controller("share")
export class ShareLinksController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Access content via share link token
   * No auth required - validates token, expiration, and optional passcode
   */
  @Get(":token")
  async accessShareLink(
    @Param("token") token: string,
    @Query("passcode") passcode?: string
  ) {
    return this.service.accessShareLink(token, passcode);
  }

  /**
   * Access content with passcode in body (for forms)
   */
  @Post(":token")
  async accessShareLinkWithPasscode(
    @Param("token") token: string,
    @Body() dto: AccessShareLinkDto
  ) {
    return this.service.accessShareLink(token, dto.passcode);
  }
}

/**
 * Share Link Management Controller (Admin)
 * Endpoints for managing share links and public settings (auth required)
 */
@Controller("system/documents")
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
export class DocumentShareManagementController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Update document public settings (slug, isPublic)
   */
  @Post(":id/public-settings")
  async updatePublicSettings(
    @Param("id") id: string,
    @Body() dto: UpdatePublicSettingsDto
  ) {
    return this.service.updateDocumentPublicSettings(id, dto);
  }

  /**
   * List share links for a document
   */
  @Get(":id/share-links")
  async listShareLinks(@Param("id") id: string) {
    return this.service.listDocumentShareLinks(id);
  }

  /**
   * Create a share link for a document
   */
  @Post(":id/share-links")
  async createShareLink(
    @Param("id") id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateShareLinkDto
  ) {
    const user = getUser(req);
    return this.service.createDocumentShareLink(id, user.userId, dto);
  }

  /**
   * Revoke a share link
   */
  @Post("share-links/:linkId/revoke")
  async revokeShareLink(@Param("linkId") linkId: string) {
    return this.service.revokeShareLink(linkId);
  }

  /**
   * Delete a share link
   */
  @Delete("share-links/:linkId")
  async deleteShareLink(@Param("linkId") linkId: string) {
    return this.service.deleteShareLink(linkId);
  }
}

/**
 * Manual Share Management Controller (Admin)
 * Endpoints for managing manual share links and public settings (auth required)
 */
@Controller("system/manuals")
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
export class ManualShareManagementController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Update manual public settings (slug, isPublic)
   */
  @Post(":id/public-settings")
  async updatePublicSettings(
    @Param("id") id: string,
    @Body() dto: UpdatePublicSettingsDto
  ) {
    return this.service.updateManualPublicSettings(id, dto);
  }

  /**
   * List share links for a manual
   */
  @Get(":id/share-links")
  async listShareLinks(@Param("id") id: string) {
    return this.service.listManualShareLinks(id);
  }

  /**
   * Create a share link for a manual
   */
  @Post(":id/share-links")
  async createShareLink(
    @Param("id") id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateShareLinkDto
  ) {
    const user = getUser(req);
    return this.service.createManualShareLink(id, user.userId, dto);
  }
}
