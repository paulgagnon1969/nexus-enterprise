import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CompanyService } from "./company.service";
import { JwtAuthGuard, Roles, Role, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CreateInviteDto } from "./dto/invite.dto";
import { UpsertOfficeDto } from "./dto/office.dto";
import { UpsertLandingConfigDto } from "./dto/landing-config.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Controller("companies")
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getCurrent(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.companies.getCurrentCompany(user.companyId, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch("me")
  updateCurrent(@Req() req: any, @Body() dto: UpdateCompanyDto) {
    const user = req.user as AuthenticatedUser;
    return this.companies.updateCurrentCompany(user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post()
  create(@Req() req: any, @Body("name") name: string) {
    const user = req.user as AuthenticatedUser;
    return this.companies.createCompany(name, user.userId, user);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get(":id/members")
  listMembers(@Param("id") companyId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.listMembers(companyId, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get("me/members")
  listMyMembers(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.listMembers(actor.companyId, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get(":id/invites")
  listInvites(@Param("id") companyId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.listInvites(companyId, actor);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/invites")
  createInvite(
    @Param("id") companyId: string,
    @Req() req: any,
    @Body() dto: CreateInviteDto
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.createInvite(companyId, dto.email, dto.role, actor);
  }

  // Update a member's role within the company (OWNER/ADMIN only)
  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post(":id/members/:userId/role")
  updateMemberRole(
    @Param("id") companyId: string,
    @Param("userId") userId: string,
    @Req() req: any,
    @Body("role") role: Role
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.updateMemberRole(companyId, userId, role, actor);
  }

  // --- Company offices ---

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Get("me/offices")
  listMyOffices(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.listOfficesForCurrentCompany(actor);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Post("me/offices")
  createMyOffice(@Req() req: any, @Body() dto: UpsertOfficeDto) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.createOfficeForCurrentCompany(actor, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Patch("me/offices/:id")
  updateMyOffice(
    @Req() req: any,
    @Param("id") officeId: string,
    @Body() dto: UpsertOfficeDto,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.updateOfficeForCurrentCompany(actor, officeId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete("me/offices/:id")
  deleteMyOffice(@Req() req: any, @Param("id") officeId: string) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.softDeleteOfficeForCurrentCompany(actor, officeId);
  }

  // --- Branding / landing configuration (login + worker registration) ---

  @UseGuards(JwtAuthGuard)
  @Get("me/landing-config")
  getLandingConfig(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.getLandingConfigForCurrentCompany(actor);
  }

   @UseGuards(JwtAuthGuard)
  @Post("me/landing-config")
  upsertLandingConfig(@Req() req: any, @Body() body: any) {
    const actor = req.user as AuthenticatedUser;
    // body is expected to look like:
    // { login: { logoUrl, headline, subheadline }, worker: { ... } }
    return this.companies.upsertLandingConfigForCurrentCompany(actor, body);
  }

  // Public (unauthenticated) landing configuration lookup by company id.
  @Get(":id/landing-config-public")
  getLandingConfigPublic(@Param("id") companyId: string) {
    return this.companies.getLandingConfigByCompanyId(companyId);
  }

  // System-wide (unauthenticated) landing configuration for Nexus
  // Contractor-Connect. This is what the public /login and /apply pages use.
  @Get("system-landing-config-public")
  getSystemLandingConfigPublic() {
    return this.companies.getSystemLandingConfig();
  }

  // SUPER_ADMIN-only system landing configuration editor (Nexus System only).
  @UseGuards(JwtAuthGuard)
  @Get("system-landing-config")
  getSystemLandingConfig(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    if (actor.globalRole !== GlobalRole.SUPER_ADMIN) {
      throw new Error("Only SUPER_ADMIN can view system landing configuration");
    }
    return this.companies.getSystemLandingConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Post("system-landing-config")
  upsertSystemLandingConfig(@Req() req: any, @Body() body: any) {
    const actor = req.user as AuthenticatedUser;
    return this.companies.upsertSystemLandingConfig(actor, body);
  }

  // --- Logo / branding assets ---

  @UseGuards(JwtAuthGuard)
  @Post("me/logo")
  async uploadCompanyLogo(@Req() req: FastifyRequest) {
    const actor = (req as any).user as AuthenticatedUser;
    return this.companies.uploadCompanyLogo(actor, req);
  }
}
