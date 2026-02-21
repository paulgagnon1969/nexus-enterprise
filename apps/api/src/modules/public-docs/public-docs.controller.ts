import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  Query,
  Headers,
} from "@nestjs/common";
import { JwtAuthGuard, GlobalRoles, GlobalRolesGuard, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PublicDocsService } from "./public-docs.service";
import {
  AccessShareLinkDto,
  AccessSecureShareDto,
  CreateShareLinkDto,
  CreateSecureShareDto,
  UpdatePublicSettingsDto,
  CreateReaderGroupDto,
  UpdateReaderGroupDto,
  AddReaderGroupMembersDto,
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

  /**
   * Verify secure share link with email + password
   * No auth required - validates token, email match, and password
   */
  @Post(":token/verify")
  async verifySecureShareLink(
    @Param("token") token: string,
    @Body() dto: AccessSecureShareDto
  ) {
    return this.service.accessSecureShareLink(token, dto.email, dto.password);
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

  /**
   * Create secure per-recipient share links for a manual + send emails
   */
  @Post(":id/secure-share")
  async createSecureShare(
    @Param("id") id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateSecureShareDto,
    @Headers("origin") origin?: string
  ) {
    const user = getUser(req);
    const baseUrl = origin || process.env.WEB_BASE_URL || "http://localhost:3000";
    return this.service.createSecureManualShare(id, user.userId, dto, baseUrl);
  }

  /**
   * List secure shares for a manual
   */
  @Get(":id/secure-shares")
  async listSecureShares(@Param("id") id: string) {
    return this.service.listSecureManualShares(id);
  }
}

/**
 * Secure Share Management for Documents (Admin)
 * Endpoints for creating per-recipient secure share links
 */
@Controller("system/documents")
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
export class SecureDocumentShareController {
  constructor(private readonly service: PublicDocsService) {}

  /**
   * Create secure per-recipient share links for a document + send emails
   */
  @Post(":id/secure-share")
  async createSecureShare(
    @Param("id") id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateSecureShareDto,
    @Headers("origin") origin?: string
  ) {
    const user = getUser(req);
    const baseUrl = origin || process.env.WEB_BASE_URL || "http://localhost:3000";
    return this.service.createSecureDocumentShare(id, user.userId, dto, baseUrl);
  }

  /**
   * List secure shares for a document
   */
  @Get(":id/secure-shares")
  async listSecureShares(@Param("id") id: string) {
    return this.service.listSecureDocumentShares(id);
  }
}

/**
 * Reader Groups Controller (Admin)
 * Manage named groups of email recipients for bulk secure sharing
 */
@Controller("system/reader-groups")
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
export class ReaderGroupController {
  constructor(private readonly service: PublicDocsService) {}

  @Get()
  async listGroups() {
    return this.service.listReaderGroups();
  }

  @Post()
  async createGroup(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateReaderGroupDto
  ) {
    const user = getUser(req);
    return this.service.createReaderGroup(user.userId, dto);
  }

  @Get(":id")
  async getGroup(@Param("id") id: string) {
    return this.service.getReaderGroup(id);
  }

  @Patch(":id")
  async updateGroup(
    @Param("id") id: string,
    @Body() dto: UpdateReaderGroupDto
  ) {
    return this.service.updateReaderGroup(id, dto);
  }

  @Post(":id/members")
  async addMembers(
    @Param("id") id: string,
    @Body() dto: AddReaderGroupMembersDto
  ) {
    return this.service.addReaderGroupMembers(id, dto);
  }

  @Delete(":id/members/:memberId")
  async removeMember(
    @Param("id") id: string,
    @Param("memberId") memberId: string
  ) {
    return this.service.removeReaderGroupMember(id, memberId);
  }

  @Delete(":id")
  async deleteGroup(@Param("id") id: string) {
    return this.service.deleteReaderGroup(id);
  }
}
