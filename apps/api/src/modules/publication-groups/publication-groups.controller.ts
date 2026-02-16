import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PublicationGroupsService } from "./publication-groups.service";
import {
  CreatePublicationGroupDto,
  UpdatePublicationGroupDto,
  UpdateGroupMembersDto,
} from "./dto/publication-group.dto";

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

@Controller("publication-groups")
@UseGuards(JwtAuthGuard)
export class PublicationGroupsController {
  constructor(private readonly service: PublicationGroupsService) {}

  @Get()
  async listGroups(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.listGroups();
  }

  @Get(":id")
  async getGroup(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getGroup(id);
  }

  @Post()
  async createGroup(@Req() req: FastifyRequest, @Body() dto: CreatePublicationGroupDto) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.createGroup(user.userId, dto);
  }

  @Put(":id")
  async updateGroup(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePublicationGroupDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.updateGroup(id, dto);
  }

  @Delete(":id")
  async deleteGroup(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.deleteGroup(id);
  }

  @Put(":id/members")
  async updateMembers(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() dto: UpdateGroupMembersDto
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.updateMembers(id, dto.companyIds);
  }

  @Get(":id/members")
  async getMembers(@Req() req: FastifyRequest, @Param("id") id: string) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.service.getMembers(id);
  }
}
