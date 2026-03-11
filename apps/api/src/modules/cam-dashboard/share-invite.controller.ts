import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  JwtAuthGuard,
  MinRoleLevel,
  MinRoleLevelGuard,
} from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import {
  CamDashboardService,
  type SendInviteDto,
  type BulkInviteDto,
} from "./cam-dashboard.service";

/**
 * Share-invite endpoints — OWNER+ (role level ≥ 90).
 * Allows Owners and Super Admins to send CAM Library and Master Class
 * invites from both web and mobile.
 */
@UseGuards(JwtAuthGuard, MinRoleLevelGuard)
@MinRoleLevel(90)
@Controller("share-invite")
export class ShareInviteController {
  constructor(private readonly svc: CamDashboardService) {}

  @Post("cam")
  sendCamInvite(@Req() req: any, @Body() dto: SendInviteDto) {
    return this.svc.sendInvite(req.user as AuthenticatedUser, dto);
  }

  @Post("master-class")
  sendMasterClassInvite(@Req() req: any, @Body() dto: SendInviteDto) {
    return this.svc.sendMasterClassInvite(req.user as AuthenticatedUser, dto);
  }

  @Post("bulk")
  sendBulkInvites(@Req() req: any, @Body() dto: BulkInviteDto) {
    return this.svc.sendBulkInvites(req.user as AuthenticatedUser, dto);
  }

  @Get("my-invites")
  async myInvites(@Req() req: any) {
    const user = req.user as AuthenticatedUser;
    return this.svc.getInvitesBySender(user.userId);
  }
}
