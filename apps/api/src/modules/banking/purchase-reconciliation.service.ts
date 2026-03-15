import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  ReconciliationStatus,
  ExpenseClassification,
  CcPaymentLinkStatus,
  DispositionType,
  PmReviewStatus,
  PmReviewTransactionType,
  CsvImportSource,
  TransactionDisposition,
} from "@prisma/client";
import { ProductIntelligenceService } from "../procurement/product-intelligence.service";

// ---------------------------------------------------------------------------
// Merchant classification keyword sets
// ---------------------------------------------------------------------------

const RESTAURANT_KEYWORDS = [
  "mcdonald",
  "chick-fil-a",
  "starbucks",
  "whataburger",
  "subway",
  "wendy",
  "taco bell",
  "burger king",
  "chipotle",
  "panera",
  "chili's",
  "applebee",
  "olive garden",
  "ihop",
  "denny",
  "waffle house",
  "panda express",
  "domino",
  "pizza hut",
  "papa john",
  "five guys",
  "popeye",
  "sonic drive",
  "arby",
  "jimmy john",
  "jason's deli",
  "cane's",
  "zaxby",
  "wingstop",
  "buffalo wild",
  "cracker barrel",
  "red lobster",
  "outback",
  "longhorn",
  "texas roadhouse",
  "ruth's chris",
  "torchy",
  "in-n-out",
  "raising cane",
  "doordash",
  "uber eats",
  "grubhub",
  "restaurant",
  "cafe",
  "bistro",
  "grill",
  "pizzeria",
  "sushi",
  "diner",
  "eatery",
  "bakery",
  "brewhouse",
  "bar & grill",
];

const MATERIAL_KEYWORDS = [
  "home depot",
  "lowe's",
  "lowes",
  "menard",
  "ace hardware",
  "true value",
  "84 lumber",
  "lumber",
  "abc supply",
  "beacon roofing",
  "srs distribution",
  "builders firstsource",
  "bmc",
  "us lbm",
  "sherwin-williams",
  "benjamin moore",
  "ppg",
  "floor & decor",
  "floor and decor",
  "fastenal",
  "grainger",
  "hd supply",
  "ferguson",
  "platt",
];

const FUEL_KEYWORDS = [
  "shell",
  "chevron",
  "exxon",
  "mobil",
  "bp ",
  "circle k",
  "racetrac",
  "buc-ee",
  "loves travel",
  "pilot ",
  "flying j",
  "marathon",
  "valero",
  "murphy usa",
  "wawa",
  "qt ",
  "quiktrip",
  "speedway",
  "gas station",
  "fuel",
  "petroleum",
  "conoco",
  "phillips 66",
  "sunoco",
  "casey's",
  "kwik trip",
  "7-eleven",
];

const TOOL_KEYWORDS = [
  "harbor freight",
  "northern tool",
  "tractor supply",
  "snap-on",
  "matco",
  "dewalt",
  "milwaukee tool",
  "hilti",
  "tool rental",
  "sunbelt rental",
  "united rentals",
  "herc rental",
  "cat rental",
  "pep boys",
  "autozone",
  "o'reilly",
  "napa auto",
];

