import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";
import { NotificationsService } from "../notifications/notifications.service";
import { GovInfoService, GovInfoGranuleSummary } from "./govinfo.service";
import { $Enums } from "@prisma/client";

/** Default check interval: 6 hours. */
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Redis key for the last-check timestamp. */
const LAST_CHECK_KEY = "govinfo:fr-monitor:last-check";

/** CFR titles to watch — comma-separated in env, defaults to 29,40. */
const DEFAULT_WATCHED_TITLES = "29,40";

/** FR document types we care about. */
const RELEVANT_DOC_TYPES = new Set(["RULE", "PRORULE", "NOTICE"]);

/**
 * Agencies we're interested in. Used to filter granule summaries.
 * We check the granule title / agencies list for these strings.
 */
const WATCHED_AGENCIES = [
  "Occupational Safety and Health",
  "OSHA",
  "Environmental Protection Agency",
  "EPA",
];

@Injectable()
export class FrMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FrMonitorService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly watchedTitles: number[];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
    private readonly govInfo: GovInfoService,
  ) {
    this.intervalMs = Number(
      this.config.get<string>("FR_MONITOR_INTERVAL_MS") || DEFAULT_INTERVAL_MS,
    );
    const titlesCsv =
      this.config.get<string>("FR_MONITOR_CFR_TITLES") || DEFAULT_WATCHED_TITLES;
    this.watchedTitles = titlesCsv
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  onModuleInit() {
    if (!this.govInfo.isEnabled()) {
      this.logger.warn("FR Monitor disabled — GOVINFO_API_KEY not set");
      return;
    }

    this.logger.log(
      `FR Monitor started (interval: ${(this.intervalMs / 3600000).toFixed(1)}h, ` +
        `watching CFR titles: ${this.watchedTitles.join(", ")})`,
    );

    // Run initial check after a short delay (let app fully boot)
    setTimeout(() => {
      this.runCheck().catch((err) =>
        this.logger.error(`Initial FR check failed: ${err?.message ?? err}`),
      );
    }, 30_000);

    this.intervalHandle = setInterval(() => {
      this.runCheck().catch((err) =>
        this.logger.error(`FR monitor tick failed: ${err?.message ?? err}`),
      );
    }, this.intervalMs);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Manually trigger a check (called from controller). */
  async triggerCheck(): Promise<{
    newAlerts: number;
    totalPackagesScanned: number;
    granulesSeen: number;
  }> {
    return this.runCheck();
  }

  /** Get monitor status. */
  async getStatus(): Promise<{
    enabled: boolean;
    lastCheckAt: string | null;
    intervalHours: number;
    watchedTitles: number[];
    totalAlerts: number;
    unreadAlerts: number;
  }> {
    const lastCheck = await this.redis.getJson<string>(LAST_CHECK_KEY);
    const [totalAlerts, unreadAlerts] = await Promise.all([
      this.prisma.federalRegisterAlert.count(),
      this.prisma.federalRegisterAlert.count({
        where: { isRead: false, isRelevant: true },
      }),
    ]);

    return {
      enabled: this.govInfo.isEnabled(),
      lastCheckAt: lastCheck,
      intervalHours: this.intervalMs / 3600000,
      watchedTitles: this.watchedTitles,
      totalAlerts,
      unreadAlerts,
    };
  }

  // -----------------------------------------------------------------------
  // Core monitoring logic
  // -----------------------------------------------------------------------

  private async runCheck(): Promise<{
    newAlerts: number;
    totalPackagesScanned: number;
    granulesSeen: number;
  }> {
    this.logger.log("FR Monitor: starting check...");

    // Determine the start date — either last check or 30 days ago
    const lastCheckStr = await this.redis.getJson<string>(LAST_CHECK_KEY);
    const startDate = lastCheckStr
      ? lastCheckStr
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    let newAlerts = 0;
    let totalPackagesScanned = 0;
    let granulesSeen = 0;

    try {
      // 1. Get FR packages modified since last check
      const packages = await this.govInfo.getCollectionPackages("FR", startDate, {
        pageSize: 100,
        fetchAll: true,
      });

      totalPackagesScanned = packages.length;
      this.logger.log(`FR Monitor: found ${packages.length} FR packages since ${startDate}`);

      // 2. Process each package — get granules and filter
      for (const pkg of packages) {
        const granules = await this.govInfo.getPackageGranules(pkg.packageId, {
          pageSize: 100,
          fetchAll: true,
        });

        for (const granRef of granules) {
          granulesSeen++;

          // Quick title-based pre-filter: skip granules clearly unrelated
          if (!this.isLikelyRelevant(granRef.title)) continue;

          // Get full granule summary for detailed filtering
          const summary = await this.govInfo.getGranuleSummary(
            pkg.packageId,
            granRef.granuleId,
          );
          if (!summary) continue;

          // Check if this granule references our watched CFR titles
          if (!this.matchesCfrTitles(summary)) continue;

          // Check document type
          const docType = this.extractDocType(summary);
          if (!RELEVANT_DOC_TYPES.has(docType)) continue;

          // Upsert the alert
          const created = await this.upsertAlert(pkg.packageId, summary, docType);
          if (created) newAlerts++;
        }
      }

      // 3. Update last-check timestamp
      const now = new Date().toISOString();
      await this.redis.setJson(LAST_CHECK_KEY, now, 0); // No TTL — persist

      // 4. If there are new alerts, notify admins
      if (newAlerts > 0) {
        await this.notifyAdmins(newAlerts);
      }

      this.logger.log(
        `FR Monitor: check complete — ${newAlerts} new alerts from ${totalPackagesScanned} packages, ${granulesSeen} granules`,
      );
    } catch (err: any) {
      this.logger.error(`FR Monitor error: ${err?.message ?? err}`, err?.stack);
    }

    return { newAlerts, totalPackagesScanned, granulesSeen };
  }

  // -----------------------------------------------------------------------
  // Filtering helpers
  // -----------------------------------------------------------------------

  /** Quick pre-filter based on granule title text. */
  private isLikelyRelevant(title: string): boolean {
    if (!title) return false;
    const lower = title.toLowerCase();
    return WATCHED_AGENCIES.some((a) => lower.includes(a.toLowerCase()));
  }

  /** Check if the granule's CFR references match our watched titles. */
  private matchesCfrTitles(summary: GovInfoGranuleSummary): boolean {
    // GovInfo granule summaries may have CFR part references in various fields
    const text = JSON.stringify(summary).toLowerCase();
    return this.watchedTitles.some((t) => {
      // Match patterns like "29 CFR", "title 29", "CFR title 29"
      const patterns = [
        `${t} cfr`,
        `title ${t}`,
        `cfr title ${t}`,
        `cfr part ${t === 29 ? "1926" : ""}`,
        `cfr part ${t === 29 ? "1910" : ""}`,
      ];
      return patterns.some((p) => p && text.includes(p));
    });
  }

  /** Extract FR document type from granule summary. */
  private extractDocType(summary: GovInfoGranuleSummary): string {
    const category = (summary.category || "").toUpperCase();
    if (category.includes("RULE") && category.includes("PROPOSED")) return "PRORULE";
    if (category.includes("RULE")) return "RULE";
    if (category.includes("NOTICE")) return "NOTICE";
    if (category.includes("PRESIDENT")) return "PRESDOC";

    // Fallback: check granule class
    const cls = (summary.subGranuleClass || "").toUpperCase();
    if (cls.includes("PRORULE")) return "PRORULE";
    if (cls.includes("RULE")) return "RULE";
    if (cls.includes("NOTICE")) return "NOTICE";

    return "NOTICE"; // Default
  }

  /** Extract CFR reference strings from granule metadata. */
  private extractCfrReferences(summary: GovInfoGranuleSummary): string[] {
    const refs: Set<string> = new Set();
    const text = JSON.stringify(summary);

    // Match patterns like "29 CFR 1926", "29 CFR Part 1910", etc.
    const cfrPattern = /(\d{1,2})\s*CFR\s*(?:Part\s*)?(\d+)/gi;
    let match: RegExpExecArray | null;
    while ((match = cfrPattern.exec(text)) !== null) {
      const title = parseInt(match[1], 10);
      if (this.watchedTitles.includes(title)) {
        refs.add(`${match[1]} CFR ${match[2]}`);
      }
    }

    return Array.from(refs);
  }

  /** Extract agency names from granule metadata. */
  private extractAgencies(summary: GovInfoGranuleSummary): string[] {
    const agencies: Set<string> = new Set();
    const text = JSON.stringify(summary).toLowerCase();

    if (text.includes("osha") || text.includes("occupational safety")) {
      agencies.add("OSHA");
    }
    if (text.includes("epa") || text.includes("environmental protection")) {
      agencies.add("EPA");
    }

    return Array.from(agencies);
  }

  // -----------------------------------------------------------------------
  // Database operations
  // -----------------------------------------------------------------------

  /** Upsert a Federal Register alert. Returns true if newly created. */
  private async upsertAlert(
    packageId: string,
    summary: GovInfoGranuleSummary,
    docType: string,
  ): Promise<boolean> {
    const granuleId = summary.granuleId;

    // Check if already exists
    const existing = await this.prisma.federalRegisterAlert.findUnique({
      where: { granuleId },
      select: { id: true },
    });
    if (existing) return false;

    const publishedDate = summary.dateIssued
      ? new Date(summary.dateIssued)
      : new Date();

    await this.prisma.federalRegisterAlert.create({
      data: {
        granuleId,
        packageId,
        documentType: docType,
        title: summary.title || "Untitled Federal Register Document",
        summary: this.extractSummaryText(summary),
        cfrReferences: this.extractCfrReferences(summary),
        agencies: this.extractAgencies(summary),
        publishedDate,
        govInfoUrl: `https://www.govinfo.gov/app/details/${packageId}/${granuleId}`,
        frDocNumber: granuleId, // Granule ID is typically the FR doc number
      },
    });

    return true;
  }

  /** Try to pull a useful summary from the granule metadata. */
  private extractSummaryText(summary: GovInfoGranuleSummary): string | null {
    // GovInfo summaries may contain a description or abstract
    return (summary as any).description
      || (summary as any).abstract
      || null;
  }

  // -----------------------------------------------------------------------
  // Notifications
  // -----------------------------------------------------------------------

  /** Notify all SUPER_ADMIN users about new FR alerts. */
  private async notifyAdmins(newAlertCount: number): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { globalRole: "SUPER_ADMIN" },
        select: { id: true },
      });

      const plural = newAlertCount === 1 ? "" : "s";
      for (const admin of admins) {
        await this.notifications.createNotification({
          userId: admin.id,
          kind: $Enums.NotificationKind.GENERIC,
          title: "📋 New Federal Register Alert" + plural,
          body: `${newAlertCount} new Federal Register document${plural} affecting OSHA/EPA regulations. Review in System → GovInfo Alerts.`,
          metadata: { type: "FR_ALERT", count: newAlertCount },
        });
      }

      this.logger.log(`Notified ${admins.length} admins of ${newAlertCount} new FR alert${plural}`);
    } catch (err: any) {
      this.logger.warn(`Failed to notify admins: ${err?.message ?? err}`);
    }
  }
}
