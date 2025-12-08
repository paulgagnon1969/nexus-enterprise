import { Body, Controller, Get, Param, Req, Post, UseGuards } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { GlobalRolesGuard, GlobalRoles } from "../auth/auth.guards";
import { GlobalRole } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { AuthService } from "../auth/auth.service";

@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@GlobalRoles(GlobalRole.SUPER_ADMIN)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService
  ) {}

  @Get("companies")
  listCompanies(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.listCompanies(actor);
  }

  @Get("companies/:id/users")
  listCompanyUsers(@Param("id") companyId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.listCompanyUsers(companyId, actor);
  }

  @Get("audit-logs")
  listAuditLogs() {
    return this.admin.listAuditLogs(100);
  }

  @Post("impersonate")
  impersonate(
    @Req() req: any,
    @Body("userId") userId: string,
    @Body("companyId") companyId?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.auth.adminImpersonate(actor, userId, companyId);
  }

  // Dev helper: seed one user per Role (OWNER, ADMIN, MEMBER, CLIENT)
  @Post("seed-role-users")
  seedRoleUsers(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.seedRoleUsersForCompany(actor);
  }

  // Attach an existing user (by email) to a company with a given Role.
  @Post("add-company-member")
  addCompanyMember(
    @Req() req: any,
    @Body("email") email: string,
    @Body("companyId") companyId: string,
    @Body("role") role: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.addUserToCompanyByEmail(actor, { email, companyId, role });
  }
}
