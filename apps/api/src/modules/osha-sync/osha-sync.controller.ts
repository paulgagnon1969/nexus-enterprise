import {
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { OshaSyncService } from "./osha-sync.service";

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

@Controller("system/osha")
@UseGuards(JwtAuthGuard)
export class OshaSyncController {
  constructor(private readonly oshaSync: OshaSyncService) {}

  /**
   * Get current sync status for OSHA 29 CFR 1926.
   */
  @Get("status")
  async getStatus(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.oshaSync.getSyncStatus();
  }

  /**
   * Quick check: does eCFR have newer amendments than our last sync?
   */
  @Get("check-updates")
  async checkUpdates(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.oshaSync.checkForUpdates();
  }

  /**
   * Trigger a full sync of 29 CFR 1926 from eCFR.
   * Fetches XML, parses all sections, upserts documents + manual structure.
   */
  @Post("sync")
  async triggerSync(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.oshaSync.syncOsha(user.userId);
  }
}
