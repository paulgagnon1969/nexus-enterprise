import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { RequiresModule } from "../billing/module.guard";
import { DispositionRepository } from "../../infra/prisma-v1/disposition.repository";
import { AssetTagRepository } from "../../infra/prisma-v1/asset-tag.repository";

// ── Dispositions ──────────────────────────────────────────────────────

@RequiresModule("ASSETS")
@UseGuards(JwtAuthGuard)
@Controller("asset-dispositions")
export class DispositionController {
  constructor(private readonly repo: DispositionRepository) {}

  @Get()
  async list(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.repo.list(user.companyId);
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { code: string; label: string; color?: string; isTerminal?: boolean },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.repo.create(user.companyId, body);
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { label?: string; color?: string; sortOrder?: number; isTerminal?: boolean },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.repo.update(user.companyId, id, body);
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.repo.remove(user.companyId, id);
  }
}

// ── Tags ──────────────────────────────────────────────────────────────

@RequiresModule("ASSETS")
@UseGuards(JwtAuthGuard)
@Controller("asset-tags")
export class AssetTagController {
  constructor(private readonly repo: AssetTagRepository) {}

  @Get()
  async list(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.repo.list(user.companyId);
  }

  @Post()
  async create(@Req() req: any, @Body() body: { label: string; color?: string }) {
    const user = req.user as AuthenticatedUser;
    return this.repo.create(user.companyId, body);
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { label?: string; color?: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.repo.update(user.companyId, id, body);
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.repo.remove(user.companyId, id);
  }
}
