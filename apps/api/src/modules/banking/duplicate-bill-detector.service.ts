import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { ProjectBill } from "@prisma/client";

// ---------------------------------------------------------------------------
// Duplicate detection thresholds — PERCENTAGE-BASED
//
// All amount tolerances scale with the bill size so a $300K/year shop
// and a $3M/year shop use the same logic without reconfiguration.
// ---------------------------------------------------------------------------

/**
 * Maximum percentage difference for a duplicate match (1% of bill amount).
 * Example: $50 receipt → $0.50 tolerance; $5,000 PO → $50 tolerance.
 */
const AMOUNT_TOLERANCE_PCT = 0.01;

/** Absolute floor so rounding on tiny amounts doesn't cause false negatives */
const AMOUNT_TOLERANCE_FLOOR = 0.50;

/** Maximum calendar-day difference for a match */
const DATE_TOLERANCE_DAYS = 3;

/**
 * Auto-verify threshold: if variance ≤ this percentage of the primary bill,
 * the sibling group is automatically verified without human review.
 * Above this → PENDING_VERIFICATION (flagged for accounting).
 */
const AUTO_VERIFY_PCT = 0.02; // ≤2% → auto-verify

// ---------------------------------------------------------------------------
// Vendor alias map — groups of names that represent the same merchant
// ---------------------------------------------------------------------------

const VENDOR_ALIAS_GROUPS: string[][] = [
  [
    "home depot",
    "hd",
    "the home depot",
    "homedepot",
    "home depot pro",
    "hd pro",
    "hd supply",
  ],
  ["lowe's", "lowes", "lowe", "lowes home improvement"],
  ["menards", "menard"],
  ["ace hardware", "ace"],
  ["sherwin-williams", "sherwin williams", "sw"],
  ["84 lumber", "eighty four lumber"],
  ["harbor freight", "harbor freight tools"],
  ["abc supply", "abc supply co"],
  ["beacon roofing", "beacon"],
  ["ferguson", "ferguson enterprises"],
  ["fastenal", "fastenal company"],
];

/**
 * Pre-computed map: normalized vendor token → canonical group index.
 * Used for O(1) lookup during fuzzy matching.
 */
