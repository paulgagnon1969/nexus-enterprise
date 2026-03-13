import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { EmailService } from "../../common/email.service";
import { ShareDocumentType } from "@prisma/client";
import { parseAllSops, type ParsedSop } from "@repo/database";
import * as path from "path";

const CAMS_DIR = path.resolve(__dirname, "../../../../../docs/cams");

const MODE_LABELS: Record<string, string> = {
  EST: "Estimating",
  FIN: "Financial",
  OPS: "Operations",
  HR: "Workforce",
  CLT: "Client Relations",
  CMP: "Compliance",
  TECH: "Technology",
};

interface CamDigestEntry {
  camId: string;
  title: string;
  mode: string;
  modeLabel: string;
  category: string;
  score: number;
  isNew: boolean; // true = created yesterday, false = updated yesterday
}

/**
 * Daily CAM Digest — sends a morning email to all PIP (Production Investor Portal)
 * users summarizing any CAMs that were created or updated since yesterday.
 *
 * Runs at 08:00 CST (14:00 UTC) every day via @nestjs/schedule Cron.
 * Only sends when there are new/updated CAMs — no empty digest emails.
 */
@Injectable()
export class CamDigestService {
  private readonly logger = new Logger(CamDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Daily cron: 08:00 CST = 14:00 UTC.
   * Runs Mon-Sun (CAM updates can happen any day).
   */
  @Cron("0 14 * * *", { name: "cam-daily-digest", timeZone: "America/Chicago" })
  async handleDailyDigest() {
    this.logger.log("CAM Daily Digest: starting...");
    try {
      await this.sendDigest();
    } catch (err: any) {
      this.logger.error(`CAM Daily Digest failed: ${err?.message ?? err}`);
    }
  }

  async sendDigest() {
    // 1. Find CAMs updated or created yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    let allCams: ParsedSop[] = [];
    try {
      allCams = parseAllSops(CAMS_DIR);
    } catch {
      this.logger.warn("CAM Daily Digest: could not read docs/cams/ directory");
      return;
    }

    const digestEntries: CamDigestEntry[] = [];

    for (const cam of allCams) {
      const fm = cam.frontmatter;
      if (!fm.cam_id) continue; // Skip non-CAM files (e.g., CAM-LIBRARY.md)

      const isNew = fm.created === yesterdayStr;
      const isUpdated = fm.updated === yesterdayStr && !isNew;

      if (!isNew && !isUpdated) continue;

      const mode = (fm.mode || "UNKNOWN").toUpperCase();
      const scores = fm.scores || {};

      digestEntries.push({
        camId: fm.cam_id,
        title: fm.title,
        mode,
        modeLabel: MODE_LABELS[mode] || mode,
        category: (fm.category || "").toUpperCase(),
        score: scores.total ?? 0,
        isNew,
      });
    }

    if (digestEntries.length === 0) {
      this.logger.log("CAM Daily Digest: no new/updated CAMs yesterday. Skipping.");
      return;
    }

    // Sort: new first, then by score descending
    digestEntries.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return b.score - a.score;
    });

    // 2. Find all PIP users (CNDA accepted + questionnaire completed)
    const pipUsers = await this.prisma.documentShareToken.findMany({
      where: {
        documentType: ShareDocumentType.CAM_LIBRARY,
        cndaAcceptedAt: { not: null },
        questionnaireCompletedAt: { not: null },
        inviteeEmail: { not: null },
      },
      select: {
        token: true,
        inviteeEmail: true,
        inviteeName: true,
      },
    });

    if (pipUsers.length === 0) {
      this.logger.log("CAM Daily Digest: no PIP users with full access. Skipping.");
      return;
    }

    // Deduplicate by email (same person may have multiple tokens)
    const emailMap = new Map<string, { name: string | null; token: string }>();
    for (const u of pipUsers) {
      const email = u.inviteeEmail!.toLowerCase();
      if (!emailMap.has(email)) {
        emailMap.set(email, { name: u.inviteeName, token: u.token });
      }
    }

    this.logger.log(
      `CAM Daily Digest: ${digestEntries.length} CAM(s) → ${emailMap.size} recipient(s)`,
    );

    // 3. Send digest email to each PIP user
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";

    let sent = 0;
    let failed = 0;

    for (const [email, { name, token }] of emailMap) {
      const shareUrl = `${baseUrl}/cam-access/${token}`;
      try {
        await this.email.sendCamDigest({
          toEmail: email,
          recipientName: name ?? undefined,
          entries: digestEntries,
          dateLabel: yesterdayStr,
          shareUrl,
        });
        sent++;
      } catch (err: any) {
        this.logger.error(`CAM Digest email failed for ${email}: ${err?.message}`);
        failed++;
      }
    }

    this.logger.log(
      `CAM Daily Digest complete: ${sent} sent, ${failed} failed`,
    );
  }
}
