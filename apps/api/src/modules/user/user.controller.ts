import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { UserService } from "./user.service";
import { JwtAuthGuard } from "../auth/auth.guards";
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
}
