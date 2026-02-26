import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { VideoService, SmartInvitee } from "./video.service";

@Controller("video")
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly video: VideoService) {}

  /**
   * Create a new video room. Returns the room + a join token for the caller.
   * Body: { projectId?: string }
   */
  @Post("rooms")
  async createRoom(
    @Req() req: any,
    @Body() body: { projectId?: string; callMode?: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.video.createRoom(actor, {
      projectId: body.projectId,
      companyId: actor.companyId,
      callMode: (body.callMode as "video" | "voice" | "radio") || "video",
    });
  }

  /**
   * Join an existing room. Returns a participant token.
   */
  @Post("rooms/:roomId/join")
  async joinRoom(
    @Req() req: any,
    @Param("roomId") roomId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.video.joinRoom(roomId, actor);
  }

  /**
   * End a room (hang up for everyone).
   */
  @Delete("rooms/:roomId")
  async endRoom(
    @Req() req: any,
    @Param("roomId") roomId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.video.endRoom(roomId, actor);
  }

  /**
   * List active rooms in the user's company.
   */
  @Get("rooms")
  async listActiveRooms(@Req() req: any) {
    const actor = req.user as AuthenticatedUser;
    return this.video.listActiveRooms(actor.companyId);
  }

  /**
   * Invite users to an active room (sends push notification).
   * Body: { userIds: string[] }
   */
  @Post("rooms/:roomId/invite")
  async inviteToRoom(
    @Req() req: any,
    @Param("roomId") roomId: string,
    @Body() body: { userIds: string[] },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.video.inviteToRoom(roomId, body.userIds, actor);
  }

  /**
   * Generate a guest join link for a non-Nexus participant.
   * Body: { guestName: string }
   * Returns: { token, joinUrl, expiresIn }
   */
  @Post("rooms/:roomId/guest-link")
  async createGuestLink(
    @Req() req: any,
    @Param("roomId") roomId: string,
    @Body() body: { guestName: string },
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.video.createGuestToken(roomId, body.guestName, actor);
  }

  /**
   * Smart invite — determine the best channel (push/sms/email) per invitee
   * and deliver the call invite.
   * Body: { invitees: Array<{ userId?, phone?, email?, name? }> }
   * Returns: { results: Array<{ name, channel, status, error? }> }
   */
  @Post("rooms/:roomId/smart-invite")
  async smartInvite(
    @Req() req: any,
    @Param("roomId") roomId: string,
    @Body() body: { invitees: SmartInvitee[] },
  ) {
    const actor = req.user as AuthenticatedUser;
    const results = await this.video.smartInvite(roomId, body.invitees, actor);
    return { results };
  }
}
