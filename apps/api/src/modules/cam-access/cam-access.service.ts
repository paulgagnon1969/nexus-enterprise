import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ShareAccessType, ShareDocumentType } from "@prisma/client";
import { SopSyncService } from "../documents/sop-sync.service";
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
      },
    });

    if (!record) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    if (record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
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

    return {
      valid: true,
      inviterName: record.inviterName || record.inviterEmail,
      inviteeEmail: record.inviteeEmail,
      inviteeName: record.inviteeName,
      cndaRequired: true,
      cndaAccepted,
      questionnaireRequired: true,
      questionnaireCompleted,
      accessGranted: cndaAccepted && questionnaireCompleted,
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
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
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
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
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

  async getContent(token: string, ctx?: RequestContext) {
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
      },
    });

    if (!record || record.documentType !== ShareDocumentType.CAM_LIBRARY) {
      throw new NotFoundException("This access link is invalid or has expired.");
    }

    // Enforce both gates
    if (!record.cndaAcceptedAt) {
      throw new ForbiddenException("CNDA+ acceptance is required to view this document.");
    }
    if (!record.questionnaireCompletedAt) {
      throw new ForbiddenException("Questionnaire completion is required to view this document.");
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
}
