import { Body, Controller, Get, Post, Req, UseGuards, Query } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto, ChangePasswordDto } from "./dto/auth.dto";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles, GlobalRole } from "./auth.guards";
import { AuthenticatedUser } from "./jwt.strategy";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // --- Organization onboarding (Nexus System → new tenant owners) ---

  // SUPER_ADMIN only: create an org invite and send an email with a link to
  // /org-onboarding?token=...
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Post("org-invites")
  createOrgInvite(@Req() req: any, @Body("email") email: string, @Body("expiresInDays") expiresInDays?: number) {
    const actor = req.user as AuthenticatedUser;
    return this.auth.createOrgInvite(actor, email, expiresInDays);
  }

  // Public: validate an organization invite token and return basic metadata
  // (email + expiry) so the web wizard can display it.
  @Get("org-onboarding")
  getOrgInvite(@Query("token") token: string) {
    return this.auth.getOrgInvite(token);
  }

  // Public: complete org onboarding (create owner user, company, first office)
  // and return login tokens.
  @Post("org-onboarding")
  completeOrgOnboarding(
    @Body()
    body: {
      token: string;
      password: string;
      companyName: string;
      officeLabel?: string;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      state: string;
      postalCode: string;
      country?: string | null;
    },
  ) {
    return this.auth.completeOrgOnboarding(body);
  }

  // One-time bootstrap: create or promote a user to SUPER_ADMIN when none exist yet.
  // This route has no auth guards by design but will refuse to run once a SUPER_ADMIN exists.
  @Post("bootstrap-superadmin")
  bootstrapSuperAdmin(@Body("email") email: string, @Body("password") password: string) {
    return this.auth.bootstrapSuperAdmin(email, password);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  // Public: request a password reset link by email.
  // Always returns ok=true to avoid user enumeration.
  @Post("request-password-reset")
  requestPasswordReset(@Body("email") email: string) {
    return this.auth.requestPasswordReset(email);
  }

  // Public: reset password using a one-time token sent to email.
  @Post("reset-password")
  resetPassword(@Body("token") token: string, @Body("password") password: string) {
    return this.auth.resetPasswordWithToken(token, password);
  }

  // --- Client Portal Registration ---

  // Public: validate a client invite token and return metadata for the registration form.
  @Get("client-register")
  getClientInvite(@Query("token") token: string) {
    return this.auth.getClientInviteInfo(token);
  }

  // Public: complete client registration (set password) using invite token.
  @Post("client-register")
  completeClientRegistration(
    @Body() body: { token: string; password: string },
  ) {
    return this.auth.completeClientRegistration(body.token, body.password);
  }

  @Post("refresh")
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Post("accept-invite")
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto.token, dto.password);
  }

  // For logged-in users following a company invite link, preview whether
  // accepting the invite would switch organizations.
  @UseGuards(JwtAuthGuard)
  @Post("company-invites/preview")
  previewCompanyInvite(@Req() req: any, @Body("token") token: string) {
    const actor = req.user as AuthenticatedUser;
    return this.auth.previewCompanyInviteForCurrentUser(actor, token);
  }

  // For logged-in users, confirm whether to stay with their current org or
  // switch to the invited org. On "switch", this will update memberships and
  // return fresh tokens for the new company context.
  @UseGuards(JwtAuthGuard)
  @Post("company-invites/confirm")
  confirmCompanyInviteChoice(
    @Req() req: any,
    @Body()
    body: {
      token: string;
      choice: "stay" | "switch";
    },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.auth.confirmCompanyInviteOrgChoice(actor, body.token, body.choice);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = req.user as AuthenticatedUser;
    return this.auth.changePassword(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("switch-company")
  switchCompany(@Req() req: any, @Body("companyId") companyId: string) {
    const user = req.user as AuthenticatedUser;
    return this.auth.switchCompany(user.userId, companyId);
  }
}
