import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { TenantClientService, CreateTenantClientDto, UpdateTenantClientDto } from "./tenant-client.service";

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
}