// CC payment merchant patterns (checking account outflows to CC companies)
const CC_PAYMENT_PATTERNS = [
  "apple card",
  "apple cash",
  "goldman sachs",
  "chase card",
  "chase credit",
  "jpmorgan chase",
  "capital one",
  "amex",
  "american express",
  "discover card",
  "citi card",
  "bank of america",
  "barclaycard",
  "synchrony",
  "credit card payment",
  "card payment",
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PurchaseReconciliationService {
  private readonly logger = new Logger(PurchaseReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productIntelligence: ProductIntelligenceService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════
  // Auto-classification
  // ═══════════════════════════════════════════════════════════════════

  async classifyTransactions(companyId: string) {
    const unclassified = await this.prisma.importedTransaction.findMany({
      where: { companyId, expenseClassification: ExpenseClassification.UNCLASSIFIED },
      select: {
        id: true,
        merchant: true,
        description: true,
        cardCategory: true,
        source: true,
        category: true,
      },
    });

    let classified = 0;
    const results: Array<{ id: string; classification: ExpenseClassification; confidence: number }> = [];

    for (const txn of unclassified) {
      const { classification, confidence } = this.inferClassification(txn);
      if (classification !== ExpenseClassification.UNCLASSIFIED && confidence >= 0.8) {
        results.push({ id: txn.id, classification, confidence });
      }
    }

    // Batch update in chunks
    const CHUNK = 200;
    for (let i = 0; i < results.length; i += CHUNK) {
      const chunk = results.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map((r) =>
          this.prisma.importedTransaction.update({
            where: { id: r.id },
            data: { expenseClassification: r.classification },
          }),
        ),
      );
      classified += chunk.length;
    }

    this.logger.log(
      `Classified ${classified} of ${unclassified.length} unclassified transactions for company ${companyId}`,
    );

    return {
      total: unclassified.length,
      classified,
      skipped: unclassified.length - classified,
    };
  }

  private inferClassification(txn: {
    merchant: string | null;
    description: string;
    cardCategory: string | null;
    source: CsvImportSource;
    category: string | null;
  }): { classification: ExpenseClassification; confidence: number } {
    const text = [txn.merchant, txn.description, txn.cardCategory, txn.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // HD Pro Xtra source → always PROJECT_MATERIAL
    if (txn.source === CsvImportSource.HD_PRO_XTRA) {
      return { classification: ExpenseClassification.PROJECT_MATERIAL, confidence: 0.95 };
    }

    // Check fuel first (specific merchant names)
    if (FUEL_KEYWORDS.some((kw) => text.includes(kw))) {
      return { classification: ExpenseClassification.FUEL, confidence: 0.85 };
    }

    // Tool/equipment vendors
    if (TOOL_KEYWORDS.some((kw) => text.includes(kw))) {
      return { classification: ExpenseClassification.TOOL_EQUIPMENT, confidence: 0.85 };
    }

    // Material suppliers
    if (MATERIAL_KEYWORDS.some((kw) => text.includes(kw))) {
      return { classification: ExpenseClassification.PROJECT_MATERIAL, confidence: 0.90 };
    }

    // Restaurants / food → ENTERTAINMENT
    if (RESTAURANT_KEYWORDS.some((kw) => text.includes(kw))) {
      return { classification: ExpenseClassification.ENTERTAINMENT, confidence: 0.85 };
    }

    // Plaid category signals (Apple Card's cardCategory or Plaid detailedCategory)
    if (txn.cardCategory) {
      const cat = txn.cardCategory.toLowerCase();
      if (cat.includes("food") || cat.includes("restaurant") || cat.includes("dining")) {
        return { classification: ExpenseClassification.ENTERTAINMENT, confidence: 0.80 };
      }
      if (cat.includes("gas") || cat.includes("fuel") || cat.includes("petrol")) {
        return { classification: ExpenseClassification.FUEL, confidence: 0.85 };
      }
      if (cat.includes("home improvement") || cat.includes("hardware") || cat.includes("building")) {
        return { classification: ExpenseClassification.PROJECT_MATERIAL, confidence: 0.80 };
      }
    }

    return { classification: ExpenseClassification.UNCLASSIFIED, confidence: 0 };
  }

  /**
   * Manually reclassify a single transaction.
   */
  async manualClassify(
    companyId: string,
    transactionId: string,
    classification: ExpenseClassification,
  ) {
    const txn = await this.prisma.importedTransaction.findFirst({
      where: { id: transactionId, companyId },
    });
    if (!txn) throw new BadRequestException("Transaction not found.");

    await this.prisma.importedTransaction.update({
      where: { id: transactionId },
      data: { expenseClassification: classification },
    });

    return { ok: true, id: transactionId, classification };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CC-to-Checking matching
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Scan checking-account BankTransactions for CC payments and match them
   * to ImportedTransactions (Apple Card / Chase CC charges).
   */
  async suggestCreditCardCheckingLinks(companyId: string) {
    // 1. Find checking outflows that look like CC payments
    const ccPayments = await this.prisma.bankTransaction.findMany({
      where: {
        companyId,
        amount: { gt: 0 }, // positive = money out in our schema
        OR: CC_PAYMENT_PATTERNS.map((pattern) => ({
          OR: [
            { name: { contains: pattern, mode: "insensitive" as const } },
            { merchantName: { contains: pattern, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: { date: "asc" },
    });

    if (ccPayments.length === 0) {
      return { suggestions: [], summary: { count: 0, totalAmount: 0 } };
    }

    // 2. Already-linked CC txn IDs (avoid re-suggesting)
    const existingLinks = await this.prisma.creditCardPaymentLink.findMany({
      where: { companyId },
      select: { creditCardTxnId: true, checkingTxnId: true },
    });
    const linkedCcIds = new Set(existingLinks.map((l) => l.creditCardTxnId));
    const linkedCheckingIds = new Set(existingLinks.map((l) => l.checkingTxnId));

    // 3. For each CC payment, find unlinked CC charges in the surrounding window
    type Suggestion = {
      checkingTxn: {
        id: string;
        date: string;
        name: string;
        merchantName: string | null;
        amount: number;
      };
      ccCharges: Array<{
        id: string;
        date: string;
        description: string;
        merchant: string | null;
        amount: number;
        source: string;
      }>;
      totalCcAmount: number;
      paymentAmount: number;
      variance: number;
      confidence: number;
    };

    const suggestions: Suggestion[] = [];

    for (const payment of ccPayments) {
      if (linkedCheckingIds.has(payment.id)) continue;

      // Look for CC charges in a 35-day window before the payment date
      // (typical statement cycle is 28–31 days)
      const windowStart = new Date(payment.date);
      windowStart.setDate(windowStart.getDate() - 35);

      const ccCharges = await this.prisma.importedTransaction.findMany({
        where: {
          companyId,
          source: { in: [CsvImportSource.APPLE_CARD, CsvImportSource.CHASE_BANK] },
          id: { notIn: Array.from(linkedCcIds) },
          date: { gte: windowStart, lte: payment.date },
          amount: { gt: 0 },
        },
        orderBy: { date: "asc" },
      });

      if (ccCharges.length === 0) continue;

      // FIFO: accumulate charges until we hit the payment amount
      let runningTotal = 0;
      const matched: typeof ccCharges = [];
      for (const charge of ccCharges) {
        if (runningTotal >= payment.amount) break;
        matched.push(charge);
        runningTotal += charge.amount;
        linkedCcIds.add(charge.id); // prevent double-matching
      }

      const variance = Math.abs(runningTotal - payment.amount);
      const variancePct = payment.amount > 0 ? variance / payment.amount : 1;
      const confidence = variancePct < 0.01 ? 0.95 : variancePct < 0.05 ? 0.80 : variancePct < 0.15 ? 0.60 : 0.30;

      suggestions.push({
        checkingTxn: {
          id: payment.id,
          date: payment.date.toISOString().slice(0, 10),
          name: payment.name,
          merchantName: payment.merchantName,
          amount: payment.amount,
        },
        ccCharges: matched.map((c) => ({
          id: c.id,
          date: c.date.toISOString().slice(0, 10),
          description: c.description,
          merchant: c.merchant,
          amount: c.amount,
          source: c.source,
        })),
        totalCcAmount: Math.round(runningTotal * 100) / 100,
        paymentAmount: payment.amount,
        variance: Math.round(variance * 100) / 100,
        confidence,
      });
    }

    return {
      suggestions,
      summary: {
        count: suggestions.length,
        totalAmount: suggestions.reduce((s, sg) => s + sg.paymentAmount, 0),
      },
    };
  }

  /**
   * Confirm a CC-to-checking link: creates CreditCardPaymentLink records
   * and updates reconciliation status on the CC transactions.
   */
  async linkCreditCardToChecking(
    companyId: string,
    checkingTxnId: string,
    creditCardTxnIds: string[],
    userId: string,
  ) {
    // Verify checking txn belongs to company
    const checkingTxn = await this.prisma.bankTransaction.findFirst({
      where: { id: checkingTxnId, companyId },
    });
    if (!checkingTxn) throw new BadRequestException("Checking transaction not found.");

    // Verify all CC txns
    const ccTxns = await this.prisma.importedTransaction.findMany({
      where: { id: { in: creditCardTxnIds }, companyId },
    });
    if (ccTxns.length !== creditCardTxnIds.length) {
      throw new BadRequestException("One or more credit card transactions not found.");
    }

    const now = new Date();

    // Upsert CreditCardPaymentLink records
    await Promise.all(
      creditCardTxnIds.map((ccTxnId) =>
        this.prisma.creditCardPaymentLink.upsert({
          where: {
            CreditCardPaymentLink_company_ccTxn_key: {
              companyId,
              creditCardTxnId: ccTxnId,
            },
          },
          create: {
            companyId,
            checkingTxnId,
            creditCardTxnId: ccTxnId,
            status: CcPaymentLinkStatus.LINKED,
            confidence: 1.0,
            linkedByUserId: userId,
            linkedAt: now,
          },
          update: {
            checkingTxnId,
            status: CcPaymentLinkStatus.LINKED,
            confidence: 1.0,
            linkedByUserId: userId,
            linkedAt: now,
          },
        }),
      ),
    );

    // Update reconciliation status on CC transactions
    await this.prisma.importedTransaction.updateMany({
      where: { id: { in: creditCardTxnIds } },
      data: { reconciliationStatus: ReconciliationStatus.LINKED },
    });

    // NexPRINT: upgrade fingerprint confidence for bank-confirmed CC transactions (fire-and-forget)
    this.productIntelligence
      .confirmByImportedTransactions(companyId, creditCardTxnIds, checkingTxnId, checkingTxn.date)
      .catch((err: any) => {
        this.logger.warn(`NexPRINT bank confirmation failed (non-fatal): ${err.message}`);
      });

    return { ok: true, linked: creditCardTxnIds.length };
  }

  /**
   * Remove a CC-to-checking link.
   */
  async unlinkCreditCardFromChecking(companyId: string, creditCardTxnId: string) {
    const link = await this.prisma.creditCardPaymentLink.findUnique({
      where: {
        CreditCardPaymentLink_company_ccTxn_key: {
          companyId,
          creditCardTxnId,
        },
      },
    });
    if (!link) throw new BadRequestException("Link not found.");

    await this.prisma.creditCardPaymentLink.delete({ where: { id: link.id } });
    await this.prisma.importedTransaction.update({
      where: { id: creditCardTxnId },
      data: { reconciliationStatus: ReconciliationStatus.UNLINKED },
    });

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Receipt line disposition
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Disposition a single receipt line item: KEEP_ON_JOB, CREDIT_PERSONAL,
   * or MOVE_TO_PROJECT.
   */
  async dispositionLineItem(params: {
    companyId: string;
    dailyLogId: string;
    ocrResultId: string;
    lineItemIndex: number;
    description?: string;
    amount?: number;
    dispositionType: DispositionType;
    targetProjectId?: string;
    creditReason?: string;
    userId: string;
  }) {
    const {
      companyId,
      dailyLogId,
      ocrResultId,
      lineItemIndex,
      description,
      amount,
      dispositionType,
      targetProjectId,
      creditReason,
      userId,
    } = params;

    // Validate daily log
    const log = await this.prisma.dailyLog.findFirst({
      where: { id: dailyLogId },
      select: { id: true, projectId: true },
    });
    if (!log) throw new BadRequestException("Daily log not found.");

    // MOVE requires a target project
    if (dispositionType === DispositionType.MOVE_TO_PROJECT && !targetProjectId) {
      throw new BadRequestException("targetProjectId is required for MOVE_TO_PROJECT disposition.");
    }

    // Upsert disposition (one per ocrResult + lineItemIndex)
    const disposition = await this.prisma.receiptLineDisposition.upsert({
      where: {
        ReceiptLineDisposition_ocr_lineItem_key: {
          ocrResultId,
          lineItemIndex,
        },
      },
      create: {
        companyId,
        dailyLogId,
        ocrResultId,
        lineItemIndex,
        description,
        amount,
        sourceProjectId: log.projectId,
        dispositionType,
        targetProjectId: targetProjectId ?? null,
        creditReason: creditReason ?? null,
        dispositionedByUserId: userId,
      },
      update: {
        dispositionType,
        targetProjectId: targetProjectId ?? null,
        creditReason: creditReason ?? null,
        dispositionedByUserId: userId,
        dispositionedAt: new Date(),
      },
    });

    // If MOVE_TO_PROJECT → create a PM review item for the target project's PM
    if (dispositionType === DispositionType.MOVE_TO_PROJECT && targetProjectId) {
      await this.createPmReviewForTransaction({
        companyId,
        projectId: targetProjectId,
        transactionType: PmReviewTransactionType.RECEIPT_LINE,
        transactionId: disposition.id,
        suggestedAmount: amount ?? null,
        suggestedProjectId: targetProjectId,
      });
    }

    // If CREDIT_PERSONAL → update the daily log creditAmount
    if (dispositionType === DispositionType.CREDIT_PERSONAL && amount) {
      const existing = await this.prisma.dailyLog.findUnique({
        where: { id: dailyLogId },
        select: { creditAmount: true },
      });
      const currentCredit = existing?.creditAmount ? Number(existing.creditAmount) : 0;
      await this.prisma.dailyLog.update({
        where: { id: dailyLogId },
        data: { creditAmount: currentCredit + amount },
      });
    }

    return disposition;
  }

  /**
   * Get all dispositions for a specific daily log.
   */
  async getDispositionsForDailyLog(companyId: string, dailyLogId: string) {
    return this.prisma.receiptLineDisposition.findMany({
      where: { companyId, dailyLogId },
      orderBy: { lineItemIndex: "asc" },
      include: {
        sourceProject: { select: { id: true, name: true } },
        targetProject: { select: { id: true, name: true } },
        dispositionedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // PM Review Queue
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get PM review queue — filterable by project or assignee.
   */
  async getPmReviewQueue(
    companyId: string,
    filters?: { projectId?: string; userId?: string; status?: PmReviewStatus },
  ) {
    const where: any = { companyId };
    if (filters?.projectId) where.projectId = filters.projectId;
    if (filters?.userId) where.assignedToUserId = filters.userId;
    if (filters?.status) where.status = filters.status;
    else where.status = PmReviewStatus.PENDING;

    return this.prisma.pmReviewItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Submit a PM review decision: APPROVED, REJECTED, or MODIFIED.
   */
  async submitPmReview(
    companyId: string,
    reviewId: string,
    decision: {
      status: PmReviewStatus;
      note?: string;
      reassignProjectId?: string;
    },
    userId: string,
  ) {
    const item = await this.prisma.pmReviewItem.findFirst({
      where: { id: reviewId, companyId },
    });
    if (!item) throw new BadRequestException("Review item not found.");
    if (item.status !== PmReviewStatus.PENDING) {
      throw new BadRequestException("Review item is not pending.");
    }

    const now = new Date();

    // Update the review item
    const updated = await this.prisma.pmReviewItem.update({
      where: { id: reviewId },
      data: {
        status: decision.status,
        reviewNote: decision.note ?? null,
        reviewedAt: now,
        reviewedByUserId: userId,
      },
    });

    // Side effects based on decision
    if (decision.status === PmReviewStatus.APPROVED) {
      // Set reconciliation status to CONFIRMED + disposition to ASSIGNED
      if (item.transactionType === PmReviewTransactionType.IMPORTED) {
        await this.prisma.importedTransaction.update({
          where: { id: item.transactionId },
          data: {
            reconciliationStatus: ReconciliationStatus.CONFIRMED,
            disposition: TransactionDisposition.ASSIGNED,
          },
        });
      } else if (item.transactionType === PmReviewTransactionType.BANK) {
        await this.prisma.bankTransaction.update({
          where: { id: item.transactionId },
          data: { disposition: TransactionDisposition.ASSIGNED },
        });
      }
      // Log the disposition change
      await this.prisma.transactionDispositionLog.create({
        data: {
          companyId,
          transactionId: item.transactionId,
          transactionSource: item.transactionType === PmReviewTransactionType.BANK ? "PLAID" : "IMPORTED",
          previousDisposition: TransactionDisposition.PENDING_APPROVAL,
          newDisposition: TransactionDisposition.ASSIGNED,
          note: `PM approved assignment to project${decision.note ? `: ${decision.note}` : ""}`,
          userId,
          userName: "PM Review",
        },
      });
    } else if (decision.status === PmReviewStatus.REJECTED) {
      // Reset reconciliation status back to UNLINKED + disposition to UNREVIEWED
      if (item.transactionType === PmReviewTransactionType.IMPORTED) {
        await this.prisma.importedTransaction.update({
          where: { id: item.transactionId },
          data: {
            reconciliationStatus: ReconciliationStatus.UNLINKED,
            projectId: null,
            disposition: TransactionDisposition.UNREVIEWED,
          },
        });
      } else if (item.transactionType === PmReviewTransactionType.BANK) {
        await this.prisma.bankTransaction.update({
          where: { id: item.transactionId },
          data: {
            projectId: null,
            disposition: TransactionDisposition.UNREVIEWED,
          },
        });
      }
      // Log the disposition change
      await this.prisma.transactionDispositionLog.create({
        data: {
          companyId,
          transactionId: item.transactionId,
          transactionSource: item.transactionType === PmReviewTransactionType.BANK ? "PLAID" : "IMPORTED",
          previousDisposition: TransactionDisposition.PENDING_APPROVAL,
          newDisposition: TransactionDisposition.UNREVIEWED,
          note: `PM rejected assignment${decision.note ? `: ${decision.note}` : ""}`,
          userId,
          userName: "PM Review",
        },
      });
    } else if (decision.status === PmReviewStatus.MODIFIED && decision.reassignProjectId) {
      // Reassign to a different project → create new PM review item
      if (item.transactionType === PmReviewTransactionType.IMPORTED) {
        await this.prisma.importedTransaction.update({
          where: { id: item.transactionId },
          data: {
            projectId: decision.reassignProjectId,
            reconciliationStatus: ReconciliationStatus.PM_REVIEW,
          },
        });
        // Create a new review item for the target project PM
        await this.createPmReviewForTransaction({
          companyId,
          projectId: decision.reassignProjectId,
          transactionType: item.transactionType,
          transactionId: item.transactionId,
          suggestedAmount: item.suggestedAmount,
          suggestedProjectId: decision.reassignProjectId,
        });
      }
    }

    return updated;
  }

  /**
   * Push a transaction into the PM review queue for the target project's PM.
   */
  async createPmReviewForTransaction(params: {
    companyId: string;
    projectId: string;
    transactionType: PmReviewTransactionType;
    transactionId: string;
    suggestedAmount?: number | null;
    suggestedProjectId?: string | null;
  }) {
    // Find the project PM (OWNER or MANAGER role)
    const pm = await this.prisma.projectMembership.findFirst({
      where: {
        projectId: params.projectId,
        role: { in: ["OWNER", "MANAGER"] },
      },
      select: { userId: true },
      orderBy: { role: "asc" }, // OWNER first
    });

    if (!pm) {
      this.logger.warn(
        `No PM found for project ${params.projectId} — skipping review item creation`,
      );
      return null;
    }

    return this.prisma.pmReviewItem.create({
      data: {
        companyId: params.companyId,
        projectId: params.projectId,
        transactionType: params.transactionType,
        transactionId: params.transactionId,
        assignedToUserId: pm.userId,
        suggestedAmount: params.suggestedAmount ?? null,
        suggestedProjectId: params.suggestedProjectId ?? null,
      },
    });
  }
}
