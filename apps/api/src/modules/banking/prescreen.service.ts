import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CsvImportSource } from "@prisma/client";
import { DuplicateBillDetectorService } from "./duplicate-bill-detector.service";

// ---------------------------------------------------------------------------
// Confidence thresholds
// ---------------------------------------------------------------------------

const MIN_CONFIDENCE = 0.30;      // Below this → no suggestion
const MULTI_SIGNAL_BOOST = 0.10;  // Boost when 2+ signals agree
const MAX_CONFIDENCE = 0.98;

// Learning feedback adjustments
const ACCEPT_BOOST_PER = 0.05;    // +0.05 per historical acceptance
const ACCEPT_BOOST_MAX = 0.20;    // Cap cumulative acceptance boost
const OVERRIDE_BOOST = 0.10;      // Boost per override (user corrected → new mapping)
const OVERRIDE_BOOST_MAX = 0.30;  // Cap cumulative override boost
const REJECT_PENALTY_PER = 0.15;  // -0.15 per rejection occurrence
const REJECT_PENALTY_MAX = 0.50;  // Cap cumulative rejection penalty

// ---------------------------------------------------------------------------
// Levenshtein distance (lightweight, no deps)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[la][lb];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrescreenCandidate {
  projectId: string;
  projectName: string;
  confidence: number;
  reason: string;
  signal: string;
}

interface ProjectRef {
  id: string;
  name: string;
  nameUpper: string;
}

@Injectable()
export class PrescreenService {
  private readonly logger = new Logger(PrescreenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly duplicateDetector: DuplicateBillDetectorService,
  ) {}

  // ─── Main entry: run prescreening on a batch of imported transactions ──

