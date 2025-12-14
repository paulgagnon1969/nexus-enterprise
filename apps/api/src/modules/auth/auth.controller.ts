import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RegisterDto, LoginDto, ChangePasswordDto } from "./dto/auth.dto";
import { JwtAuthGuard } from "./auth.guards";
import { AuthenticatedUser } from "./jwt.strategy";
import { AcceptInviteDto } from "./dto/accept-invite.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
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

  @Post("refresh")
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Post("accept-invite")
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto.token, dto.password);
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
