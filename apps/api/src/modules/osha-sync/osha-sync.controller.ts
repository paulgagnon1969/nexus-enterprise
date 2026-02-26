import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { OshaSyncService } from "./osha-sync.service";
import { RequiresModule } from "../billing/module.guard";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) throw new ForbiddenException("Authentication required");
  return user;
}

function assertSuperAdmin(user: AuthenticatedUser) {
  if (user.globalRole !== "SUPER_ADMIN") {
    throw new ForbiddenException("SUPER_ADMIN role required");
  }
}

@RequiresModule('COMPLIANCE')
@Controller("system/osha")
@UseGuards(JwtAuthGuard)
export class OshaSyncController {
  constructor(private readonly oshaSync: OshaSyncService) {}

  /**
   * Get current sync status for OSHA 29 CFR 1926 (backward-compat).
   */
  @Get("status")
  async getStatus(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.oshaSync.getSyncStatus();
  }

  /**
   * Quick check: does eCFR have newer amendments than our last sync? (backward-compat)
   */
  @Get("check-updates")
  async checkUpdates(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.oshaSync.checkForUpdates();
  }

  /**
   * Trigger a full sync of 29 CFR 1926 from eCFR (backward-compat).
   */
  @Post("sync")
  async triggerSync(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.oshaSync.syncOsha(user.userId);
  }
}

// =============================================================================
// Unified CFR Sync Controller (Phase 2 — multi-title support)
// =============================================================================

@RequiresModule('COMPLIANCE')
@Controller("system/cfr")
@UseGuards(JwtAuthGuard)
export class CfrSyncController {
  constructor(private readonly oshaSync: OshaSyncService) {}

  /** List all available CFR sync configurations with their current status. */
  @Get("configs")
  async listConfigs(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const configs = this.oshaSync.getConfigs();
    const results = await Promise.all(
      configs.map(async (config) => {
        const status = await this.oshaSync.getSyncStatusForConfig(config);
        return { ...config, status };
      }),
    );

    return { configs: results };
  }

  /** Get sync status for a specific CFR config. */
  @Get("status/:configCode")
  async getConfigStatus(
    @Req() req: FastifyRequest,
    @Param("configCode") configCode: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const config = this.oshaSync.getConfig(configCode);
    if (!config) throw new NotFoundException(`Unknown config: ${configCode}`);

    return this.oshaSync.getSyncStatusForConfig(config);
  }

  /** Check for updates on a specific CFR config. */
  @Get("check-updates/:configCode")
  async checkConfigUpdates(
    @Req() req: FastifyRequest,
    @Param("configCode") configCode: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const config = this.oshaSync.getConfig(configCode);
    if (!config) throw new NotFoundException(`Unknown config: ${configCode}`);

    return this.oshaSync.checkForUpdatesOnConfig(config);
  }

  /** Trigger sync for a specific CFR config. */
  @Post("sync/:configCode")
  async triggerConfigSync(
    @Req() req: FastifyRequest,
    @Param("configCode") configCode: string,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);

    const config = this.oshaSync.getConfig(configCode);
    if (!config) throw new NotFoundException(`Unknown config: ${configCode}`);

    return this.oshaSync.syncCfr(user.userId, config);
  }
}
