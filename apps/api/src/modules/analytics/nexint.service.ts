import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../infra/prisma/prisma.service";

/** Industry baselines from TECH-VIS-0002 CAM doc */
const INDUSTRY_BASELINE = { fi: 72, pc: 68, co: 78, dq: 70, composite: 72 };

/** Dimension weights */
const WEIGHTS = { fi: 0.35, pc: 0.25, co: 0.20, dq: 0.20 };

export interface NexIntScore {
  composite: number;
  fi: number;
  pc: number;
  co: number;
  dq: number;
  components: {
    fi: { receiptCoverage: number; dupDetection: number; pricingAccuracy: number; reconciliation: number };
    pc: { taskCompletion: number; assessmentAssignment: number; scanUtilization: number; reviewCycleHrs: number };
    co: { stubbed: boolean; note: string };
    dq: { aiLearning: number; fleetConsistency: number; assessmentConfidence: number };
  };
}

export interface NexIntDashboard {
  current: NexIntScore;
  trend: { date: string; composite: number; fi: number; pc: number; co: number; dq: number }[];
  industryBaseline: typeof INDUSTRY_BASELINE;
  delta30d: { composite: number; fi: number; pc: number; co: number; dq: number } | null;
}

@Injectable()
export class NexIntService {
  private readonly logger = new Logger(NexIntService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Core Computation ──────────────────────────────────────────────────

  async computeNexInt(companyId: string): Promise<NexIntScore> {
    const [fi, pc, co, dq] = await Promise.all([
      this.computeFinancialIntegrity(companyId),
      this.computeProcessCompletion(companyId),
      this.computeCompliance(companyId),
      this.computeDataQuality(companyId),
    ]);

    const composite = round(
      fi.score * WEIGHTS.fi +
      pc.score * WEIGHTS.pc +
      co.score * WEIGHTS.co +
      dq.score * WEIGHTS.dq,
    );

    return {
      composite,
      fi: fi.score,
      pc: pc.score,
      co: co.score,
      dq: dq.score,
      components: {
        fi: fi.components,
        pc: pc.components,
        co: { stubbed: true, note: "Pending NexCheck checklist & certification model integration" },
        dq: dq.components,
      },
    };
  }

  // ── Financial Integrity (35%) ─────────────────────────────────────────

  private async computeFinancialIntegrity(companyId: string) {
    const [
      totalBills,
      billsWithAttachments,
      totalSiblingGroups,
      disposedGroups,
      totalInvoiceLines,
      linesWithCostBook,
      totalTransactions,
      matchedTransactions,
    ] = await Promise.all([
      // Receipt Coverage
      this.prisma.projectBill.count({
        where: { companyId, status: { not: "DRAFT" } },
      }),
      this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT COUNT(DISTINCT pb.id)::int AS cnt
        FROM "ProjectBill" pb
        JOIN "ProjectBillAttachment" pba ON pba."billId" = pb.id
        WHERE pb."companyId" = ${companyId} AND pb.status != 'DRAFT'
      `.then(r => r[0]?.cnt ?? 0),

      // Duplicate Detection
      this.prisma.billSiblingGroup.count({ where: { companyId } }),
      this.prisma.duplicateExpenseDisposition.count({ where: { companyId } }),

      // Pricing Accuracy
      this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt
        FROM "ProjectInvoiceLineItem" pili
        JOIN "ProjectInvoice" pi ON pi.id = pili."invoiceId"
        WHERE pi."companyId" = ${companyId}
      `.then(r => r[0]?.cnt ?? 0),
      this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt
        FROM "ProjectInvoiceLineItem" pili
        JOIN "ProjectInvoice" pi ON pi.id = pili."invoiceId"
        WHERE pi."companyId" = ${companyId}
          AND pili."costBookUnitPrice" IS NOT NULL
      `.then(r => r[0]?.cnt ?? 0),

      // Reconciliation
      this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT (
          (SELECT COUNT(*)::int FROM "ImportedTransaction" WHERE "companyId" = ${companyId})
          +
          (SELECT COUNT(*)::int FROM "BankTransaction" WHERE "companyId" = ${companyId})
        ) AS cnt
      `.then(r => r[0]?.cnt ?? 0),
      this.prisma.$queryRaw<{ cnt: number }[]>`
        SELECT (
          (SELECT COUNT(*)::int FROM "ImportedTransaction" WHERE "companyId" = ${companyId} AND "projectId" IS NOT NULL)
          +
          (SELECT COUNT(*)::int FROM "BankTransaction" WHERE "companyId" = ${companyId} AND "projectId" IS NOT NULL)
        ) AS cnt
      `.then(r => r[0]?.cnt ?? 0),
    ]);

    const receiptCoverage = safePercent(billsWithAttachments, totalBills);
    const dupDetection = totalSiblingGroups > 0
      ? safePercent(disposedGroups, totalSiblingGroups)
      : 100; // No duplicates detected = perfect
    const pricingAccuracy = safePercent(linesWithCostBook, totalInvoiceLines);
    const reconciliation = safePercent(matchedTransactions, totalTransactions);

    // Weighted average of sub-metrics (equal weight within dimension)
    const score = round((receiptCoverage + dupDetection + pricingAccuracy + reconciliation) / 4);

    return {
      score,
      components: {
        receiptCoverage: round(receiptCoverage),
        dupDetection: round(dupDetection),
        pricingAccuracy: round(pricingAccuracy),
        reconciliation: round(reconciliation),
      },
    };
  }

  // ── Process Completion (25%) ──────────────────────────────────────────

  private async computeProcessCompletion(companyId: string) {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [
      totalTasks,
      completedTasks,
      totalAssessments,
      assignedAssessments,
      totalScans,
      assignedScans,
      reviewCycleRows,
    ] = await Promise.all([
      // Task Completion (last 90 days)
      this.prisma.task.count({ where: { companyId, createdAt: { gte: ninetyDaysAgo } } }),
      this.prisma.task.count({
        where: { companyId, createdAt: { gte: ninetyDaysAgo }, status: "DONE" },
      }),

      // Assessment Assignment
      this.prisma.videoAssessment.count({ where: { companyId } }),
      this.prisma.videoAssessment.count({ where: { companyId, projectId: { not: null } } }),

      // Scan Utilization
      this.prisma.precisionScan.count({ where: { companyId } }),
      this.prisma.precisionScan.count({ where: { companyId, projectId: { not: null } } }),

      // Review Cycle Time (median hours from creation to review)
      this.prisma.$queryRaw<{ median_hrs: number | null }[]>`
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM ("reviewedAt" - "createdAt")) / 3600.0
        )::float AS median_hrs
        FROM "PmReviewItem"
        WHERE "companyId" = ${companyId}
          AND "reviewedAt" IS NOT NULL
          AND status != 'PENDING'
      `.then(r => r),
    ]);

    const taskCompletion = safePercent(completedTasks, totalTasks);
    const assessmentAssignment = safePercent(assignedAssessments, totalAssessments);
    const scanUtilization = safePercent(assignedScans, totalScans);
    const medianReviewHrs = reviewCycleRows[0]?.median_hrs ?? null;

    // Review cycle score: <24h = 100%, <48h = 80%, <72h = 60%, >72h scales down
    let reviewScore = 100;
    if (medianReviewHrs !== null) {
      if (medianReviewHrs <= 24) reviewScore = 100;
      else if (medianReviewHrs <= 48) reviewScore = 80;
      else if (medianReviewHrs <= 72) reviewScore = 60;
      else reviewScore = Math.max(0, 100 - (medianReviewHrs - 24) * 1.5);
    }

    const score = round((taskCompletion + assessmentAssignment + scanUtilization + reviewScore) / 4);

    return {
      score,
      components: {
        taskCompletion: round(taskCompletion),
        assessmentAssignment: round(assessmentAssignment),
        scanUtilization: round(scanUtilization),
        reviewCycleHrs: round(medianReviewHrs ?? 0),
      },
    };
  }

  // ── Compliance (20%) — Stubbed ────────────────────────────────────────

  private async computeCompliance(_companyId: string) {
    // ComplianceChecklist and UserCertification models not yet in schema.
    // Stub at 85% — representative mid-range for a disciplined contractor
    // that uses NexCheck but without measurable coverage data yet.
    return { score: 85 };
  }

  // ── Data Quality (20%) ────────────────────────────────────────────────

  private async computeDataQuality(companyId: string) {
    const [
      totalTeaching,
      confirmedTeaching,
      deviceVersions,
      avgConfidence,
    ] = await Promise.all([
      // AI Learning Velocity
      this.prisma.assessmentTeachingExample.count({ where: { companyId } }),
      this.prisma.assessmentTeachingExample.count({ where: { companyId, confirmed: true } }),

      // Fleet Consistency — group active devices by appVersion
      this.prisma.nliDevice.groupBy({
        by: ["appVersion"],
        where: { companyId, active: true, appVersion: { not: null } },
        _count: true,
      }),

      // Assessment Confidence — average across all assessed
      this.prisma.videoAssessment.aggregate({
        where: { companyId, confidenceScore: { not: null } },
        _avg: { confidenceScore: true },
      }),
    ]);

    const aiLearning = safePercent(confirmedTeaching, totalTeaching);

    // Fleet consistency: % of devices on the most common (latest) version
    let fleetConsistency = 100;
    if (deviceVersions.length > 0) {
      const totalDevices = deviceVersions.reduce((sum, g) => sum + g._count, 0);
      const maxVersionCount = Math.max(...deviceVersions.map(g => g._count));
      fleetConsistency = safePercent(maxVersionCount, totalDevices);
    }

    // Assessment confidence: scale 0-1 → 0-100
    const rawConfidence = avgConfidence._avg.confidenceScore ?? 0.85;
    const assessmentConfidence = round(rawConfidence * 100);

    const score = round((aiLearning + fleetConsistency + assessmentConfidence) / 3);

    return {
      score,
      components: {
        aiLearning: round(aiLearning),
        fleetConsistency: round(fleetConsistency),
        assessmentConfidence: round(assessmentConfidence),
      },
    };
  }

  // ── Snapshot Storage ──────────────────────────────────────────────────

  async computeAndStoreSnapshot(companyId: string): Promise<NexIntScore> {
    const score = await this.computeNexInt(companyId);
    const today = new Date().toISOString().slice(0, 10);
    const dateValue = new Date(today + "T00:00:00Z");

    await this.prisma.nexIntSnapshot.upsert({
      where: { NexIntSnapshot_company_date_key: { companyId, date: dateValue } },
      update: {
        composite: score.composite,
        fi: score.fi,
        pc: score.pc,
        co: score.co,
        dq: score.dq,
        componentMetrics: score.components as any,
      },
      create: {
        companyId,
        date: dateValue,
        composite: score.composite,
        fi: score.fi,
        pc: score.pc,
        co: score.co,
        dq: score.dq,
        componentMetrics: score.components as any,
      },
    });

    return score;
  }

  // ── Dashboard Data ────────────────────────────────────────────────────

  async getNexIntDashboard(companyId: string): Promise<NexIntDashboard> {
    // Compute current score live (most accurate)
    const current = await this.computeNexInt(companyId);

    // Fetch historical snapshots (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const snapshots = await this.prisma.nexIntSnapshot.findMany({
      where: { companyId, date: { gte: ninetyDaysAgo } },
      orderBy: { date: "asc" },
      select: { date: true, composite: true, fi: true, pc: true, co: true, dq: true },
    }) as { date: Date; composite: number; fi: number; pc: number; co: number; dq: number }[];

