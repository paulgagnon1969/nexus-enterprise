import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard, Roles, RolesGuard, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { TenantDocumentsService } from "./tenant-documents.service";
import {
  PublishDocumentDto,
  ArchiveDocumentDto,
  UpdateTenantDocumentDto,
  PublishManualDto,
} from "./dto/tenant-document.dto";

// Helper to extract user from request
function getUser(req: { user: AuthenticatedUser }): AuthenticatedUser {
  return req.user;
}

/**
 * Tenant Documents Controller
 * Handles document inbox management for tenant companies.
 * Requires ADMIN or OWNER role (tenant-level admin).
 */
@Controller("tenant/documents")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class TenantDocumentsController {
  constructor(private readonly service: TenantDocumentsService) {}

  /**
   * Get inbox stats (count of unreleased documents/manuals)
   */
  @Get("stats")
  async getStats(@Req() req: { user: AuthenticatedUser }) {
    const user = getUser(req);
    return this.service.getInboxStats(user.companyId);
  }

  /**
   * Get all documents and manuals in the inbox (UNRELEASED status)
   */
  @Get("inbox")
  async getInbox(@Req() req: { user: AuthenticatedUser }) {
    const user = getUser(req);
    return this.service.getDocumentInbox(user.companyId);
  }

  /**
   * Get all published documents and manuals
   */
  @Get("published")
  async getPublished(@Req() req: { user: AuthenticatedUser }) {
    const user = getUser(req);
    return this.service.getPublishedDocuments(user.companyId);
  }

  /**
   * Get a specific document by ID
   */
  @Get(":id")
  async getDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string
  ) {
    const user = getUser(req);
    return this.service.getDocument(user.companyId, id);
  }

  /**
   * Update a document (title, internal notes)
   */
  @Patch(":id")
  async updateDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
    @Body() dto: UpdateTenantDocumentDto
  ) {
    const user = getUser(req);
    return this.service.updateDocument(user.companyId, id, dto);
  }

  /**
   * Publish a document to the tenant organization
   */
  @Post(":id/publish")
  async publishDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
    @Body() dto: PublishDocumentDto
  ) {
    const user = getUser(req);
    return this.service.publishDocument(user.companyId, id, user.userId, dto);
  }

  /**
   * Archive a document (hide from users)
   */
  @Post(":id/archive")
  async archiveDocument(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
    @Body() dto: ArchiveDocumentDto
  ) {
    const user = getUser(req);
    return this.service.archiveDocument(user.companyId, id, user.userId, dto);
  }
}

/**
 * Tenant Manuals Controller
 * Handles manual inbox management for tenant companies.
 * Requires ADMIN or OWNER role (tenant-level admin).
 */
@Controller("tenant/manuals")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OWNER)
export class TenantManualsController {
  constructor(private readonly service: TenantDocumentsService) {}

  /**
   * Get a specific manual by ID with full structure
   */
  @Get(":id")
  async getManual(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string
  ) {
    const user = getUser(req);
    return this.service.getManual(user.companyId, id);
  }

  /**
   * Publish a manual to the tenant organization
   */
  @Post(":id/publish")
  async publishManual(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string,
    @Body() dto: PublishManualDto
  ) {
    const user = getUser(req);
    return this.service.publishManual(user.companyId, id, user.userId, dto);
  }

  /**
   * Archive a manual (hide from users)
   */
  @Post(":id/archive")
  async archiveManual(
    @Req() req: { user: AuthenticatedUser },
    @Param("id") id: string
  ) {
    const user = getUser(req);
    return this.service.archiveManual(user.companyId, id);
  }
}
