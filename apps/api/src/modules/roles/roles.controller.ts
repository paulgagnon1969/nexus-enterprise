import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { RolesService } from "./roles.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("roles")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // List standard + custom profiles visible to this company
  @UseGuards(JwtAuthGuard)
  @Get("profiles")
  async listProfiles(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.roles.listProfilesForCompany(user.companyId);
  }

  // Get one profile with its permissions
  @UseGuards(JwtAuthGuard)
  @Get("profiles/:id")
  async getProfile(@Param("id") id: string) {
    return this.roles.getProfileWithPermissions(id);
  }

  // List all permission resources (for building the matrix UI)
  @UseGuards(JwtAuthGuard)
  @Get("resources")
  async listResources() {
    return this.roles.listResources();
  }
}
