import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { UserService } from "./user.service";
import { JwtAuthGuard, GlobalRolesGuard, GlobalRoles, GlobalRole } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("users")
export class UserController {
  constructor(private readonly users: UserService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.users.getMe(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateMe(
    @Req() req: any,
    @Body("firstName") firstName?: string,
    @Body("lastName") lastName?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.users.updateMe(user.userId, { firstName, lastName });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me/portfolio")
  myPortfolio(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.users.getMyPortfolio(actor);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me/portfolio")
  updateMyPortfolio(@Req() req: any, @Body() body: any) {
    const actor = req.user as AuthenticatedUser;
    return this.users.updateMyPortfolio(actor, body ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/profile")
  profile(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.users.getProfile(id, actor);
  }

  // Company-level admin can update per-user userType within their company.
  @UseGuards(JwtAuthGuard)
  @Patch(":id/user-type")
  updateUserType(
    @Param("id") targetUserId: string,
    @Req() req: any,
    @Body("userType") userType: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.users.updateUserType(actor, targetUserId, userType);
  }

  // Only SUPER_ADMIN can change globalRole, system-wide.
  @UseGuards(JwtAuthGuard, GlobalRolesGuard)
  @GlobalRoles(GlobalRole.SUPER_ADMIN)
  @Patch(":id/global-role")
  updateGlobalRole(
    @Param("id") targetUserId: string,
    @Req() req: any,
    @Body("globalRole") globalRole: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.users.updateGlobalRole(actor, targetUserId, globalRole);
  }
}
