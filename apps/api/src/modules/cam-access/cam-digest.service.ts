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

interface DiscussionDigestEntry {
  camSection: string;
  threadTitle: string;
  newMessageCount: number;
  authors: string[];
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
    // 1a. Find CAMs updated or created yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD

    let allCams: ParsedSop[] = [];
    try {
      allCams = parseAllSops(CAMS_DIR);
    } catch {
      this.logger.warn("CAM Daily Digest: could not read docs/cams/ directory");
      // Continue — discussion activity can still be sent
    }

    const digestEntries: CamDigestEntry[] = [];

    for (const cam of allCams) {
      const fm = cam.frontmatter;
      if (!fm.cam_id) continue;

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

    // Sort: new first, then by score descending
    digestEntries.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return b.score - a.score;
    });

    // 1b. Find discussion messages created yesterday, grouped by thread
    const yesterdayStart = new Date(yesterdayStr + "T00:00:00.000Z");
    const todayStart = new Date(yesterdayStart);
    todayStart.setUTCDate(todayStart.getUTCDate() + 1);

    let allDiscussionEntries: DiscussionDigestEntry[] = [];
    try {
      const recentMessages = await this.prisma.camDiscussionMessage.findMany({
        where: {
          createdAt: { gte: yesterdayStart, lt: todayStart },
          isSystemMessage: false,
          thread: { camSection: { not: null } },
        },
        include: {
          thread: { select: { camSection: true, title: true } },
          author: { select: { firstName: true, lastName: true, email: true } },
        },
      });

      const authorName = (a: { firstName: string | null; lastName: string | null; email: string }) =>
        `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email;

      const discMap = new Map<
        string,
        { camSection: string; threadTitle: string; count: number; authors: Set<string> }
      >();
      for (const msg of recentMessages) {
        const section = msg.thread.camSection!;
        const key = `${section}::${msg.thread.title}`;
        const existing = discMap.get(key);
        if (existing) {
          existing.count++;
          existing.authors.add(authorName(msg.author));
        } else {
          discMap.set(key, {
            camSection: section,
            threadTitle: msg.thread.title,
            count: 1,
            authors: new Set([authorName(msg.author)]),
          });
        }
      }

      allDiscussionEntries = [...discMap.values()].map((d) => ({
        camSection: d.camSection,
        threadTitle: d.threadTitle,
        newMessageCount: d.count,
        authors: [...d.authors],
      }));
    } catch (err: any) {
      this.logger.warn(`CAM Digest: discussion query failed: ${err?.message}`);
    }

    // 2. If nothing to report, skip
    if (digestEntries.length === 0 && allDiscussionEntries.length === 0) {
      this.logger.log(
        "CAM Daily Digest: no new/updated CAMs or discussion activity yesterday. Skipping.",
      );
      return;
    }

    // 3. Find all PIP users with their digest subscriptions
    const pipUsers = await this.prisma.documentShareToken.findMany({
      where: {
        documentType: ShareDocumentType.CAM_LIBRARY,
        cndaAcceptedAt: { not: null },
        questionnaireCompletedAt: { not: null },
        inviteeEmail: { not: null },
      },
      select: {
        id: true,
        token: true,
        inviteeEmail: true,
        inviteeName: true,
        camSubscriptions: {
          where: { notifyDigest: true },
          select: { camSection: true },
        },
      },
    });

    if (pipUsers.length === 0) {
      this.logger.log("CAM Daily Digest: no PIP users with full access. Skipping.");
      return;
    }

    // Deduplicate by email, merge subscriptions across tokens
    const emailMap = new Map<
      string,
      { name: string | null; token: string; subscribedSections: Set<string> }
    >();
    for (const u of pipUsers) {
      const email = u.inviteeEmail!.toLowerCase();
      const existing = emailMap.get(email);
      if (existing) {
        for (const sub of u.camSubscriptions) {
          existing.subscribedSections.add(sub.camSection);
        }
      } else {
        emailMap.set(email, {
          name: u.inviteeName,
          token: u.token,
          subscribedSections: new Set(
            u.camSubscriptions.map((s) => s.camSection),
          ),
        });
      }
    }

    this.logger.log(
      `CAM Daily Digest: ${digestEntries.length} CAM(s), ${allDiscussionEntries.length} discussion thread(s) → ${emailMap.size} recipient(s)`,
    );

    // 4. Send personalized digest email to each PIP user
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://staging-ncc.nfsgrp.com";

    let sent = 0;
    let failed = 0;

    for (const [email, { name, token, subscribedSections }] of emailMap) {
      // Filter discussion entries to user's subscribed sections
      const userDiscussion = allDiscussionEntries.filter((d) =>
        subscribedSections.has(d.camSection),
      );

      // Skip if nothing to send for this user
      if (digestEntries.length === 0 && userDiscussion.length === 0) continue;

      const shareUrl = `${baseUrl}/cam-access/${token}`;
      try {
        await this.email.sendCamDigest({
          toEmail: email,
          recipientName: name ?? undefined,
          entries: digestEntries,
          discussionEntries:
            userDiscussion.length > 0 ? userDiscussion : undefined,
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
