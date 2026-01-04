import { Controller, Get, Patch, Param, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async listForMe(
    @Req() req: any,
    @Query("onlyUnread") onlyUnreadRaw?: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    const onlyUnread = onlyUnreadRaw === "true" || onlyUnreadRaw === "1";
    return this.notifications.listForUser(actor, { onlyUnread });
  }

  @Patch(":id/read")
  async markAsRead(@Req() req: any, @Param("id") id: string) {
    const actor = req.user as AuthenticatedUser;
    const updated = await this.notifications.markAsRead(actor, id);
    if (!updated) {
      return { ok: false, notFound: true };
    }
    return { ok: true, notification: updated };
  }
}