const VENDOR_CANONICAL_MAP = new Map<string, number>();
for (let i = 0; i < VENDOR_ALIAS_GROUPS.length; i++) {
  for (const alias of VENDOR_ALIAS_GROUPS[i]) {
    VENDOR_CANONICAL_MAP.set(alias, i);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateMatch {
  billId: string;
  vendorName: string;
  amount: number;
  billDate: Date;
  confidence: number;
  reason: string;
  amountDiff: number;
  daysDiff: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DuplicateBillDetectorService {
  private readonly logger = new Logger(DuplicateBillDetectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════
  // Duplicate detection
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Search for existing bills on a project that likely represent the same
   * purchase as the incoming transaction.
   *
   * Matching criteria:
   *  - Same project
   *  - Vendor fuzzy match (alias groups + store-number stripping)
   *  - Amount within ±1% of bill amount (floor $0.50)
   *  - Date within ±3 calendar days
   */
  async findDuplicateBills(
    companyId: string,
    projectId: string,
    vendorName: string,
    amount: number,
    date: Date,
  ): Promise<DuplicateMatch[]> {
    // Widen the date window for the DB query, then refine in-memory
    const dateMin = new Date(date);
    dateMin.setDate(dateMin.getDate() - DATE_TOLERANCE_DAYS);
    const dateMax = new Date(date);
    dateMax.setDate(dateMax.getDate() + DATE_TOLERANCE_DAYS);

    const candidates = await this.prisma.projectBill.findMany({
      where: {
        companyId,
        projectId,
        billDate: { gte: dateMin, lte: dateMax },
        status: { in: ["TENTATIVE", "DRAFT", "POSTED"] },
      },
      select: {
        id: true,
        vendorName: true,
        totalAmount: true,
        billDate: true,
        billRole: true,
        siblingGroupId: true,
      },
    });

    const matches: DuplicateMatch[] = [];
    const incomingVendor = normalizeVendor(vendorName);

    for (const bill of candidates) {
      // Skip bills that are already VERIFICATION (already reconciled)
      if (bill.billRole === "VERIFICATION") continue;

      // Vendor match
      if (!vendorsMatch(incomingVendor, normalizeVendor(bill.vendorName))) {
        continue;
      }

      // Amount match — percentage-based with absolute floor
      const amountDiff = Math.abs(amount - bill.totalAmount);
      const refAmount = Math.max(amount, bill.totalAmount, 1); // avoid /0
      const amountTolerance = Math.max(
        refAmount * AMOUNT_TOLERANCE_PCT,
        AMOUNT_TOLERANCE_FLOOR,
      );
      if (amountDiff > amountTolerance) continue;

      const pctDiff = amountDiff / refAmount; // 0.0–1.0

      // Date match (already filtered by DB, but compute exact days)
      const daysDiff = Math.abs(
        Math.round(
          (date.getTime() - bill.billDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );

      // Compute confidence — percentage-based tiers
      let confidence = 0.5;

      // Amount precision bonus (percentage of bill, not absolute dollars)
      if (pctDiff < 0.001) confidence += 0.30;      // < 0.1% variance
      else if (pctDiff < 0.005) confidence += 0.20;  // < 0.5%
      else if (pctDiff < 0.01) confidence += 0.10;   // < 1%

      // Date proximity bonus
      if (daysDiff === 0) confidence += 0.15;
      else if (daysDiff === 1) confidence += 0.10;
      else if (daysDiff <= 3) confidence += 0.05;

      confidence = Math.min(confidence, 0.98);

      const reason = [
        `Vendor: "${vendorName}" ↔ "${bill.vendorName}"`,
        `Amount: $${amount.toFixed(2)} vs $${bill.totalAmount.toFixed(2)} (Δ${(pctDiff * 100).toFixed(2)}%)`,
        `Date: ${daysDiff} day(s) apart`,
      ].join(", ");

      matches.push({
        billId: bill.id,
        vendorName: bill.vendorName,
        amount: bill.totalAmount,
        billDate: bill.billDate,
        confidence,
        reason,
        amountDiff,
        daysDiff,
      });
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Sibling group creation
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a sibling group linking a PRIMARY bill and a new VERIFICATION bill.
   * Adds a DUPLICATE_OFFSET line item to the verification bill so it nets to $0.
   */
  async createSiblingGroup(
    companyId: string,
    projectId: string,
    primaryBillId: string,
    verificationBillId: string,
    confidence: number,
    reason: string,
  ): Promise<string> {
    // Load both bills to compute variance
    const [primaryBill, verificationBill] = await Promise.all([
      this.prisma.projectBill.findUniqueOrThrow({ where: { id: primaryBillId } }),
      this.prisma.projectBill.findUniqueOrThrow({ where: { id: verificationBillId } }),
    ]);

    const amountVariance = Math.abs(
      primaryBill.totalAmount - verificationBill.totalAmount,
    );

    // Determine if this auto-verifies or needs review
    // Pure percentage-based: a $300K firm and a $3M firm use the same 2% gate
    const refAmount = Math.max(primaryBill.totalAmount, 1);
    const pctVariance = amountVariance / refAmount;
    const autoVerify = pctVariance <= AUTO_VERIFY_PCT;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the sibling group
      const group = await tx.billSiblingGroup.create({
        data: {
          companyId,
          projectId,
          primaryBillId,
          matchConfidence: confidence,
          matchReason: reason,
          verificationStatus: autoVerify
            ? "VERIFIED"
            : "PENDING_VERIFICATION",
          amountVariance,
        },
      });

      // 2. Link primary bill to the group
      await tx.projectBill.update({
        where: { id: primaryBillId },
        data: {
          siblingGroupId: group.id,
          billRole: "PRIMARY",
        },
      });

      // 3. Link verification bill + set role
      await tx.projectBill.update({
        where: { id: verificationBillId },
        data: {
          siblingGroupId: group.id,
          billRole: "VERIFICATION",
        },
      });

      // 4. Add DUPLICATE_OFFSET line item to zero out the verification bill
      await tx.projectBillLineItem.create({
        data: {
          billId: verificationBillId,
          kind: "DUPLICATE_OFFSET",
          description: `Verification offset — corroborated by receipt [Bill ${primaryBillId.slice(-8)}]`,
          amount: -verificationBill.totalAmount,
          amountSource: "MANUAL",
        },
      });

      this.logger.log(
        `Created sibling group ${group.id}: primary=${primaryBillId}, verification=${verificationBillId}, ` +
          `variance=$${amountVariance.toFixed(2)}, status=${group.verificationStatus}`,
      );

      return group.id;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Convert an existing bill to VERIFICATION (in-place)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Convert a standalone bill to VERIFICATION role and add an offset line item.
   * Used when a richer source (OCR receipt) arrives after a CC-created bill.
   */
  async convertToVerification(billId: string): Promise<void> {
    const bill = await this.prisma.projectBill.findUniqueOrThrow({
      where: { id: billId },
    });

    // Don't double-convert
    if (bill.billRole === "VERIFICATION") return;

    await this.prisma.$transaction(async (tx) => {
      // Set role
      await tx.projectBill.update({
        where: { id: billId },
        data: { billRole: "VERIFICATION" },
      });

      // Check if offset already exists
      const existingOffset = await tx.projectBillLineItem.findFirst({
        where: { billId, kind: "DUPLICATE_OFFSET" },
      });

      if (!existingOffset) {
        await tx.projectBillLineItem.create({
          data: {
            billId,
            kind: "DUPLICATE_OFFSET",
            description: "Verification offset — duplicate detected",
            amount: -bill.totalAmount,
            amountSource: "MANUAL",
          },
        });
      }
    });

    this.logger.log(`Converted bill ${billId} to VERIFICATION with offset`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Retroactive swap — OCR receipt arrives after CC tentative bill
  // ═══════════════════════════════════════════════════════════════════

  /**
   * When an OCR receipt (richer data) arrives and finds an existing
   * tentative/draft CC bill, this swaps roles:
   *  - The new OCR bill becomes PRIMARY
   *  - The existing CC bill becomes VERIFICATION (with offset)
   *  - Both are linked in a sibling group
   *
   * Returns the sibling group ID.
   */
  async retroactiveSwap(
    companyId: string,
    projectId: string,
    existingBillId: string,
    newPrimaryBillId: string,
    confidence: number,
    reason: string,
  ): Promise<string> {
    const existingBill = await this.prisma.projectBill.findUniqueOrThrow({
      where: { id: existingBillId },
    });

    // If the existing bill is already in a sibling group, join that group
    if (existingBill.siblingGroupId) {
      // Update the existing group's primary to the new bill
      await this.prisma.$transaction(async (tx) => {
        await tx.billSiblingGroup.update({
          where: { id: existingBill.siblingGroupId! },
          data: { primaryBillId: newPrimaryBillId },
        });

        await tx.projectBill.update({
          where: { id: newPrimaryBillId },
          data: {
            siblingGroupId: existingBill.siblingGroupId,
            billRole: "PRIMARY",
          },
        });

        await this.convertToVerification(existingBillId);
      });

      return existingBill.siblingGroupId;
    }

    // Create new sibling group with the OCR bill as primary
    return this.createSiblingGroup(
      companyId,
      projectId,
      newPrimaryBillId,
      existingBillId,
      confidence,
      reason,
    );
  }
}

// ---------------------------------------------------------------------------
// Vendor normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a vendor name for comparison:
 *  - Lowercase
 *  - Strip store numbers (e.g., "#0604", "Store 6528")
 *  - Collapse whitespace
 *  - Trim
 */
function normalizeVendor(name: string): string {
  return name
    .toLowerCase()
    .replace(/#\d+/g, "")
    .replace(/\bstore\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if two normalized vendor names refer to the same merchant.
 * Uses the alias map for known merchants, falls back to substring matching.
 */
function vendorsMatch(a: string, b: string): boolean {
  if (a === b) return true;

  // Check alias groups
  const groupA = findVendorGroup(a);
  const groupB = findVendorGroup(b);

  if (groupA !== -1 && groupA === groupB) return true;

  // Substring match (e.g., "home depot" in "the home depot pro xtra")
  if (a.includes(b) || b.includes(a)) return true;

  return false;
}

/**
 * Find the canonical alias group index for a vendor name.
 * Tries exact match first, then checks if any alias is a substring.
 */
function findVendorGroup(vendor: string): number {
  // Exact match
  const exact = VENDOR_CANONICAL_MAP.get(vendor);
  if (exact !== undefined) return exact;

  // Substring match against known aliases
  for (const [alias, groupIdx] of VENDOR_CANONICAL_MAP.entries()) {
    if (vendor.includes(alias) || alias.includes(vendor)) {
      return groupIdx;
    }
  }

  return -1;
}
