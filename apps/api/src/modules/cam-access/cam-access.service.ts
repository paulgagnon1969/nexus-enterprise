import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ShareAccessType, ShareDocumentType } from "@prisma/client";
import { SopSyncService } from "../documents/sop-sync.service";
import { EmailService } from "../../common/email.service";
import * as crypto from "crypto";

/* ------------------------------------------------------------------ */
/*  DTOs                                                              */
/* ------------------------------------------------------------------ */

export interface AcceptCndaDto {
  fullName: string;
  email: string;
  company?: string;
}

export interface SubmitQuestionnaireDto {
  answers: Record<string, any>;
}

export interface SubmitReferralDto {
  recipientName: string;
  recipientEmail: string;
  message?: string;
}

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */

@Injectable()
export class CamAccessService {
  private readonly logger = new Logger(CamAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sopSync: SopSyncService,
    private readonly email: EmailService,
  ) {}

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                         */
  /* ---------------------------------------------------------------- */

  private generateSerialNumber(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const hex = crypto.randomBytes(3).toString("hex");
    return `NXS-CAM-${date}-${hex}`;
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

  /* ---------------------------------------------------------------- */
  /*  Gate status                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Validate a share token and return the current gate status.
   * This is the first call a recipient makes when they open the link.
   */
  async getGateStatus(token: string, ctx?: RequestContext) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        inviterName: true,
        inviterEmail: true,
        inviteeEmail: true,
        inviteeName: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        viewCount: true,
        firstViewedAt: true,
        revokedAt: true,
        revokedReason: true,
      },
    });

    if (!record) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    if (record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    // Revoked tokens return a special status — no further interaction allowed
    if (record.revokedAt) {
      return {
        valid: false,
        revoked: true,
        revokedReason: record.revokedReason,
        inviterName: record.inviterName || record.inviterEmail,
      };
    }

    // Log the view
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
    const accessGranted = cndaAccepted && questionnaireCompleted;

    // Mask the invitee email once gates are passed to prevent URL-sharing
    // attacks where a third party reads the email from the API and replays it.
    let maskedEmail: string | null = null;
    if (record.inviteeEmail) {
      if (accessGranted) {
        // j***e@company.com
        const [local, domain] = record.inviteeEmail.split("@");
        maskedEmail =
          local.length <= 2
            ? `${local[0]}***@${domain}`
            : `${local[0]}***${local[local.length - 1]}@${domain}`;
      } else {
        // Pre-fill for CNDA step (gates not passed yet — harmless)
        maskedEmail = record.inviteeEmail;
      }
    }

    return {
      valid: true,
      inviterName: record.inviterName || record.inviterEmail,
      inviteeEmail: maskedEmail,
      inviteeName: record.inviteeName,
      cndaRequired: true,
      cndaAccepted,
      questionnaireRequired: true,
      questionnaireCompleted,
      accessGranted,
      identityVerificationRequired: accessGranted,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  CNDA acceptance                                                 */
  /* ---------------------------------------------------------------- */

  async acceptCnda(token: string, dto: AcceptCndaDto, ctx?: RequestContext) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        revokedAt: true,
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    if (record.revokedAt) {
      throw new ForbiddenException("This access link has been revoked.");
    }

    // Already accepted — skip but return current status
    if (record.cndaAcceptedAt) {
      return {
        cndaAccepted: true,
        questionnaireCompleted: !!record.questionnaireCompletedAt,
        accessGranted: !!record.questionnaireCompletedAt,
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
        acceptedAt: now.toISOString(),
      },
    });

    this.logger.log(
      `CNDA+ accepted: token=${token}, name=${dto.fullName}, email=${dto.email}`,
    );

    return {
      cndaAccepted: true,
      questionnaireCompleted: !!record.questionnaireCompletedAt,
      accessGranted: !!record.questionnaireCompletedAt,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Questionnaire                                                   */
  /* ---------------------------------------------------------------- */

  async submitQuestionnaire(
    token: string,
    dto: SubmitQuestionnaireDto,
    ctx?: RequestContext,
  ) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        revokedAt: true,
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    if (record.revokedAt) {
      throw new ForbiddenException("This access link has been revoked.");
    }

    // Must accept CNDA first
    if (!record.cndaAcceptedAt) {
      throw new ForbiddenException(
        "You must accept the CNDA+ before completing the questionnaire.",
      );
    }

    // Already completed — return current status
    if (record.questionnaireCompletedAt) {
      return {
        cndaAccepted: true,
        questionnaireCompleted: true,
        accessGranted: true,
      };
    }

    const now = new Date();

    await this.prisma.documentShareToken.update({
      where: { id: record.id },
      data: {
        questionnaireCompletedAt: now,
        questionnaireData: dto.answers,
      },
    });

    await this.logAccess(record.id, ShareAccessType.QUESTIONNAIRE_COMPLETE, ctx, {
      metadata: { answers: dto.answers },
    });

    this.logger.log(`Questionnaire completed: token=${token}`);

    return {
      cndaAccepted: true,
      questionnaireCompleted: true,
      accessGranted: true,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Content delivery                                                */
  /* ---------------------------------------------------------------- */

  async getContent(token: string, verifyEmail: string | undefined, ctx?: RequestContext) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        inviterName: true,
        inviterEmail: true,
        inviteeEmail: true,
        inviteeName: true,
        viewCount: true,
        revokedAt: true,
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    if (record.revokedAt) {
      throw new ForbiddenException("This access link has been revoked.");
    }

    // Enforce both gates
    if (!record.cndaAcceptedAt) {
      throw new ForbiddenException("CNDA+ acceptance is required to view this document.");
    }
    if (!record.questionnaireCompletedAt) {
      throw new ForbiddenException("Questionnaire completion is required to view this document.");
    }

    // Identity verification: the requester must prove they are the CNDA signer.
    // This prevents URL-sharing attacks where someone forwards the link after
    // gates are already passed.
    const normalised = (verifyEmail || "").trim().toLowerCase();
    if (!normalised) {
      throw new ForbiddenException(
        "Identity verification is required. Please provide your email address.",
      );
    }
    if (normalised !== (record.inviteeEmail || "").toLowerCase()) {
      await this.logAccess(record.id, ShareAccessType.VIEW, ctx, {
        metadata: { action: "identity_verification_failed", attemptedEmail: normalised },
      });
      throw new ForbiddenException(
        "The email address does not match the CNDA+ signer for this access link.",
      );
    }

    // Generate forensic serial for this content view
    const serialNumber = this.generateSerialNumber();

    // Determine access type: first content view vs return visit
    const existingContentViews = await this.prisma.documentShareAccessLog.count({
      where: {
        tokenId: record.id,
        accessType: { in: [ShareAccessType.CONTENT_VIEW, ShareAccessType.RETURN_VISIT] },
      },
    });

    const accessType =
      existingContentViews === 0
        ? ShareAccessType.CONTENT_VIEW
        : ShareAccessType.RETURN_VISIT;

    await this.logAccess(record.id, accessType, ctx, { serialNumber });

    // Fetch CAM Manual content via sop-sync (reads from compiled CAMs on disk)
    const handbook = await this.sopSync.getCamHandbookHtml();

    return {
      ...handbook,
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

  /* ---------------------------------------------------------------- */
  /*  Link recovery — re-send the access link by email                 */
  /* ---------------------------------------------------------------- */

  async recoverLink(email: string) {
    const normalised = (email || "").trim().toLowerCase();
    if (!normalised) {
      throw new BadRequestException("Email is required");
    }

    // Find the most recent CAM_LIBRARY token for this email
    const record = await this.prisma.documentShareToken.findFirst({
      where: {
        inviteeEmail: normalised,
        documentType: ShareDocumentType.CAM_LIBRARY,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        inviterName: true,
        inviterEmail: true,
        inviteeName: true,
        inviteeEmail: true,
      },
    });

    // Always return success to avoid email enumeration
    if (!record) {
      this.logger.log(`Recover link requested for unknown email: ${normalised}`);
      return { sent: true };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/cam-access/${record.token}`;

    try {
      await this.email.sendCamInvite({
        toEmail: normalised,
        recipientName: record.inviteeName ?? undefined,
        inviterName: record.inviterName || record.inviterEmail,
        message:
          "You requested a reminder of your CAM Library access link. Click the button below to continue where you left off.",
        shareUrl,
      });
      this.logger.log(`Recover link email sent to ${normalised}`);
    } catch (err: any) {
      this.logger.error(`Recover link email failed for ${normalised}: ${err?.message}`);
    }

    return { sent: true };
  }

  /* ---------------------------------------------------------------- */
  /*  Viral referral — invitee refers someone else                     */
  /* ---------------------------------------------------------------- */

  async submitReferral(
    token: string,
    dto: SubmitReferralDto,
    ctx?: RequestContext,
  ) {
    const email = (dto.recipientEmail || "").trim().toLowerCase();
    if (!email) {
      throw new BadRequestException("Recipient email is required");
    }

    // Verify the referrer's token exists and has full access
    const parent = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        cndaAcceptedAt: true,
        questionnaireCompletedAt: true,
        inviteeName: true,
        inviteeEmail: true,
        depth: true,
        revokedAt: true,
      },
    });

    if (!parent || parent.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }
    if (parent.revokedAt) {
      throw new ForbiddenException("This access link has been revoked.");
    }
    if (!parent.cndaAcceptedAt || !parent.questionnaireCompletedAt) {
      throw new ForbiddenException(
        "You must complete the full access flow before referring others.",
      );
    }

    // Cap viral depth at 5 levels to prevent unbounded chains
    if (parent.depth >= 5) {
      throw new ForbiddenException(
        "Maximum referral depth reached. Please contact Nexus directly.",
      );
    }

    // Prevent duplicate referral to the same email from the same parent
    const existing = await this.prisma.documentShareToken.findFirst({
      where: {
        parentTokenId: parent.id,
        inviteeEmail: email,
        documentType: ShareDocumentType.CAM_LIBRARY,
      },
    });
    if (existing) {
      throw new BadRequestException(
        "You've already referred this person. They should have received an email.",
      );
    }

    // Create the child token
    const childToken = crypto.randomBytes(24).toString("hex");
    const referrerName =
      parent.inviteeName || parent.inviteeEmail || "A Nexus reviewer";

    await this.prisma.documentShareToken.create({
      data: {
        token: childToken,
        documentType: ShareDocumentType.CAM_LIBRARY,
        inviterEmail: parent.inviteeEmail || "",
        inviterName: referrerName,
        inviteeEmail: email,
        inviteeName: dto.recipientName || null,
        parentTokenId: parent.id,
        depth: parent.depth + 1,
      },
    });

    // Mark the parent token as having shared onward
    await this.prisma.documentShareToken.update({
      where: { id: parent.id },
      data: { sharedAt: new Date() },
    });

    // Send invite email
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/cam-access/${childToken}`;

    let emailSent = false;
    try {
      await this.email.sendCamInvite({
        toEmail: email,
        recipientName: dto.recipientName,
        inviterName: referrerName,
        message: dto.message,
        shareUrl,
      });
      emailSent = true;
      this.logger.log(
        `Viral referral email sent: ${parent.inviteeEmail} → ${email} (depth ${parent.depth + 1})`,
      );
    } catch (err: any) {
      this.logger.error(`Viral referral email failed for ${email}: ${err?.message}`);
    }

    // Log the referral event
    await this.logAccess(parent.id, ShareAccessType.RETURN_VISIT, ctx, {
      metadata: {
        action: "referral",
        referredEmail: email,
        referredName: dto.recipientName || null,
        childToken,
        depth: parent.depth + 1,
      },
    });

    return {
      success: true,
      emailSent,
      recipientEmail: email,
      recipientName: dto.recipientName || null,
      shareUrl,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Self-withdrawal — invitee removes their own access               */
  /* ---------------------------------------------------------------- */

  async withdraw(token: string, email: string, ctx?: RequestContext) {
    const normalised = (email || "").trim().toLowerCase();
    if (!normalised) {
      throw new BadRequestException("Email is required for identity verification.");
    }

    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: {
        id: true,
        documentType: true,
        inviteeEmail: true,
        inviteeName: true,
        revokedAt: true,
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    if (record.revokedAt) {
      return { withdrawn: true, alreadyRevoked: true };
    }

    // Identity verification — must match the invitee email
    if (normalised !== (record.inviteeEmail || "").toLowerCase()) {
      throw new ForbiddenException(
        "The email address does not match the record for this access link.",
      );
    }

    const now = new Date();
    await this.prisma.documentShareToken.update({
      where: { id: record.id },
      data: { revokedAt: now, revokedReason: "self_withdrawal" },
    });

    await this.logAccess(record.id, ShareAccessType.RESCIND, ctx, {
      metadata: {
        action: "self_withdrawal",
        email: normalised,
      },
    });

    this.logger.log(
      `Self-withdrawal: token=${token}, invitee=${normalised}`,
    );

    return { withdrawn: true };
  }
}
