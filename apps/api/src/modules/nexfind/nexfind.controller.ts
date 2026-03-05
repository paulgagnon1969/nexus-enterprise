import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, getEffectiveRoleLevel } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { RequiresModule } from "../billing/module.guard";
import { NexfindService } from "./nexfind.service";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) throw new ForbiddenException("Authentication required");
  return user;
}

function assertPmOrAbove(user: AuthenticatedUser) {
  const level = getEffectiveRoleLevel({
    globalRole: user.globalRole,
    role: user.role,
    profileCode: user.profileCode,
  });
  if (level < 60) {
    throw new ForbiddenException("PM-level access or higher required");
  }
}

@RequiresModule("NEXFIND")
@Controller("nexfind")
@UseGuards(JwtAuthGuard)
export class NexfindController {
  constructor(private readonly nexfind: NexfindService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Supplier Discovery
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /nexfind/discover
   * Trigger nearby supplier discovery for a location.
   * Body: { lat, lng, radiusMeters? }
   */
  @Post("discover")
  async discover(
    @Req() req: FastifyRequest,
    @Body() body: { lat: number; lng: number; radiusMeters?: number },
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (body.lat == null || body.lng == null) {
      throw new BadRequestException("lat and lng are required");
    }
    if (!user.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.nexfind.discoverNearby(
      user.companyId,
      body.lat,
      body.lng,
      body.radiusMeters,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation Capture
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /nexfind/navigate
   * Record a navigation event (user got directions to a supplier).
   * Body: { supplierId, projectId? }
   */
  @Post("navigate")
  async navigate(
    @Req() req: FastifyRequest,
    @Body() body: { supplierId: string; projectId?: string },
  ) {
    const user = getUser(req);

    if (!body.supplierId) {
      throw new BadRequestException("supplierId is required");
    }

    return this.nexfind.recordNavigation(user, body.supplierId, body.projectId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Product/Supplier Search
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /nexfind/search?q=...&lat=...&lng=...&radiusMiles=...
   * Search for nearby suppliers matching a product query.
   */
  @Get("search")
  async search(
    @Req() req: FastifyRequest,
    @Query("q") q: string,
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("radiusMiles") radiusMiles?: string,
  ) {
    const user = getUser(req);

    if (!q || q.trim().length < 2) {
      throw new BadRequestException("Search query (q) must be at least 2 characters");
    }
    if (!lat || !lng) {
      throw new BadRequestException("lat and lng are required");
    }
    if (!user.companyId) {
      throw new BadRequestException("Company context required");
    }

    return this.nexfind.searchNearby(
      user.companyId,
      q.trim(),
      Number(lat),
      Number(lng),
      radiusMiles ? Number(radiusMiles) : undefined,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Global Network (NexFIND Pro)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /nexfind/network?lat=...&lng=...&radiusMiles=...
   * Browse the global supplier network near a coordinate.
   */
  @Get("network")
  async network(
    @Req() req: FastifyRequest,
    @Query("lat") lat: string,
    @Query("lng") lng: string,
    @Query("radiusMiles") radiusMiles?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!lat || !lng) {
      throw new BadRequestException("lat and lng are required");
    }

    return this.nexfind.getNetworkSuppliers(
      Number(lat),
      Number(lng),
      radiusMiles ? Number(radiusMiles) : undefined,
    );
  }
}