    const trend = snapshots.map((s: { date: Date; composite: number; fi: number; pc: number; co: number; dq: number }) => ({
      date: s.date.toISOString().slice(0, 10),
      composite: s.composite,
      fi: s.fi,
      pc: s.pc,
      co: s.co,
      dq: s.dq,
    }));

    // Calculate 30-day delta
    let delta30d: NexIntDashboard["delta30d"] = null;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oldSnapshot = snapshots.find(
      (s: { date: Date }) => s.date >= thirtyDaysAgo && s.date <= new Date(thirtyDaysAgo.getTime() + 3 * 86400000),
    );
    if (oldSnapshot) {
      delta30d = {
        composite: round(current.composite - oldSnapshot.composite),
        fi: round(current.fi - oldSnapshot.fi),
        pc: round(current.pc - oldSnapshot.pc),
        co: round(current.co - oldSnapshot.co),
        dq: round(current.dq - oldSnapshot.dq),
      };
    }

    return { current, trend, industryBaseline: INDUSTRY_BASELINE, delta30d };
  }

  // ── Cross-Company Summary (Admin) ─────────────────────────────────────

  async getAllCompanyScores() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    const results = await Promise.all(
      companies.map(async c => {
        try {
          const score = await this.computeNexInt(c.id);
          return { companyId: c.id, companyName: c.name, ...score };
        } catch {
          return { companyId: c.id, companyName: c.name, composite: 0, fi: 0, pc: 0, co: 0, dq: 0, components: null };
        }
      }),
    );

    return results.sort((a, b) => b.composite - a.composite);
  }

  // ── Nightly Cron (3:00 AM UTC — after activity rollups at 2:00 AM) ───

  @Cron("0 3 * * *")
  async computeNightlySnapshots(): Promise<void> {
    this.logger.log("NexINT nightly snapshot computation starting…");

    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    });

    let success = 0;
    let failed = 0;

    for (const company of companies) {
      try {
        await this.computeAndStoreSnapshot(company.id);
        success++;
      } catch (err) {
        this.logger.warn(`NexINT snapshot failed for ${company.name}: ${(err as Error).message}`);
        failed++;
      }
    }

    this.logger.log(`NexINT nightly snapshots: ${success} succeeded, ${failed} failed`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100; // No data = no issues = 100%
  return Math.min(100, (numerator / denominator) * 100);
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
