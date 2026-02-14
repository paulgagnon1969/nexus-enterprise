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
import { SystemTagsService } from "./system-tags.service";
import {
  CreateSystemTagDto,
  UpdateSystemTagDto,
  AssignTagsToCompanyDto,
  BulkAssignTagDto,
} from "./dto/system-tag.dto";

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

@Controller("system/tags")
@UseGuards(JwtAuthGuard)
export class SystemTagsController {
  constructor(private readonly service: SystemTagsService) {}

  // =========================================================================
  // System Tag CRUD
  // =========================================================================

  @Get()
  async listTags(
    @Req() req: FastifyRequest,
    @Query("includeInactive") includeInactive?: string,
    @Query("category") category?: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.listTags({
      includeInactive: includeInactive === "true",
      category: category || undefined,
    });
  }

  @Get("categories")
  async getTagCategories(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getTagCategories();
  }

  @Get(":id")
  async getTag(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getTag(id);
  }

  @Post()
  async createTag(@Req() req: FastifyRequest, @Body() dto: CreateSystemTagDto) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.createTag(user.userId, dto);
  }

  @Put(":id")
  async updateTag(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateSystemTagDto,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.updateTag(id, dto);
  }

  @Delete(":id")
  async deleteTag(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.deleteTag(id);
  }

  // =========================================================================
  // Company Tag Assignment
  // =========================================================================

  @Get(":id/companies")
  async getCompaniesByTag(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getCompaniesByTag(id);
  }

  @Post("bulk-assign")
  async bulkAssignTag(@Req() req: FastifyRequest, @Body() dto: BulkAssignTagDto) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.bulkAssignTag(user.userId, dto);
  }
}

// Separate controller for company-scoped tag endpoints
@Controller("system/companies")
@UseGuards(JwtAuthGuard)
export class CompanyTagsController {
  constructor(private readonly service: SystemTagsService) {}

  @Get(":companyId/tags")
  async getCompanyTags(@Req() req: FastifyRequest, @Param("companyId") companyId: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getCompanyTags(companyId);
  }

  @Post(":companyId/tags")
  async assignTagsToCompany(
    @Req() req: FastifyRequest,
    @Param("companyId") companyId: string,
    @Body() dto: AssignTagsToCompanyDto,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.assignTagsToCompany(companyId, user.userId, dto);
  }

  @Delete(":companyId/tags/:tagId")
  async removeTagFromCompany(
    @Req() req: FastifyRequest,
    @Param("companyId") companyId: string,
    @Param("tagId") tagId: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.removeTagFromCompany(companyId, tagId);
  }
}
