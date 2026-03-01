import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, Roles, Role } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { RequiresModule } from "../billing/module.guard";
import { PlacardService } from "./placard.service";

@RequiresModule("ASSETS")
@UseGuards(JwtAuthGuard)
@Controller("placards")
export class PlacardController {
  constructor(private readonly placardService: PlacardService) {}

  /**
   * Assign a new Nex-Plac placard to an asset.
   * Returns the placard record + base64 QR data URL for label printing.
   * POST /placards/assign
   */
  @Post("assign")
  async assign(@Req() req: any, @Body() body: { assetId: string }) {
    const user = req.user as AuthenticatedUser;
    return this.placardService.assignPlacard(user.companyId, user, body.assetId);
  }

  /**
   * Verify a scanned QR payload and return the linked asset.
   * POST /placards/verify
   */
  @Post("verify")
  async verify(@Req() req: any, @Body() body: { qrPayload: string }) {
    const user = req.user as AuthenticatedUser;
    return this.placardService.verifyAndLookup(user.companyId, body.qrPayload);
  }

  /**
   * Void an active placard (e.g. lost, damaged, or reassigning).
   * POST /placards/:id/void
   */
  @Post(":id/void")
  @Roles(Role.OWNER, Role.ADMIN)
  async void(@Req() req: any, @Param("id") placardId: string) {
    const user = req.user as AuthenticatedUser;
    return this.placardService.voidPlacard(user.companyId, user, placardId);
  }

  /**
   * Get label data for (re)printing a placard label.
   * GET /placards/:id/label
   */
  @Get(":id/label")
  async getLabel(@Req() req: any, @Param("id") placardId: string) {
    const user = req.user as AuthenticatedUser;
    return this.placardService.getLabelData(user.companyId, placardId);
  }

  /**
   * Get the active placard for an asset (if any).
   * GET /placards/asset/:assetId
   */
  @Get("asset/:assetId")
  async getForAsset(@Req() req: any, @Param("assetId") assetId: string) {
    const user = req.user as AuthenticatedUser;
    return this.placardService.getActivePlacardForAsset(user.companyId, assetId);
  }
}
