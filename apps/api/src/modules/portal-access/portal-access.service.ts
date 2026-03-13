import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ShareAccessType, ShareDocumentType } from "@prisma/client";
import * as crypto from "crypto";

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class PortalAccessService {
  private readonly logger = new Logger(PortalAccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  private generateSerialNumber(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const hex = crypto.randomBytes(3).toString("hex");
    return `NXS-PTL-${date}-${hex}`;
  }

  private async logAccess(
    tokenId: string,
    accessType: ShareAccessType,
    ctx?: RequestContext,
    extra?: { serialNumber?: string; metadata?: Record<string, any> },
  ) {
    try {
      await this.prisma.documentShareAccessLog.create({
        data: {
          tokenId,
          accessType,
          serialNumber: extra?.serialNumber ?? null,
          ipAddress: ctx?.ipAddress ?? null,
          userAgent: ctx?.userAgent ?? null,
          metadata: extra?.metadata ?? undefined,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to log access: ${err?.message}`);
    }
  }

  private async getTokenWithCampaign(token: string) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      include: {
        campaign: {
          include: {
            cndaTemplate: true,
            documents: {
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  include: {
                    currentVersion: { select: { htmlContent: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!record || record.documentType !== ShareDocumentType.SECURE_PORTAL) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }
    if (!record.campaign) {
      throw new NotFoundException("Campaign not found for this access link.");
    }

    return record;
  }

  /* ---------------------------------------------------------------- */
  /*  Gate status                                                      */
  /* ---------------------------------------------------------------- */

  async getGateStatus(token: string, ctx?: RequestContext) {
    const record = await this.getTokenWithCampaign(token);

    await this.logAccess(record.id, ShareAccessType.VIEW, ctx);

    // Increment view tracking
    const now = new Date();
    await this.prisma.documentShareToken.update({
      where: { id: record.id },
      data: {
        viewCount: { increment: 1 },
        firstViewedAt: record.firstViewedAt ?? now,
        lastViewedAt: now,
      },
    });

    const cndaAccepted = !!record.cndaAcceptedAt;
    const questionnaireCompleted = !!record.questionnaireCompletedAt;
    const questionnaireRequired = record.campaign!.questionnaireEnabled;
    const accessGranted = cndaAccepted && (!questionnaireRequired || questionnaireCompleted);

    // Mask email once gates are passed
    let maskedEmail: string | null = null;
    if (record.inviteeEmail) {
      if (accessGranted) {
        const [local, domain] = record.inviteeEmail.split("@");
        maskedEmail =
          local.length <= 2
            ? `${local[0]}***@${domain}`
            : `${local[0]}***${local[local.length - 1]}@${domain}`;
      } else {
        maskedEmail = record.inviteeEmail;
      }
    }

    return {
      valid: true,
      campaignName: record.campaign!.name,
      campaignSlug: record.campaign!.slug,
      inviterName: record.inviterName || record.inviterEmail,
      inviteeEmail: maskedEmail,
      inviteeName: record.inviteeName,
      cndaRequired: true,
      cndaAccepted,
      // Return the CNDA HTML from the campaign's template
      cndaHtml: cndaAccepted ? null : record.campaign!.cndaTemplate.htmlContent,
      questionnaireRequired,
      questionnaireCompleted,
      questionnaireConfig: questionnaireCompleted ? null : (record.campaign!.questionnaireConfig ?? null),
      accessGranted,
      identityVerificationRequired: accessGranted,
      documentCount: record.campaign!.documents.length,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  CNDA acceptance                                                  */
  /* ---------------------------------------------------------------- */

  async acceptCnda(
    token: string,
    dto: { fullName: string; email: string; company?: string },
    ctx?: RequestContext,
  ) {
    const record = await this.getTokenWithCampaign(token);

    if (record.cndaAcceptedAt) {
      const qDone = !!record.questionnaireCompletedAt;
      const qRequired = record.campaign!.questionnaireEnabled;
      return {
        cndaAccepted: true,
        questionnaireCompleted: qDone,
        accessGranted: !qRequired || qDone,
      };
    }

    const now = new Date();
    await this.prisma.documentShareToken.update({
      where: { id: record.id },
      data: {
        cndaAcceptedAt: now,
        cndaAcceptedIp: ctx?.ipAddress ?? null,
        cndaAcceptedUa: ctx?.userAgent ?? null,
        inviteeEmail: dto.email,
        inviteeName: dto.fullName,
      },
    });

    await this.logAccess(record.id, ShareAccessType.CNDA_ACCEPT, ctx, {
      metadata: {
        fullName: dto.fullName,
        email: dto.email,
        company: dto.company ?? null,
        campaignId: record.campaign!.id,
      },
    });

    this.logger.log(`Portal CNDA+ accepted: token=${token}, name=${dto.fullName}`);

    const qDone = !!record.questionnaireCompletedAt;
    const qRequired = record.campaign!.questionnaireEnabled;
    return {
      cndaAccepted: true,
      questionnaireCompleted: qDone,
      accessGranted: !qRequired || qDone,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Questionnaire                                                    */
  /* ---------------------------------------------------------------- */

  async submitQuestionnaire(
    token: string,
    dto: { answers: Record<string, any> },
    ctx?: RequestContext,
  ) {
    const record = await this.getTokenWithCampaign(token);

    if (!record.cndaAcceptedAt) {
      throw new ForbiddenException("You must accept the agreement before completing the questionnaire.");
    }

    if (record.questionnaireCompletedAt) {
      return { cndaAccepted: true, questionnaireCompleted: true, accessGranted: true };
    }

    await this.prisma.documentShareToken.update({
      where: { id: record.id },
      data: {
        questionnaireCompletedAt: new Date(),
        questionnaireData: dto.answers,
      },
    });

    await this.logAccess(record.id, ShareAccessType.QUESTIONNAIRE_COMPLETE, ctx, {
      metadata: { answers: dto.answers },
    });

    return { cndaAccepted: true, questionnaireCompleted: true, accessGranted: true };
  }

  /* ---------------------------------------------------------------- */
  /*  Content delivery                                                 */
  /* ---------------------------------------------------------------- */

  async getContent(token: string, verifyEmail: string | undefined, ctx?: RequestContext) {
    const record = await this.getTokenWithCampaign(token);

    // Enforce gates
    if (!record.cndaAcceptedAt) {
      throw new ForbiddenException("Agreement acceptance is required to view this document.");
    }
    if (record.campaign!.questionnaireEnabled && !record.questionnaireCompletedAt) {
      throw new ForbiddenException("Questionnaire completion is required to view this document.");
    }

    // Identity verification
    const normalised = (verifyEmail || "").trim().toLowerCase();
    if (!normalised) {
      throw new ForbiddenException("Identity verification is required. Please provide your email address.");
    }
    if (normalised !== (record.inviteeEmail || "").toLowerCase()) {
      await this.logAccess(record.id, ShareAccessType.VIEW, ctx, {
        metadata: { action: "identity_verification_failed", attemptedEmail: normalised },
      });
      throw new ForbiddenException("The email address does not match the agreement signer for this access link.");
    }

    // Generate forensic serial
    const serialNumber = this.generateSerialNumber();

    const existingContentViews = await this.prisma.documentShareAccessLog.count({
      where: {
        tokenId: record.id,
        accessType: { in: [ShareAccessType.CONTENT_VIEW, ShareAccessType.RETURN_VISIT] },
      },
    });

    const accessType = existingContentViews === 0 ? ShareAccessType.CONTENT_VIEW : ShareAccessType.RETURN_VISIT;
    await this.logAccess(record.id, accessType, ctx, { serialNumber });

    // Build content from campaign documents
    const documents = record.campaign!.documents.map((d) => ({
      id: d.systemDocument.id,
      code: d.systemDocument.code,
      title: d.systemDocument.title,
      htmlContent: d.systemDocument.currentVersion?.htmlContent ?? "",
    }));

    return {
      campaignName: record.campaign!.name,
      campaignSlug: record.campaign!.slug,
      documents,
      _shareContext: {
        serialNumber,
        inviterName: record.inviterName || record.inviterEmail,
        recipientName: record.inviteeName,
        recipientEmail: record.inviteeEmail,
        accessedAt: new Date().toISOString(),
        visitNumber: existingContentViews + 1,
      },
    };
  }
}
