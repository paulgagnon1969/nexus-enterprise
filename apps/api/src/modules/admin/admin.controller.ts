import { Body, Controller, Get, Param, Req, Post, UseGuards } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
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

  @Get("companies/:id/projects")
  listCompanyProjects(@Param("id") companyId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.listCompanyProjects(companyId, actor);
  }

  // --- Templates (SORM) ---

  @Get("templates")
  listTemplates(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.listTemplates(actor);
  }

  @Post("templates")
  createTemplate(
    @Req() req: any,
    @Body("code") code: string,
    @Body("label") label: string,
    @Body("description") description?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.createTemplate(actor, { code, label, description });
  }

  @Get("templates/:id")
  getTemplate(@Param("id") templateId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.getTemplate(actor, templateId);
  }

  // Daily-coalesced sync from Nexus System → template current version.
  @Post("templates/:id/sync-from-system")
  syncTemplateFromSystem(@Param("id") templateId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.syncTemplateFromSystem(actor, templateId);
  }

  // Provision a new organization from a template.
  @Post("companies/provision")
  provisionCompany(
    @Req() req: any,
    @Body("name") name: string,
    @Body("templateId") templateId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.provisionCompanyFromTemplate(actor, { name, templateId });
  }

  // Provision a TRIAL organization from a template (admin-only helper for now).
  @Post("trials/provision")
  provisionTrialCompany(
    @Req() req: any,
    @Body("name") name: string,
    @Body("templateId") templateId: string,
    @Body("trialDays") trialDays?: number,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.provisionTrialCompanyFromTemplate(actor, { name, templateId, trialDays });
  }

  // Reconcile an existing organization to the template's current version.
  @Post("companies/:id/reconcile-template")
  reconcileCompanyTemplate(@Param("id") companyId: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.reconcileCompanyToLatestTemplate(actor, companyId);
  }

  @Get("audit-logs")
  listAuditLogs() {
    return this.admin.listAuditLogs(100);
  }

  @Get("reputation/pending")
  listPendingReputation() {
    return this.admin.listPendingReputation(100);
  }

  @Post("reputation/:id/approve")
  approveReputation(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.moderateReputation(actor, id, "APPROVED");
  }

  @Post("reputation/:id/reject")
  rejectReputation(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.moderateReputation(actor, id, "REJECTED");
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

  // One-time helper: ensure all SUPER_ADMIN users have access to every company.
  @Post("backfill-superadmin-memberships")
  backfillSuperAdminMemberships(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.backfillSuperAdminMemberships(actor);
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

  // Create or update a user with a specific password and attach to a company.
  @Post("create-user-with-password")
  createUserWithPassword(
    @Req() req: any,
    @Body("email") email: string,
    @Body("password") password: string,
    @Body("companyId") companyId: string,
    @Body("role") role: string,
    @Body("userType") userType?: string
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.admin.createUserWithPassword(actor, {
      email,
      password,
      companyId,
      role,
      userType
    });
  }
}
