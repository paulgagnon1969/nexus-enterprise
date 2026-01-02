import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { ProjectGroupService } from "./project-group.service";

@Controller("project-groups")
@UseGuards(JwtAuthGuard)
export class ProjectGroupController {
  constructor(private readonly projectGroupService: ProjectGroupService) {}

  @Get(":id/employees")
  async getGroupEmployees(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.projectGroupService.getGroupEmployees(user, id);
  }
}
