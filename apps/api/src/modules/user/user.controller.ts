import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
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
  @Get(":id/profile")
  profile(@Param("id") id: string, @Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.users.getProfile(id, actor);
  }
}
