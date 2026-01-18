import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { LocationsService } from "./locations.service";

@UseGuards(JwtAuthGuard)
@Controller("inventory/holdings")
export class InventoryHoldingsController {
  constructor(private readonly locations: LocationsService) {}

  @Get("location/:locationId")
  async getHoldingsForLocation(@Req() req: any, @Param("locationId") locationId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      return {
        location: null,
        assets: [],
        materialLots: [],
        particles: [],
      };
    }
    return this.locations.getHoldingsForLocation(user.companyId, locationId);
  }

  @Get("me")
  async getMyHoldings(@Req() req: any) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId || !user?.userId) {
      return {
        location: null,
        assets: [],
        materialLots: [],
        particles: [],
      };
    }
    return this.locations.getHoldingsForPerson(user.companyId, user.userId);
  }

  @Post("location/:locationId/move-asset")
  async moveAsset(
    @Req() req: any,
    @Param("locationId") locationId: string,
    @Body() body: { assetId: string; reason?: string; note?: string },
  ) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId || !user?.userId) {
      throw new Error("Missing company context");
    }
    if (!body?.assetId) {
      throw new Error("assetId is required");
    }
    return this.locations.moveAsset({
      companyId: user.companyId,
      actorUserId: user.userId,
      assetId: body.assetId,
      toLocationId: locationId,
      reason: body.reason,
      note: body.note,
    });
  }

  @Get("location/:locationId/history")
  async getLocationHistory(@Req() req: any, @Param("locationId") locationId: string) {
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.companyId) {
      return [];
    }
    return this.locations.getRecentMovementsForLocation(user.companyId, locationId);
  }
}
