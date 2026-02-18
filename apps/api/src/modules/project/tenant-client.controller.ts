import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { TenantClientService, CreateTenantClientDto, UpdateTenantClientDto } from "./tenant-client.service";
import { ProjectVisibilityLevel } from "@prisma/client";

@Controller("clients")
@UseGuards(JwtAuthGuard)
export class TenantClientController {
  constructor(private readonly tenantClientService: TenantClientService) {}

  /**
   * GET /clients/search?q=<query>
   * Search for clients by name, email, or phone.
   */
  @Get("search")
  async search(@Req() req: any, @Query("q") query: string) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return [];
    }
    return this.tenantClientService.search(companyId, query || "");
  }

  /**
   * GET /clients
   * List all clients for the current tenant.
   */
  @Get()
  async list(@Req() req: any, @Query("includeInactive") includeInactive?: string) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return [];
    }
    return this.tenantClientService.list(companyId, includeInactive === "true");
  }

  /**
   * GET /clients/:id
   * Get a single client with their linked projects.
   */
  @Get(":id")
  async getById(@Req() req: any, @Param("id") clientId: string) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return null;
    }
    return this.tenantClientService.getById(companyId, clientId);
  }

  /**
   * POST /clients
   * Create a new client.
   */
  @Post()
  async create(@Req() req: any, @Body() dto: CreateTenantClientDto) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error("Company context required");
    }
    return this.tenantClientService.create(companyId, dto);
  }

  /**
   * POST /clients/from-user
   * Create a client record from an existing Nexus user.
   * 
   * This is used when a tenant admin finds an existing user in the marketplace
   * and wants to add them as a client. The TenantClient is created and immediately
   * linked to the User, granting them portal access.
   */
  @Post("from-user")
  async createFromUser(
    @Req() req: any,
    @Body() body: { userId: string; email: string },
  ) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error("Company context required");
    }
    return this.tenantClientService.createFromExistingUser(companyId, body.userId, body.email);
  }

  /**
   * PATCH /clients/:id
   * Update an existing client.
   */
  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") clientId: string,
    @Body() dto: UpdateTenantClientDto,
  ) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error("Company context required");
    }
    return this.tenantClientService.update(companyId, clientId, dto);
  }

  /**
   * POST /clients/:id/invite
   * Invite a client to the portal.
   * 
   * Creates or links a User account for the client, granting them access
   * to view their projects. The client can then log in and see all projects
   * linked to their TenantClient record.
   * 
   * Optional body params:
   * - visibility: "FULL" | "LIMITED" | "READ_ONLY" (default: "LIMITED")
   */
  @Post(":id/invite")
  async inviteToPortal(
    @Req() req: any,
    @Param("id") clientId: string,
    @Body() body?: { visibility?: string },
  ) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error("Company context required");
    }

    // Parse visibility level
    let visibility: ProjectVisibilityLevel | undefined;
    if (body?.visibility) {
      const v = body.visibility.toUpperCase();
      if (v === "FULL" || v === "LIMITED" || v === "READ_ONLY") {
        visibility = v as ProjectVisibilityLevel;
      }
    }

    return this.tenantClientService.inviteToPortal(companyId, clientId, { visibility });
  }

  /**
   * DELETE /clients/:id/portal-access
   * Revoke a client's portal access.
   * 
   * Unlinks the User from the TenantClient and removes their ProjectMemberships
   * for all projects linked to this client.
   */
  @Delete(":id/portal-access")
  async revokePortalAccess(
    @Req() req: any,
    @Param("id") clientId: string,
  ) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new Error("Company context required");
    }
    return this.tenantClientService.revokePortalAccess(companyId, clientId);
  }
}