  async prescreenBatch(companyId: string, batchId: string): Promise<{
    total: number;
    prescreened: number;
    billsCreated: number;
  }> {
    // Load all projects for this company
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });
    const projectRefs: ProjectRef[] = projects.map((p) => ({
      id: p.id,
      name: p.name,
      nameUpper: p.name.toUpperCase().trim(),
    }));

    // Load transactions from this batch that haven't been prescreened yet
    const transactions = await this.prisma.importedTransaction.findMany({
      where: {
        batchId,
        companyId,
        prescreenStatus: "PENDING",
        prescreenProjectId: null,
      },
    });

    if (transactions.length === 0) {
      return { total: 0, prescreened: 0, billsCreated: 0 };
    }

    // Pre-compute historical data for signals 2-4
    const storeAffinity = await this.computeStoreAffinity(companyId);
    const purchaserStoreAffinity = await this.computePurchaserStoreAffinity(companyId);
    const descriptionPatterns = await this.computeDescriptionPatterns(companyId);

    // Load ALL feedback for learning loop
    const feedback = await this.computeFeedbackMaps(companyId);

    let prescreenedCount = 0;
    let billsCreated = 0;

    for (const txn of transactions) {
      const candidates: PrescreenCandidate[] = [];

      // Signal 1: Job Name → Project match (HD only)
      if (txn.jobName && txn.source === CsvImportSource.HD_PRO_XTRA) {
        const jobUpper = txn.jobName.toUpperCase().trim();
        if (jobUpper !== "UNKNOWN" && jobUpper !== "PERSONAL" && jobUpper !== "GENERAL SUPPLIES") {
          for (const proj of projectRefs) {
            let conf = 0;
            let matchType = "";

            if (jobUpper === proj.nameUpper) {
              conf = 0.95;
              matchType = "exact";
            } else if (proj.nameUpper.includes(jobUpper) || jobUpper.includes(proj.nameUpper)) {
              conf = 0.80;
              matchType = "substring";
            } else if (levenshtein(jobUpper, proj.nameUpper) <= 2) {
              conf = 0.85;
              matchType = "fuzzy";
            }

            if (conf > 0) {
              // Apply learned adjustments
              conf = this.applyFeedbackAdjustments(conf, txn.jobName ?? "", proj.id, txn.storeNumber, txn.purchaser, feedback);
              candidates.push({
                projectId: proj.id,
                projectName: proj.name,
                confidence: conf,
                reason: `HD Job Name "${txn.jobNameRaw}" normalized to "${txn.jobName}" → ${matchType} match with project "${proj.name}"`,
                signal: "JOB_NAME",
              });
            }
          }
        }
      }

      // Signal 2: Store-proximity affinity (HD only)
      if (txn.storeNumber && txn.source === CsvImportSource.HD_PRO_XTRA) {
        const storeData = storeAffinity.get(txn.storeNumber);
        if (storeData) {
          for (const [projId, pct] of storeData.entries()) {
            if (pct >= 0.30) {
              const proj = projectRefs.find((p) => p.id === projId);
              if (proj) {
                // Scale confidence: 30% affinity → 0.40, 100% → 0.75
                let conf = 0.40 + (pct - 0.30) * (0.35 / 0.70);
                conf = this.applyFeedbackAdjustments(conf, txn.jobName ?? "", proj.id, txn.storeNumber, txn.purchaser, feedback);
                candidates.push({
                  projectId: proj.id,
                  projectName: proj.name,
                  confidence: Math.min(conf, 0.75),
                  reason: `Store #${txn.storeNumber}: ${(pct * 100).toFixed(0)}% of historical purchases assigned to "${proj.name}"`,
                  signal: "STORE_AFFINITY",
                });
              }
            }
          }
        }
      }

      // Signal 3: Purchaser + Store combo (HD only)
      if (txn.purchaser && txn.storeNumber && txn.source === CsvImportSource.HD_PRO_XTRA) {
        const comboKey = `${txn.purchaser.toLowerCase()}|${txn.storeNumber}`;
        const comboData = purchaserStoreAffinity.get(comboKey);
        if (comboData) {
          for (const [projId, pct] of comboData.entries()) {
            if (pct >= 0.40) {
              const proj = projectRefs.find((p) => p.id === projId);
              if (proj) {
                let conf = 0.35 + (pct - 0.40) * (0.30 / 0.60);
                conf = this.applyFeedbackAdjustments(conf, txn.jobName ?? "", proj.id, txn.storeNumber, txn.purchaser, feedback);
                candidates.push({
                  projectId: proj.id,
                  projectName: proj.name,
                  confidence: Math.min(conf, 0.65),
                  reason: `Purchaser "${txn.purchaser}" at Store #${txn.storeNumber}: ${(pct * 100).toFixed(0)}% historical affinity to "${proj.name}"`,
                  signal: "PURCHASER_STORE",
                });
              }
            }
          }
        }
      }

      // Signal 4: Merchant + description historical pattern (all sources)
      if (txn.merchant && txn.description) {
        const descKey = txn.description.toLowerCase().slice(0, 40);
        const merchantKey = txn.merchant.toLowerCase();
        const patternKey = `${merchantKey}|${descKey}`;
        const patternData = descriptionPatterns.get(patternKey);
        if (patternData) {
          for (const [projId, count] of patternData.entries()) {
            if (count >= 3) {
              const proj = projectRefs.find((p) => p.id === projId);
              if (proj) {
                let conf = Math.min(0.30 + (count - 3) * 0.05, 0.60);
                conf = this.applyFeedbackAdjustments(conf, txn.jobName ?? "", proj.id, txn.storeNumber, txn.purchaser, feedback);
                candidates.push({
                  projectId: proj.id,
                  projectName: proj.name,
                  confidence: conf,
                  reason: `Description pattern "${txn.description.slice(0, 30)}..." from "${txn.merchant}" assigned to "${proj.name}" ${count} times historically`,
                  signal: "DESCRIPTION_PATTERN",
                });
              }
            }
          }
        }
      }

      // Signal 5: Description keyword / address match
      // (Lightweight: check if job name or description contains a project name as substring)
      if (txn.description || txn.jobNameRaw) {
        const textToSearch = `${txn.jobNameRaw ?? ""} ${txn.description ?? ""}`.toLowerCase();
        for (const proj of projectRefs) {
          // Only match project names that are at least 4 chars to avoid false positives
          if (proj.nameUpper.length >= 4 && textToSearch.includes(proj.nameUpper.toLowerCase())) {
            // Don't duplicate if already found by signal 1
            const alreadyFound = candidates.some(
              (c) => c.projectId === proj.id && c.signal === "JOB_NAME",
            );
            if (!alreadyFound) {
              candidates.push({
                projectId: proj.id,
                projectName: proj.name,
                confidence: 0.35,
                reason: `Project name "${proj.name}" found in transaction text`,
                signal: "KEYWORD_MATCH",
              });
            }
          }
        }
      }

      // Signal 6: Override learning — if user previously overrode a prescreen to a
      // different project for similar transactions, treat that as a positive signal
      for (const [overrideKey, overrideData] of feedback.overrideTargets.entries()) {
        // overrideKey is "jobName|storeNumber|purchaser"
        const parts = overrideKey.split("|");
        const oJobName = parts[0] ?? "";
        const oStore = parts[1] ?? "";
        const oPurchaser = parts[2] ?? "";
        const txnJob = (txn.jobName ?? "").toLowerCase();
        const txnStore = txn.storeNumber ?? "";
        const txnPurchaser = (txn.purchaser ?? "").toLowerCase();
        // Match if at least 2 of 3 attributes overlap
        let matchCount = 0;
        if (oJobName && txnJob && oJobName === txnJob) matchCount++;
        if (oStore && txnStore && oStore === txnStore) matchCount++;
        if (oPurchaser && txnPurchaser && oPurchaser === txnPurchaser) matchCount++;
        if (matchCount >= 2) {
          for (const [projId, count] of overrideData.entries()) {
            const alreadyFound = candidates.some((c) => c.projectId === projId);
            if (!alreadyFound) {
              const proj = projectRefs.find((p) => p.id === projId);
              if (proj) {
                const conf = Math.min(0.40 + (count - 1) * OVERRIDE_BOOST, 0.70);
                candidates.push({
                  projectId: proj.id,
                  projectName: proj.name,
                  confidence: conf,
                  reason: `User previously overrode similar transactions to "${proj.name}" (${count}× learned)`,
                  signal: "OVERRIDE_LEARNED",
                });
              }
            }
          }
        }
      }

      if (candidates.length === 0) continue;

      // Pick best candidate; boost if multiple signals agree
      const byProject = new Map<string, PrescreenCandidate[]>();
      for (const c of candidates) {
        if (!byProject.has(c.projectId)) byProject.set(c.projectId, []);
        byProject.get(c.projectId)!.push(c);
      }

      let bestProjectId = "";
      let bestConfidence = 0;
      let bestReasons: string[] = [];
      let conflicting = false;

      for (const [projId, projCandidates] of byProject.entries()) {
        let maxConf = Math.max(...projCandidates.map((c) => c.confidence));
        // Boost when multiple signals agree
        if (projCandidates.length >= 2) {
          maxConf = Math.min(maxConf + MULTI_SIGNAL_BOOST, MAX_CONFIDENCE);
        }
        if (maxConf > bestConfidence) {
          bestConfidence = maxConf;
          bestProjectId = projId;
          bestReasons = projCandidates.map((c) => c.reason);
        }
      }

      // Check for conflicting signals (different projects suggested)
      if (byProject.size > 1) {
        conflicting = true;
        bestReasons.push("⚠️ Conflicting signals: multiple projects suggested");
      }

      if (bestConfidence < MIN_CONFIDENCE) continue;

      // Update the transaction with prescreen data
      await this.prisma.importedTransaction.update({
        where: { id: txn.id },
        data: {
          prescreenProjectId: bestProjectId,
          prescreenConfidence: Math.round(bestConfidence * 100) / 100,
          prescreenReason: bestReasons.join(" | "),
          prescreenStatus: "PENDING",
        },
      });

      // ── Duplicate detection gate ──────────────────────────────────
      const vendorName = txn.merchant ?? txn.description?.slice(0, 50) ?? "Unknown";
      let isDuplicate = false;
      let duplicateMatch: Awaited<ReturnType<DuplicateBillDetectorService["findDuplicateBills"]>>[0] | null = null;

      try {
        const dupes = await this.duplicateDetector.findDuplicateBills(
          companyId,
          bestProjectId,
          vendorName,
          txn.amount,
          txn.date,
        );
        if (dupes.length > 0) {
          isDuplicate = true;
          duplicateMatch = dupes[0]; // Best match by confidence
          this.logger.log(
            `Duplicate detected for txn ${txn.id}: matches bill ${duplicateMatch.billId} ` +
              `(conf=${duplicateMatch.confidence.toFixed(2)}, ${duplicateMatch.reason})`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Duplicate check failed for txn ${txn.id}: ${err.message}`);
      }

      // Create tentative bill in the project
      try {
        const bill = await this.prisma.projectBill.create({
          data: {
            companyId,
            projectId: bestProjectId,
            vendorName,
            billDate: txn.date,
            totalAmount: txn.amount,
            status: "TENTATIVE",
            sourceTransactionId: txn.id,
            sourceTransactionSource: txn.source,
            prescreenConfidence: Math.round(bestConfidence * 100) / 100,
            billRole: isDuplicate ? "VERIFICATION" : "PRIMARY",
            memo: isDuplicate
              ? `Auto-prescreened (verification): corroborates bill ${duplicateMatch!.billId.slice(-8)}`
              : `Auto-prescreened: ${bestReasons[0]?.slice(0, 200) ?? ""}`,
            lineItems: {
              create: [
                {
                  kind: "MATERIALS",
                  description: txn.description || txn.sku || "Imported transaction",
                  amount: txn.amount,
                  amountSource: "MANUAL",
                },
                // Add offset line item if this is a verification bill
                ...(isDuplicate
                  ? [
                      {
                        kind: "DUPLICATE_OFFSET" as const,
                        description: `Verification offset — corroborated by [Bill ${duplicateMatch!.billId.slice(-8)}]`,
                        amount: -txn.amount,
                        amountSource: "MANUAL" as const,
                      },
                    ]
                  : []),
              ],
            },
          },
        });

        // Create sibling group if duplicate detected
        if (isDuplicate && duplicateMatch) {
          try {
            await this.duplicateDetector.createSiblingGroup(
              companyId,
              bestProjectId,
              duplicateMatch.billId, // Existing bill is PRIMARY
              bill.id,               // New bill is VERIFICATION
              duplicateMatch.confidence,
              duplicateMatch.reason,
            );
          } catch (err: any) {
            this.logger.warn(`Failed to create sibling group for bill ${bill.id}: ${err.message}`);
          }
        }

        billsCreated++;
      } catch (err: any) {
        this.logger.warn(`Failed to create tentative bill for txn ${txn.id}: ${err.message}`);
      }

      prescreenedCount++;
    }

    this.logger.log(
      `Prescreened batch ${batchId}: ${prescreenedCount}/${transactions.length} matched, ${billsCreated} tentative bills created`,
    );

    return {
      total: transactions.length,
      prescreened: prescreenedCount,
      billsCreated,
    };
  }

  // ─── Feedback learning maps ────────────────────────────────────────

  /** Build maps from PrescreenFeedback for acceptance boosts, rejection penalties, and override learning */
  private async computeFeedbackMaps(companyId: string) {
    const allFeedback = await this.prisma.prescreenFeedback.findMany({
      where: { companyId },
      select: {
        feedbackType: true,
        prescreenProjectId: true,
        actualProjectId: true,
        jobNameNormalized: true,
        storeNumber: true,
        purchaser: true,
      },
    });

    // jobName|projectId → count of acceptances
    const acceptCounts = new Map<string, number>();
    // jobName|projectId → count of rejections
    const rejectCounts = new Map<string, number>();
    // storeNumber|projectId → count of rejections
    const storeRejectCounts = new Map<string, number>();
    // "jobName|storeNumber|purchaser" → { actualProjectId → count } for override learning
    const overrideTargets = new Map<string, Map<string, number>>();

    for (const fb of allFeedback) {
      const jobKey = `${(fb.jobNameNormalized ?? "").toLowerCase()}|${fb.prescreenProjectId ?? ""}`;
      const storeKey = `${fb.storeNumber ?? ""}|${fb.prescreenProjectId ?? ""}`;

      if (fb.feedbackType === "ACCEPTED") {
        acceptCounts.set(jobKey, (acceptCounts.get(jobKey) ?? 0) + 1);
      } else if (fb.feedbackType === "REJECTED") {
        rejectCounts.set(jobKey, (rejectCounts.get(jobKey) ?? 0) + 1);
        if (fb.storeNumber) {
          storeRejectCounts.set(storeKey, (storeRejectCounts.get(storeKey) ?? 0) + 1);
        }
      } else if (fb.feedbackType === "OVERRIDDEN" && fb.actualProjectId) {
        // Learn the corrected mapping for similar attributes
        const attrKey = [
          (fb.jobNameNormalized ?? "").toLowerCase(),
          fb.storeNumber ?? "",
          (fb.purchaser ?? "").toLowerCase(),
        ].join("|");
        if (!overrideTargets.has(attrKey)) overrideTargets.set(attrKey, new Map());
        const projMap = overrideTargets.get(attrKey)!;
        projMap.set(fb.actualProjectId, (projMap.get(fb.actualProjectId) ?? 0) + 1);
      }
    }

    return { acceptCounts, rejectCounts, storeRejectCounts, overrideTargets };
  }

  /** Apply acceptance boosts and rejection penalties to a candidate's confidence */
  private applyFeedbackAdjustments(
    conf: number,
    jobName: string,
    projectId: string,
    storeNumber: string | null | undefined,
    purchaser: string | null | undefined,
    feedback: Awaited<ReturnType<PrescreenService["computeFeedbackMaps"]>>,
  ): number {
    const jobKey = `${jobName.toLowerCase()}|${projectId}`;

    // Acceptance boost: more prior accepts → higher confidence
    const accepts = feedback.acceptCounts.get(jobKey) ?? 0;
    if (accepts > 0) {
      conf += Math.min(accepts * ACCEPT_BOOST_PER, ACCEPT_BOOST_MAX);
    }

    // Rejection penalty: more prior rejections → lower confidence (scaled)
    const rejects = feedback.rejectCounts.get(jobKey) ?? 0;
    if (rejects > 0) {
      conf -= Math.min(rejects * REJECT_PENALTY_PER, REJECT_PENALTY_MAX);
    }

    // Store-level rejection penalty (lighter weight)
    if (storeNumber) {
      const storeKey = `${storeNumber}|${projectId}`;
      const storeRejects = feedback.storeRejectCounts.get(storeKey) ?? 0;
      if (storeRejects > 0) {
        conf -= Math.min(storeRejects * 0.08, 0.25);
      }
    }

    // Clamp
    return Math.max(conf, 0.05);
  }

  // ─── Historical data computation helpers ──────────────────────────

  /** Store → { projectId → percentage } based on historical assigned transactions */
  private async computeStoreAffinity(
    companyId: string,
  ): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.importedTransaction.groupBy({
      by: ["storeNumber", "projectId"],
      where: {
        companyId,
        source: CsvImportSource.HD_PRO_XTRA,
        storeNumber: { not: null },
        projectId: { not: null },
      },
      _count: { id: true },
    });

    // Compute totals per store
    const storeTotals = new Map<string, number>();
    for (const r of rows) {
      if (!r.storeNumber) continue;
      storeTotals.set(r.storeNumber, (storeTotals.get(r.storeNumber) ?? 0) + r._count.id);
    }

    const result = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!r.storeNumber || !r.projectId) continue;
      const total = storeTotals.get(r.storeNumber) ?? 1;
      if (!result.has(r.storeNumber)) result.set(r.storeNumber, new Map());
      result.get(r.storeNumber)!.set(r.projectId, r._count.id / total);
    }

    return result;
  }

  /** Purchaser+Store → { projectId → percentage } */
  private async computePurchaserStoreAffinity(
    companyId: string,
  ): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.importedTransaction.groupBy({
      by: ["purchaser", "storeNumber", "projectId"],
      where: {
        companyId,
        source: CsvImportSource.HD_PRO_XTRA,
        purchaser: { not: null },
        storeNumber: { not: null },
        projectId: { not: null },
      },
      _count: { id: true },
    });

    const comboTotals = new Map<string, number>();
    for (const r of rows) {
      if (!r.purchaser || !r.storeNumber) continue;
      const key = `${r.purchaser.toLowerCase()}|${r.storeNumber}`;
      comboTotals.set(key, (comboTotals.get(key) ?? 0) + r._count.id);
    }

    const result = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!r.purchaser || !r.storeNumber || !r.projectId) continue;
      const key = `${r.purchaser.toLowerCase()}|${r.storeNumber}`;
      const total = comboTotals.get(key) ?? 1;
      if (!result.has(key)) result.set(key, new Map());
      result.get(key)!.set(r.projectId, r._count.id / total);
    }

    return result;
  }

  /** Merchant+DescriptionPrefix → { projectId → count } */
  private async computeDescriptionPatterns(
    companyId: string,
  ): Promise<Map<string, Map<string, number>>> {
    // Get recent assigned transactions (limit to last 5000 for performance)
    const rows = await this.prisma.importedTransaction.findMany({
      where: {
        companyId,
        projectId: { not: null },
        merchant: { not: null },
      },
      select: {
        merchant: true,
        description: true,
        projectId: true,
      },
      orderBy: { date: "desc" },
      take: 5000,
    });

    const result = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!r.merchant || !r.description || !r.projectId) continue;
      const key = `${r.merchant.toLowerCase()}|${r.description.toLowerCase().slice(0, 40)}`;
      if (!result.has(key)) result.set(key, new Map());
      const projMap = result.get(key)!;
      projMap.set(r.projectId, (projMap.get(r.projectId) ?? 0) + 1);
    }

    return result;
  }
}
