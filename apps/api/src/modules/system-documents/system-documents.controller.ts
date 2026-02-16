import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SystemDocumentsService } from "./system-documents.service";
import {
  CreateSystemDocumentDto,
  UpdateSystemDocumentDto,
  PublishSystemDocumentDto,
  CopyToOrgDto,
  UpdateTenantCopyDto,
  RollbackTenantCopyDto,
} from "./dto/system-document.dto";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) {
    throw new ForbiddenException("Authentication required");
  }
  return user;
}

function assertSuperAdmin(user: AuthenticatedUser) {
  if (user.globalRole !== GlobalRole.SUPER_ADMIN) {
    throw new ForbiddenException("SUPER_ADMIN access required");
  }
}

@Controller("system-documents")
@UseGuards(JwtAuthGuard)
export class SystemDocumentsController {
  constructor(private readonly service: SystemDocumentsService) {}

  // =========================================================================
  // SUPER_ADMIN: System Document Management
  // =========================================================================

  @Get("dashboard-stats")
  async getDashboardStats(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getDashboardStats();
  }

  @Get()
  async listSystemDocuments(
    @Req() req: FastifyRequest,
    @Query("includeInactive") includeInactive?: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.listSystemDocuments({
      includeInactive: includeInactive === "true",
    });
  }

  @Get(":id")
  async getSystemDocument(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getSystemDocument(id);
  }

  @Post()
  async createSystemDocument(
    @Req() req: FastifyRequest,
    @Body() dto: CreateSystemDocumentDto,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.createSystemDocument(user.userId, dto);
  }

  @Put(":id")
  async updateSystemDocument(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateSystemDocumentDto,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.updateSystemDocument(id, user.userId, dto);
  }

  @Delete(":id")
  async deleteSystemDocument(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.deleteSystemDocument(id);
  }

  // =========================================================================
  // SUPER_ADMIN: Publication Management
  // =========================================================================

  @Post(":id/publish")
  async publishDocument(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: PublishSystemDocumentDto,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.publishDocument(id, user.userId, dto);
  }

  @Post("publications/:publicationId/retract")
  async retractPublication(
    @Req() req: FastifyRequest,
    @Param("publicationId") publicationId: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.retractPublication(publicationId, user.userId);
  }

  @Get(":id/publications")
  async getPublications(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getPublications(id);
  }
}

// Separate controller for tenant-facing endpoints
@Controller("tenant/system-documents")
@UseGuards(JwtAuthGuard)
export class TenantSystemDocumentsController {
  constructor(private readonly service: SystemDocumentsService) {}

  @Get()
  async listPublishedDocuments(@Req() req: FastifyRequest) {
    const user = getUser(req);
    return this.service.listPublishedForTenant(user.companyId);
  }

  @Get(":id")
  async getPublishedDocument(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.getPublishedDocument(user.companyId, id);
  }

  @Post(":id/copy")
  async copyToOrg(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: CopyToOrgDto,
  ) {
    const user = getUser(req);
    return this.service.copyToOrg(user.companyId, user.userId, id, dto);
  }
}

// Controller for managing tenant's document copies
@Controller("tenant/document-copies")
@UseGuards(JwtAuthGuard)
export class TenantDocumentCopiesController {
  constructor(private readonly service: SystemDocumentsService) {}

  @Get()
  async listCopies(@Req() req: FastifyRequest) {
    const user = getUser(req);
    return this.service.listTenantCopies(user.companyId);
  }

  @Get(":id")
  async getCopy(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.getTenantCopy(user.companyId, id);
  }

  @Put(":id")
  async updateCopy(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateTenantCopyDto,
  ) {
    const user = getUser(req);
    return this.service.updateTenantCopy(user.companyId, id, user.userId, dto);
  }

  @Post(":id/rollback")
  async rollbackCopy(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: RollbackTenantCopyDto,
  ) {
    const user = getUser(req);
    return this.service.rollbackTenantCopy(user.companyId, id, dto.versionNo);
  }

  @Post(":id/refresh")
  async refreshFromSource(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    return this.service.refreshFromSystemDocument(user.companyId, id, user.userId);
  }
}
