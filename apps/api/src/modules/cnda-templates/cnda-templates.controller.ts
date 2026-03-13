import { Controller, Get, Post, Patch, Param, Body, Req, UseGuards, ForbiddenException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { CndaTemplatesService } from "./cnda-templates.service";

@Controller("cnda-templates")
@UseGuards(JwtAuthGuard)
export class CndaTemplatesController {
  constructor(private readonly templates: CndaTemplatesService) {}

  private assertSuperAdmin(user: AuthenticatedUser) {
    if (user.globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenException("SUPER_ADMIN access required");
    }
  }

  @Get()
  async list(@Req() req: any) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.templates.list();
  }

  @Get(":id")
  async getById(@Req() req: any, @Param("id") id: string) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.templates.getById(id);
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { name: string; htmlContent: string; isDefault?: boolean },
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSuperAdmin(user);
    return this.templates.create(user.userId, body);
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { name?: string; htmlContent?: string; isDefault?: boolean; active?: boolean },
  ) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.templates.update(id, body);
  }
}
