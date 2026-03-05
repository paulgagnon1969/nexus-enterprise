import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { SupportSessionService } from "./support-session.service";

@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportSessionController {
  constructor(private readonly supportService: SupportSessionService) {}

  // ── Tickets ──────────────────────────────────────────────────────

  @Post("tickets")
  createTicket(
    @Req() req: any,
    @Body() body: { subject: string; description?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" },
  ) {
    return this.supportService.createTicket({
      companyId: req.user.companyId,
      createdById: req.user.userId,
      subject: body.subject,
      description: body.description,
      priority: body.priority,
    });
  }

  @Get("tickets")
  listTickets(
    @Req() req: any,
    @Query("role") role?: "client" | "agent",
    @Query("status") status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED",
  ) {
    return this.supportService.listTickets({
      companyId: req.user.companyId,
      userId: req.user.userId,
      role: role || "client",
      status,
    });
  }

  @Get("tickets/:id")
  getTicket(@Param("id") id: string) {
    return this.supportService.getTicket(id);
  }

  @Patch("tickets/:id")
  updateTicket(
    @Param("id") id: string,
    @Body() body: { status?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"; assignedToId?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" },
  ) {
    return this.supportService.updateTicket(id, body);
  }

  // ── Sessions ─────────────────────────────────────────────────────

  @Post("tickets/:id/session")
  createSession(@Param("id") ticketId: string, @Req() req: any) {
    return this.supportService.createSession(ticketId, req.user.userId);
  }

  @Get("sessions/:code")
  getSession(@Param("code") code: string) {
    return this.supportService.getSessionByCode(code);
  }

  @Patch("sessions/:id/mode")
  updateMode(
    @Param("id") id: string,
    @Body() body: { mode: "VIEW_ONLY" | "REMOTE_CONTROL" },
    @Req() req: any,
  ) {
    return this.supportService.updateSessionMode(id, body.mode, req.user.userId);
  }

  @Delete("sessions/:id")
  endSession(@Param("id") id: string, @Req() req: any) {
    return this.supportService.endSession(id, req.user.userId);
  }

  // ── TURN credentials ─────────────────────────────────────────────

  @Get("ice-servers")
  getIceServers(@Req() req: any) {
    return this.supportService.getTurnCredentials(req.user.userId);
  }

  // ── Downloads ─────────────────────────────────────────────────────

  @Get("download/:platform")
  getDownloadUrl(@Param("platform") platform: string) {
    return this.supportService.getDownloadUrl(platform);
  }
}
