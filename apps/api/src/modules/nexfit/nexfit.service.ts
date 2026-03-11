import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import {
  analyzeNeeds,
  getQuestions,
  MODULE_NEXOP,
  type NexfitAnswers,
  type NexfitReport,
  type NexfitQuestion,
} from "@repo/database";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ShareDocumentType, UserType, Role, GlobalRole } from "@prisma/client";
import type { ShareDocumentDto, RegisterViewerDto } from "./dto/share.dto";

interface SubscribeInput {
  email: string;
  name?: string;
  company?: string;
  answers?: Record<string, any>;
  reportSummary?: Record<string, any>;
}

/** Nexus System company — VIEWER users are pooled here */
const NEXUS_SYSTEM_COMPANY_ID = "cmjr7o4zs000101s6z1rt1ssz";

@Injectable()
export class NexfitService {
  private readonly logger = new Logger(NexfitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /* ------------------------------------------------------------------ */
  /*  Original NexFIT endpoints                                         */
  /* ------------------------------------------------------------------ */

  getQuestions(): NexfitQuestion[] {
    return getQuestions();
  }

  analyze(answers: NexfitAnswers): NexfitReport {
    return analyzeNeeds(answers);
  }

  getModuleNexopMap() {
    return MODULE_NEXOP;
  }

  /**
   * Lead capture — stores interest for follow-up.
   * For now, logs to stdout. Future: persist to a leads table or CRM.
   */
  subscribe(input: SubscribeInput) {
    this.logger.log(
      `NexFIT lead: ${input.email} (${input.name ?? "anon"}, ${input.company ?? "unknown"})`,
    );
    // TODO: persist to NexfitLead table when schema is ready
    return { ok: true, message: "Subscribed successfully" };
  }

  /* ------------------------------------------------------------------ */
  /*  Viral document sharing (CLT-COLLAB-0003)                          */
  /* ------------------------------------------------------------------ */

  private generateShareToken(): string {
    return randomBytes(24).toString("hex");
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Generate a share token for a document.
   * If parentToken is provided, builds the referral chain (depth = parent.depth + 1).
   */
  async shareDocument(dto: ShareDocumentDto) {
    const email = this.normalizeEmail(dto.email);
    if (!email) throw new BadRequestException("Email is required");

    let parentTokenId: string | null = null;
    let depth = 0;

    if (dto.parentToken) {
      const parent = await this.prisma.documentShareToken.findUnique({
        where: { token: dto.parentToken },
        select: { id: true, depth: true },
      });
      if (parent) {
        parentTokenId = parent.id;
        depth = parent.depth + 1;
      }
    }

    const token = this.generateShareToken();

    const record = await this.prisma.documentShareToken.create({
      data: {
        token,
        documentType: dto.documentType as ShareDocumentType,
        documentRef: dto.documentRef ?? null,
        inviterEmail: email,
        inviterName: dto.name ?? null,
        parentTokenId,
        depth,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/nexfit?token=${token}`;

    this.logger.log(
      `Share token created: ${token} (depth=${depth}, doc=${dto.documentType}, inviter=${email})`,
    );

    return {
      token: record.token,
      shareUrl,
      depth,
    };
  }

  /**
   * Validate a share token, log the view, return document metadata.
   */
  async viewByToken(token: string) {
    const record = await this.prisma.documentShareToken.findUnique({
      where: { token },
      include: {
        inviterUser: { select: { id: true, firstName: true, email: true } },
      },
    });

    if (!record) {
      throw new NotFoundException("Share link is invalid or has expired");
    }

    const now = new Date();

    // Increment view count and set first/last viewed timestamps.
    await this.prisma.documentShareToken.update({
      where: { id: record.id },
      data: {
        viewCount: { increment: 1 },
        firstViewedAt: record.firstViewedAt ?? now,
        lastViewedAt: now,
      },
    });

    return {
      documentType: record.documentType,
      documentRef: record.documentRef,
      inviterName: record.inviterName ?? record.inviterEmail,
      depth: record.depth,
      viewCount: record.viewCount + 1,
    };
  }

  /**
   * Lightweight VIEWER registration.
   * Creates a VIEWER user, optionally links to a share token,
   * returns JWT so the user is immediately logged in.
   */
  async registerViewer(dto: RegisterViewerDto) {
    const email = this.normalizeEmail(dto.email);
    if (!email) throw new BadRequestException("Email is required");
    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    // Check for existing account.
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      throw new ConflictException(
        "An account with this email already exists. Please log in instead.",
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          userType: UserType.VIEWER,
          ...(dto.marketplaceOptIn != null && { marketplaceOptIn: dto.marketplaceOptIn }),
        },
      });

      // Pool membership under Nexus System so VIEWER users show up in admin views.
      await tx.companyMembership.create({
        data: {
          userId: newUser.id,
          companyId: NEXUS_SYSTEM_COMPANY_ID,
          role: Role.MEMBER,
        },
      });

      // If registered via a share token, link the token to this user.
      if (dto.token) {
        await tx.documentShareToken.updateMany({
          where: { token: dto.token },
          data: {
            inviteeEmail: email,
            inviteeUserId: newUser.id,
          },
        });
      }

      return newUser;
    });

    // Issue a JWT so the frontend can immediately treat them as logged in.
    const payload = {
      sub: user.id,
      companyId: NEXUS_SYSTEM_COMPANY_ID,
      role: Role.MEMBER,
      email: user.email,
      globalRole: GlobalRole.NONE,
      userType: UserType.VIEWER,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || "change-me-access",
      expiresIn: Number(process.env.JWT_ACCESS_TTL) || 86400,
    });

    this.logger.log(`VIEWER registered: ${email} (marketplace=${dto.marketplaceOptIn ?? false})`);

    return {
      user: { id: user.id, email: user.email, userType: user.userType },
      accessToken,
    };
  }

  /**
   * Vouch — authenticated user creates a CAM_LIBRARY referral token for a recipient.
   * The caller's userId is linked as the inviter. Returns a share URL for the
   * gated CAM Manual access flow.
   */
  async vouchForCamAccess(opts: {
    inviterUserId: string;
    inviterEmail: string;
    recipientEmail: string;
    recipientName?: string;
    message?: string;
  }) {
    const email = this.normalizeEmail(opts.recipientEmail);
    if (!email) throw new BadRequestException("Recipient email is required");

    // Look up inviter name from DB
    const inviter = await this.prisma.user.findUnique({
      where: { id: opts.inviterUserId },
      select: { firstName: true, lastName: true, email: true },
    });
    const inviterName =
      `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() || opts.inviterEmail;

    const token = this.generateShareToken();

    await this.prisma.documentShareToken.create({
      data: {
        token,
        documentType: ShareDocumentType.CAM_LIBRARY,
        inviterEmail: opts.inviterEmail,
        inviterName,
        inviterUserId: opts.inviterUserId,
        inviteeEmail: email,
        inviteeName: opts.recipientName ?? null,
        depth: 0,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";
    const shareUrl = `${baseUrl}/cam-access/${token}`;

    this.logger.log(
      `CAM vouch created: ${opts.inviterEmail} → ${email} (token=${token})`,
    );

    return {
      token,
      shareUrl,
      recipientEmail: email,
      recipientName: opts.recipientName ?? null,
    };
  }

  /**
   * Return the referral chain (ancestry) for a given share token.
   * Useful for analytics — shows how a document propagated virally.
   */
  async getShareChain(token: string) {
    const chain: Array<{ email: string; name: string | null; depth: number }> = [];

    let current = await this.prisma.documentShareToken.findUnique({
      where: { token },
      select: { inviterEmail: true, inviterName: true, depth: true, parentTokenId: true },
    });

    while (current) {
      chain.push({
        email: current.inviterEmail,
        name: current.inviterName,
        depth: current.depth,
      });

      if (!current.parentTokenId) break;

      current = await this.prisma.documentShareToken.findUnique({
        where: { id: current.parentTokenId },
        select: { inviterEmail: true, inviterName: true, depth: true, parentTokenId: true },
      });
    }

    return chain;
  }
}
