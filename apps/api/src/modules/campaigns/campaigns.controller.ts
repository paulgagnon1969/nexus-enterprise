import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import type { AuthenticatedUser } from "../auth/jwt.strategy";
import { CampaignsService } from "./campaigns.service";

@Controller("campaigns")
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  private assertSuperAdmin(user: AuthenticatedUser) {
    if (user.globalRole !== "SUPER_ADMIN") {
      throw new ForbiddenException("SUPER_ADMIN access required");
    }
  }

  /* ── List / Get ────────────────────────────────────────────────── */

  @Get()
  async list(@Req() req: any) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.list();
  }

  /* ── PIP Users (must be before :id param route) ────────────────── */

  @Get("pip-users")
  async getPipUsers(@Req() req: any) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.getPipUsers();
  }

  @Get(":id")
  async getById(@Req() req: any, @Param("id") id: string) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.getById(id);
  }

  /* ── Create / Update ───────────────────────────────────────────── */

  @Post()
  async create(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      slug: string;
      description?: string;
      cndaTemplateId: string;
      questionnaireEnabled?: boolean;
      questionnaireConfig?: any;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSuperAdmin(user);
    return this.campaigns.create(user.userId, body);
  }

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      slug?: string;
      description?: string;
      cndaTemplateId?: string;
      questionnaireEnabled?: boolean;
      questionnaireConfig?: any;
    },
  ) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.update(id, body);
  }

  /* ── Status transitions ────────────────────────────────────────── */

  @Post(":id/activate")
  async activate(@Req() req: any, @Param("id") id: string) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.activate(id);
  }

  @Post(":id/pause")
  async pause(@Req() req: any, @Param("id") id: string) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.pause(id);
  }

  @Post(":id/archive")
  async archive(@Req() req: any, @Param("id") id: string) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.archive(id);
  }

  /* ── Document management ───────────────────────────────────────── */

  @Post(":id/documents")
  async addDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { systemDocumentId: string },
  ) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.addDocument(id, body.systemDocumentId);
  }

  @Delete(":id/documents/:docId")
  async removeDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Param("docId") docId: string,
  ) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.removeDocument(id, docId);
  }

  @Post(":id/documents/reorder")
  async reorderDocuments(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: { documentIds: string[] },
  ) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.reorderDocuments(id, body.documentIds);
  }

  /* ── Invite Picker ───────────────────────────────────────────────── */

  @Get(":id/invite-picker")
  async getInvitePickerData(
    @Req() req: any,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("search") search?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSuperAdmin(user);
    const limit = limitRaw ? parseInt(limitRaw, 10) || 200 : 200;
    return this.campaigns.getCampaignInvitePickerData(
      id,
      user,
      cursor,
      search,
      Math.min(limit, 500),
    );
  }

  @Get(":id/invite-picker/invitees")
  async getInvitePickerInvitees(
    @Req() req: any,
    @Param("id") id: string,
  ) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.getCampaignInvitePickerInvitees(id);
  }

  /* ── Invite ──────────────────────────────────────────────────────── */

  @Post(":id/invite")
  async invite(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      inviteeEmail: string;
      inviteeName?: string;
      message?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSuperAdmin(user);

    const portalBaseUrl =
      process.env.PORTAL_BASE_URL ||
      process.env.NEXT_PUBLIC_WEB_URL ||
      "https://staging-ncc.nfsgrp.com";

    return this.campaigns.inviteAndSend(
      id,
      user.userId,
      user.email,
      user.email,
      body.inviteeEmail,
      body.inviteeName,
      body.message,
      portalBaseUrl,
    );
  }

  @Post(":id/invite/group")
  async groupInvite(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      contactIds: string[];
      pipUserEmails?: string[];
      message: string;
      groupName?: string;
      deliveryMethods: Array<"email" | "sms">;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSuperAdmin(user);
    return this.campaigns.sendCampaignGroupInvite(id, user, body);
  }

  @Post(":id/batch-invite")
  async batchInvite(
    @Req() req: any,
    @Param("id") id: string,
    @Body()
    body: {
      invitees: { email: string; name?: string }[];
      message?: string;
    },
  ) {
    const user = req.user as AuthenticatedUser;
    this.assertSuperAdmin(user);

    const portalBaseUrl =
      process.env.PORTAL_BASE_URL ||
      process.env.NEXT_PUBLIC_WEB_URL ||
      "https://staging-ncc.nfsgrp.com";

    const results = [];
    for (const invitee of body.invitees) {
      try {
        const result = await this.campaigns.inviteAndSend(
          id,
          user.userId,
          user.email,
          user.email,
          invitee.email,
          invitee.name,
          body.message,
          portalBaseUrl,
        );
        results.push({ ...result, success: true });
      } catch (err: any) {
        results.push({
          inviteeEmail: invitee.email,
          success: false,
          error: err?.message || "Failed to send invite",
        });
      }
    }

    return {
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /* ── Analytics ───────────────────────────────────────────────────── */

  @Get(":id/analytics")
  async getAnalytics(@Req() req: any, @Param("id") id: string) {
    this.assertSuperAdmin(req.user as AuthenticatedUser);
    return this.campaigns.getAnalytics(id);
  }
}
