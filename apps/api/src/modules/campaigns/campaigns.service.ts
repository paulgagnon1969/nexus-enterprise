import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CampaignStatus, ShareDocumentType } from "@prisma/client";
import { EmailService } from "../../common/email.service";
import { MessageBirdSmsClient } from "../../common/messagebird-sms.client";
import * as crypto from "crypto";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  globalRole: string;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly sms: MessageBirdSmsClient,
  ) {}

  /* ---------------------------------------------------------------- */
  /*  List / Get                                                       */
  /* ---------------------------------------------------------------- */

  async list() {
    const campaigns = await this.prisma.securePortalCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        cndaTemplate: { select: { id: true, name: true } },
        documents: {
          orderBy: { sortOrder: "asc" },
          include: {
            systemDocument: { select: { id: true, code: true, title: true } },
          },
        },
        _count: { select: { shareTokens: true } },
      },
    });

    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      status: c.status,
      cndaTemplate: c.cndaTemplate,
      questionnaireEnabled: c.questionnaireEnabled,
      documentCount: c.documents.length,
      documents: c.documents.map((d) => ({
        id: d.id,
        systemDocumentId: d.systemDocumentId,
        code: d.systemDocument.code,
        title: d.systemDocument.title,
        sortOrder: d.sortOrder,
      })),
      inviteCount: c._count.shareTokens,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getById(id: string) {
    const c = await this.prisma.securePortalCampaign.findUnique({
      where: { id },
      include: {
        cndaTemplate: true,
        documents: {
          orderBy: { sortOrder: "asc" },
          include: {
            systemDocument: {
              select: { id: true, code: true, title: true, category: true },
            },
          },
        },
        _count: { select: { shareTokens: true } },
      },
    });
    if (!c) throw new NotFoundException("Campaign not found");
    return c;
  }

  /* ---------------------------------------------------------------- */
  /*  Create / Update                                                  */
  /* ---------------------------------------------------------------- */

  async create(
    userId: string,
    data: {
      name: string;
      slug: string;
      description?: string;
      cndaTemplateId: string;
      questionnaireEnabled?: boolean;
      questionnaireConfig?: any;
    },
  ) {
    // Validate CNDA template exists
    const cnda = await this.prisma.cndaTemplate.findUnique({
      where: { id: data.cndaTemplateId },
    });
    if (!cnda) throw new BadRequestException("CNDA template not found");

    // Slugify
    const slug = data.slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return this.prisma.securePortalCampaign.create({
      data: {
        name: data.name,
        slug,
        description: data.description ?? null,
        cndaTemplateId: data.cndaTemplateId,
        questionnaireEnabled: data.questionnaireEnabled ?? true,
        questionnaireConfig: data.questionnaireConfig ?? undefined,
        status: CampaignStatus.DRAFT,
        createdById: userId,
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      cndaTemplateId?: string;
      questionnaireEnabled?: boolean;
      questionnaireConfig?: any;
    },
  ) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.cndaTemplateId !== undefined) updateData.cndaTemplateId = data.cndaTemplateId;
    if (data.questionnaireEnabled !== undefined) updateData.questionnaireEnabled = data.questionnaireEnabled;
    if (data.questionnaireConfig !== undefined) updateData.questionnaireConfig = data.questionnaireConfig;
    if (data.slug !== undefined) {
      updateData.slug = data.slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    }

    return this.prisma.securePortalCampaign.update({
      where: { id },
      data: updateData,
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Status transitions                                               */
  /* ---------------------------------------------------------------- */

  async activate(id: string) {
    const campaign = await this.prisma.securePortalCampaign.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.documents.length === 0) {
      throw new BadRequestException("Campaign must have at least one document before activation");
    }

    return this.prisma.securePortalCampaign.update({
      where: { id },
      data: { status: CampaignStatus.ACTIVE },
    });
  }

  async pause(id: string) {
    return this.prisma.securePortalCampaign.update({
      where: { id },
      data: { status: CampaignStatus.PAUSED },
    });
  }

  async archive(id: string) {
    return this.prisma.securePortalCampaign.update({
      where: { id },
      data: { status: CampaignStatus.ARCHIVED },
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Document management                                              */
  /* ---------------------------------------------------------------- */

  async addDocument(campaignId: string, systemDocumentId: string) {
    // Verify the document exists
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: systemDocumentId },
    });
    if (!doc) throw new NotFoundException("System document not found");

    // Get the next sort order
    const maxSort = await this.prisma.campaignDocument.aggregate({
      where: { campaignId },
      _max: { sortOrder: true },
    });

    return this.prisma.campaignDocument.create({
      data: {
        campaignId,
        systemDocumentId,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async removeDocument(campaignId: string, documentId: string) {
    return this.prisma.campaignDocument.delete({
      where: { id: documentId, campaignId },
    });
  }

  async reorderDocuments(campaignId: string, documentIds: string[]) {
    const updates = documentIds.map((id, i) =>
      this.prisma.campaignDocument.update({
        where: { id, campaignId },
        data: { sortOrder: i },
      }),
    );
    await this.prisma.$transaction(updates);
    return { success: true };
  }

  /* ---------------------------------------------------------------- */
  /*  Invite token creation (for campaign invites)                     */
  /* ---------------------------------------------------------------- */

  async createInviteToken(
    campaignId: string,
    inviterUserId: string,
    inviterEmail: string,
    inviterName: string,
    inviteeEmail: string,
    inviteeName?: string,
  ) {
    const campaign = await this.prisma.securePortalCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException("Campaign must be ACTIVE to send invites");
    }

    const token = crypto.randomBytes(24).toString("hex");

    return this.prisma.documentShareToken.create({
      data: {
        token,
        documentType: ShareDocumentType.SECURE_PORTAL,
        documentRef: campaign.slug,
        campaignId,
        inviterEmail,
        inviterName,
        inviterUserId,
        inviteeEmail: inviteeEmail.toLowerCase().trim(),
        inviteeName: inviteeName ?? null,
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Invite + send email                                              */
  /* ---------------------------------------------------------------- */

  async inviteAndSend(
    campaignId: string,
    inviterUserId: string,
    inviterEmail: string,
    inviterName: string,
    inviteeEmail: string,
    inviteeName: string | undefined,
    message: string | undefined,
    portalBaseUrl: string,
  ) {
    const tokenRecord = await this.createInviteToken(
      campaignId,
      inviterUserId,
      inviterEmail,
      inviterName,
      inviteeEmail,
      inviteeName,
    );

    const campaign = await this.prisma.securePortalCampaign.findUnique({
      where: { id: campaignId },
    });

    const shareUrl = `${portalBaseUrl}/portal/${tokenRecord.token}`;

    await this.email.sendPortalInvite({
      toEmail: inviteeEmail,
      recipientName: inviteeName,
      inviterName,
      campaignName: campaign?.name ?? "Secure Document Portal",
      message,
      shareUrl,
    });

    this.logger.log(
      `Portal invite sent: campaign=${campaignId}, to=${inviteeEmail}`,
    );

    return {
      token: tokenRecord.token,
      inviteeEmail: tokenRecord.inviteeEmail,
      inviteeName: tokenRecord.inviteeName,
      shareUrl,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  PIP Users — all trusted portal users across CAM + campaigns      */
  /* ---------------------------------------------------------------- */

  async getPipUsers() {
    // All tokens where CNDA was accepted (trusted users)
    const tokens = await this.prisma.documentShareToken.findMany({
      where: {
        documentType: { in: [ShareDocumentType.CAM_LIBRARY, ShareDocumentType.SECURE_PORTAL] },
        cndaAcceptedAt: { not: null },
        inviteeEmail: { not: null },
      },
      select: {
        inviteeEmail: true,
        inviteeName: true,
        documentType: true,
        viewCount: true,
        campaignId: true,
        campaign: { select: { id: true, name: true } },
      },
    });

    // Deduplicate by email
    const byEmail = new Map<
      string,
      {
        email: string;
        name: string | null;
        documentTypes: Set<string>;
        campaigns: Map<string, string>;
        viewCount: number;
      }
    >();

    for (const t of tokens) {
      const email = t.inviteeEmail!.toLowerCase();
      let entry = byEmail.get(email);
      if (!entry) {
        entry = {
          email,
          name: t.inviteeName,
          documentTypes: new Set(),
          campaigns: new Map(),
          viewCount: 0,
        };
        byEmail.set(email, entry);
      }
      entry.documentTypes.add(t.documentType);
      entry.viewCount += t.viewCount;
      if (!entry.name && t.inviteeName) entry.name = t.inviteeName;
      if (t.campaign) {
        entry.campaigns.set(t.campaign.id, t.campaign.name);
      }
    }

    return Array.from(byEmail.values())
      .map((e) => ({
        email: e.email,
        name: e.name,
        documentTypes: Array.from(e.documentTypes),
        campaigns: Array.from(e.campaigns.entries()).map(([id, name]) => ({ id, name })),
        viewCount: e.viewCount,
      }))
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  }

  /* ---------------------------------------------------------------- */
  /*  Campaign Invite Picker — contacts + existing invitees             */
  /* ---------------------------------------------------------------- */

  async getCampaignInvitePickerData(
    campaignId: string,
    actor: AuthenticatedUser,
    cursor?: string,
    search?: string,
    limit = 200,
  ) {
    // 1. Get already-invited emails for THIS campaign
    const existingTokens = await this.prisma.documentShareToken.findMany({
      where: { campaignId, documentType: ShareDocumentType.SECURE_PORTAL },
      select: { inviteeEmail: true },
    });
    const invitedEmails = new Set(
      existingTokens
        .map((t) => t.inviteeEmail?.toLowerCase())
        .filter(Boolean) as string[],
    );

    // 2. Fetch contacts (cursor-based)
    const where: any = {
      ownerUserId: actor.userId,
      camExcluded: false,
      email: { not: null },
    };

    if (search?.trim()) {
      const term = search.trim();
      where.OR = [
        { displayName: { contains: term, mode: "insensitive" } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term } },
      ];
    }

    const contacts = await this.prisma.personalContact.findMany({
      where,
      orderBy: { displayName: "asc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        source: true,
      },
    });

    const hasMore = contacts.length > limit;
    const page = hasMore ? contacts.slice(0, limit) : contacts;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    const available = page.filter(
      (c) => c.email && !invitedEmails.has(c.email.toLowerCase()),
    );

    const excludedCount = await this.prisma.personalContact.count({
      where: { ownerUserId: actor.userId, camExcluded: true },
    });

    return { contacts: available, nextCursor, hasMore, excludedCount };
  }

  async getCampaignInvitePickerInvitees(campaignId: string) {
    const tokens = await this.prisma.documentShareToken.findMany({
      where: { campaignId, documentType: ShareDocumentType.SECURE_PORTAL },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        inviteeEmail: true,
        inviteeName: true,
        viewCount: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        createdAt: true,
        camInviteGroupId: true,
      },
    });

    return tokens.map((t) => ({
      id: t.id,
      email: t.inviteeEmail,
      name: t.inviteeName,
      viewCount: t.viewCount,
      status: t.cndaAcceptedAt
        ? t.questionnaireCompletedAt
          ? "viewing"
          : "cnda_accepted"
        : t.viewCount > 0
          ? "opened"
          : "pending",
      createdAt: t.createdAt,
      groupId: t.camInviteGroupId,
    }));
  }

  /* ---------------------------------------------------------------- */
  /*  Campaign Group Invite — bulk send with group tracking             */
  /* ---------------------------------------------------------------- */

  async sendCampaignGroupInvite(
    campaignId: string,
    actor: AuthenticatedUser,
    dto: {
      contactIds: string[];
      pipUserEmails?: string[];
      message: string;
      groupName?: string;
      deliveryMethods: Array<"email" | "sms">;
    },
  ) {
    const campaign = await this.prisma.securePortalCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException("Campaign must be ACTIVE to send invites");
    }

    const totalCount = (dto.contactIds?.length ?? 0) + (dto.pipUserEmails?.length ?? 0);
    if (totalCount === 0) {
      throw new BadRequestException("No contacts or PIP users selected");
    }
    if (totalCount > 200) {
      throw new BadRequestException("Maximum 200 invitees per group invite");
    }

    // Look up inviter
    const inviter = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const inviterName =
      `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() ||
      actor.email;

    // Create invite group
    const now = new Date();
    const defaultName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    const group = await this.prisma.camInviteGroup.create({
      data: {
        ownerUserId: actor.userId,
        name: dto.groupName?.trim() || defaultName,
        messageUsed: dto.message,
      },
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const results: Array<{
      email: string;
      success: boolean;
      shareUrl?: string;
      error?: string;
      source: "contact" | "pip-user";
    }> = [];

    // Helper to create token + send
    const processInvitee = async (
      email: string,
      name: string | null,
      phone: string | null,
      source: "contact" | "pip-user",
    ) => {
      try {
        const token = crypto.randomBytes(24).toString("hex");
        await this.prisma.documentShareToken.create({
          data: {
            token,
            documentType: ShareDocumentType.SECURE_PORTAL,
            documentRef: campaign.slug,
            campaignId,
            inviterEmail: actor.email,
            inviterName,
            inviterUserId: actor.userId,
            inviteeEmail: email.toLowerCase().trim(),
            inviteeName: name,
            depth: 0,
            camInviteGroupId: group.id,
          },
        });

        const shareUrl = `${baseUrl}/portal/${token}`;
        const personalizedMessage = (dto.message || "").replace(
          /\{name\}/gi,
          name?.split(" ")[0] || "there",
        );

        // Email
        if (dto.deliveryMethods.includes("email")) {
          try {
            await this.email.sendPortalInvite({
              toEmail: email,
              recipientName: name ?? undefined,
              inviterName,
              campaignName: campaign.name,
              message: personalizedMessage,
              shareUrl,
            });
          } catch (err: any) {
            this.logger.error(
              `Campaign group invite email failed for ${email}: ${err?.message}`,
            );
          }
        }

        // SMS
        if (dto.deliveryMethods.includes("sms") && phone) {
          try {
            const smsBody = `${inviterName} invited you to view ${campaign.name}. View here: ${shareUrl}`;
            await this.sms.sendSms(phone, smsBody);
          } catch (err: any) {
            this.logger.error(
              `Campaign group invite SMS failed for ${phone}: ${err?.message}`,
            );
          }
        }

        results.push({ email, success: true, shareUrl, source });
      } catch (err: any) {
        results.push({ email, success: false, error: err?.message || "Unknown error", source });
      }
    };

    // Process contacts from PersonalContact table
    if (dto.contactIds?.length) {
      const contacts = await this.prisma.personalContact.findMany({
        where: {
          id: { in: dto.contactIds },
          ownerUserId: actor.userId,
          email: { not: null },
        },
        select: {
          id: true,
          displayName: true,
          firstName: true,
          email: true,
          phone: true,
        },
      });

      for (const contact of contacts) {
        if (!contact.email) continue;
        await processInvitee(
          contact.email,
          contact.displayName || contact.firstName || null,
          contact.phone,
          "contact",
        );
      }
    }

    // Process PIP users (by email, no contact record needed)
    if (dto.pipUserEmails?.length) {
      // Look up names from existing tokens
      const pipTokens = await this.prisma.documentShareToken.findMany({
        where: {
          inviteeEmail: { in: dto.pipUserEmails.map((e) => e.toLowerCase().trim()) },
          cndaAcceptedAt: { not: null },
        },
        select: { inviteeEmail: true, inviteeName: true },
        distinct: ["inviteeEmail"],
      });
      const nameMap = new Map(
        pipTokens
          .filter((t) => t.inviteeEmail)
          .map((t) => [t.inviteeEmail!.toLowerCase(), t.inviteeName]),
      );

      for (const email of dto.pipUserEmails) {
        const normalized = email.toLowerCase().trim();
        await processInvitee(
          normalized,
          nameMap.get(normalized) ?? null,
          null,
          "pip-user",
        );
      }
    }

    return {
      group: { id: group.id, name: group.name },
      total: results.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Analytics                                                        */
  /* ---------------------------------------------------------------- */

  async getAnalytics(campaignId: string) {
    // Verify campaign exists
    const campaign = await this.prisma.securePortalCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");

    // Get all tokens for this campaign
    const tokens = await this.prisma.documentShareToken.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
    });

    // Funnel metrics
    const totalTokens = tokens.length;
    const opened = tokens.filter((t) => t.viewCount > 0).length;
    const cndaAccepted = tokens.filter((t) => !!t.cndaAcceptedAt).length;
    const questionnaireCompleted = tokens.filter(
      (t) => !!t.questionnaireCompletedAt,
    ).length;

    // Content viewed = tokens that have at least one CONTENT_VIEW access log
    const tokenIds = tokens.map((t) => t.id);
    const contentViewCounts = tokenIds.length
      ? await this.prisma.documentShareAccessLog.groupBy({
          by: ["tokenId"],
          where: {
            tokenId: { in: tokenIds },
            accessType: { in: ["CONTENT_VIEW", "RETURN_VISIT"] },
          },
        })
      : [];
    const contentViewedSet = new Set(
      contentViewCounts.map((c) => c.tokenId),
    );
    const contentViewed = contentViewedSet.size;

    // Visitors list
    const visitors = tokens.map((t) => {
      const hasContent = contentViewedSet.has(t.id);
      let status = "pending";
      if (hasContent) status = "viewing";
      else if (t.cndaAcceptedAt) status = "cnda_accepted";
      else if (t.viewCount > 0) status = "opened";

      return {
        tokenId: t.id,
        name: t.inviteeName,
        email: t.inviteeEmail,
        viewCount: t.viewCount,
        firstVisit: t.firstViewedAt,
        lastVisit: t.lastViewedAt,
        cndaAccepted: !!t.cndaAcceptedAt,
        questionnaireCompleted: !!t.questionnaireCompletedAt,
        accessGranted: hasContent,
        status,
        createdAt: t.createdAt,
      };
    });

    // Recent activity
    const recentActivity = tokenIds.length
      ? await this.prisma.documentShareAccessLog.findMany({
          where: { tokenId: { in: tokenIds } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            token: { select: { inviteeName: true, inviteeEmail: true } },
          },
        })
      : [];

    const activity = recentActivity.map((a) => ({
      type: a.accessType,
      name: a.token?.inviteeName ?? a.token?.inviteeEmail ?? "Unknown",
      createdAt: a.createdAt,
      serialNumber: a.serialNumber,
    }));

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
      },
      funnel: {
        totalTokens,
        opened,
        cndaAccepted,
        questionnaireCompleted,
        contentViewed,
      },
      visitors,
      recentActivity: activity,
    };
  }
}
