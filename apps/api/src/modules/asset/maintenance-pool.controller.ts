import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { MaintenancePoolRepository } from "../../infra/prisma-v1/maintenance-pool.repository";
import { RequiresModule } from "../billing/module.guard";

@RequiresModule('ASSETS')
@UseGuards(JwtAuthGuard)
@Controller("maintenance-pools")
export class MaintenancePoolController {
  constructor(private readonly pools: MaintenancePoolRepository) {}

  @Get()
  async list(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.pools.listPools(user.companyId);
  }

  @Get(":id")
  async getById(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.pools.getPool(user.companyId, id);
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { name: string; description?: string | null },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.pools.createPool(user.companyId, body.name, body.description);
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { name?: string; description?: string | null },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.pools.updatePool(user.companyId, id, body);
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const user = req.user as AuthenticatedUser;
    return this.pools.deletePool(user.companyId, id);
  }

  // ── Members ──────────────────────────────────────────────────────

  @Post(":id/members")
  async addMember(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { userId: string },
  ) {
    const user = req.user as AuthenticatedUser;
    return this.pools.addMember(user.companyId, id, body.userId);
  }

  @Delete(":id/members/:userId")
  async removeMember(
    @Req() req: any,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.pools.removeMember(user.companyId, id, userId);
  }

  // ── Notification resolution ────────────────────────────────────

  @Get(":id/recipients/:assetId")
  async getRecipients(
    @Req() req: any,
    @Param("assetId") assetId: string,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.pools.getMaintenanceRecipients(user.companyId, assetId);
  }
}
