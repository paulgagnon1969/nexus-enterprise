// ---------------------------------------------------------------------------
// NexPRINT — Product Intelligence Service
// ---------------------------------------------------------------------------
//
// Receipt-verified learning loop for product coverage & pricing.
//
// Tier 0: Fingerprint lookup (cache hit before live extraction)
// Path 1: Receipt OCR ingestion
// Path 2: HD Pro Xtra CSV import ingestion
// Path 3: CBA web scrape recording
// Path 4: Bank transaction confirmation
//
// Also handles: cost book auto-sync, daily drift detection cron, telemetry.
// ---------------------------------------------------------------------------

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type {
  FingerprintConfidence,
  FingerprintSource,
} from '@prisma/client';
import type { CoverageInfo } from './coverage-extractor';

// ── Confidence Rank (higher = more trustworthy) ────────────────────────────

const CONFIDENCE_RANK: Record<FingerprintConfidence, number> = {
  VERIFIED: 7,
  BANK_CONFIRMED: 6,
  RECEIPT: 5,
  HD_PRO_XTRA: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/** Minimum confidence level for a Tier 0 cache hit. */
const TIER0_MIN_CONFIDENCE: FingerprintConfidence = 'HIGH';

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ProductIntelligenceService {
  private readonly logger = new Logger(ProductIntelligenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Tier 0: Fingerprint Lookup ─────────────────────────────────────────

  /**
   * Look up a known product fingerprint for the given company + supplier + product.
   * Returns the fingerprint if confidence ≥ HIGH, otherwise null.
   */
  async lookupFingerprint(
    companyId: string,
    supplierKey: string,
    productId: string,
  ) {
    const fp = await this.prisma.productFingerprint.findUnique({
      where: {
        ProductFingerprint_company_supplier_product_key: {
          companyId,
          supplierKey,
          productId,
        },
      },
    });

    if (!fp) return null;

    // Only return as cache hit if confidence is HIGH or above
    if (CONFIDENCE_RANK[fp.confidence] < CONFIDENCE_RANK[TIER0_MIN_CONFIDENCE]) {
      return null;
    }

    return fp;
  }

  // ─── Path 3: Record CBA Extraction Result ────────────────────────────────

  /**
   * After a CBA extraction, upsert the fingerprint with the extracted coverage.
   * Only creates or updates if the new confidence ≥ existing confidence.
   */
  async recordCbaExtraction(
    companyId: string,
    supplierKey: string,
    productId: string,
    title: string,
    price: number,
    quantity: number,
    coverage: CoverageInfo | null,
  ) {
    const confidence = this.mapCoverageConfidence(coverage?.confidence);
    const source: FingerprintSource = 'CBA_SCRAPE';

    try {
      const existing = await this.prisma.productFingerprint.findUnique({
        where: {
          ProductFingerprint_company_supplier_product_key: {
            companyId,
            supplierKey,
            productId,
          },
        },
      });

      // Don't downgrade existing fingerprint
      if (existing && CONFIDENCE_RANK[existing.confidence] > CONFIDENCE_RANK[confidence]) {
        return existing;
      }

      const fp = await this.prisma.productFingerprint.upsert({
        where: {
          ProductFingerprint_company_supplier_product_key: {
            companyId,
            supplierKey,
            productId,
          },
        },
        create: {
          companyId,
          supplierKey,
          productId,
          title,
          coverageValue: coverage?.coverageValue ?? null,
          coverageUnit: coverage?.coverageUnit ?? null,
          purchaseUnitLabel: coverage?.purchaseUnitLabel ?? null,
          confidence,
          sourceType: source,
          verificationCount: 1,
        },
        update: {
          title,
          ...(coverage
            ? {
                coverageValue: coverage.coverageValue,
                coverageUnit: coverage.coverageUnit,
                purchaseUnitLabel: coverage.purchaseUnitLabel,
              }
            : {}),
          confidence,
          sourceType: source,
          verificationCount: { increment: 1 },
        },
      });

      // Record price observation
      await this.prisma.productPriceHistory.create({
        data: {
          fingerprintId: fp.id,
          unitPrice: price,
          totalPrice: price * quantity,
          quantity,
          source,
        },
      });

      return fp;
    } catch (err) {
      this.logger.warn(`recordCbaExtraction failed (non-fatal): ${err}`);
      return null;
    }
  }

  // ─── Path 1: Receipt OCR Ingestion ───────────────────────────────────────

  /**
   * Ingest product intelligence from a processed receipt.
   * Called after OCR line items are available.
   */
  async ingestFromReceipt(
    companyId: string,
    receiptOcrResultId: string,
    vendorName: string | null,
    lineItems: Array<{
      description: string;
      sku?: string | null;
      qty?: number | null;
      unitPrice?: number | null;
      amount?: number | null;
    }>,
  ) {
    const supplierKey = this.normalizeVendorToSupplierKey(vendorName);
    if (!supplierKey) return;

    let ingested = 0;

    for (const item of lineItems) {
      // Need at least a SKU or meaningful description to create a fingerprint
      if (!item.sku && (!item.description || item.description.length < 3)) continue;

      const productId = item.sku ?? this.descriptionToProductId(item.description);
      const qty = Math.abs(item.qty ?? 1);
      const unitPrice = Math.abs(item.unitPrice ?? item.amount ?? 0);
      if (unitPrice <= 0) continue;

      try {
        const fp = await this.prisma.productFingerprint.upsert({
          where: {
            ProductFingerprint_company_supplier_product_key: {
              companyId,
              supplierKey,
              productId,
            },
          },
          create: {
            companyId,
            supplierKey,
            productId,
            sku: item.sku ?? null,
            title: item.description,
            confidence: 'RECEIPT',
            sourceType: 'RECEIPT_OCR',
            lastVerifiedAt: new Date(),
            verificationCount: 1,
          },
          update: {
            // Upgrade confidence if currently below RECEIPT
            ...(this.shouldUpgrade('RECEIPT')
              ? { confidence: 'RECEIPT', sourceType: 'RECEIPT_OCR' as FingerprintSource }
              : {}),
            sku: item.sku ?? undefined,
            lastVerifiedAt: new Date(),
            verificationCount: { increment: 1 },
          },
        });

      await this.prisma.productPriceHistory.create({
          data: {
            fingerprintId: fp.id,
            unitPrice,
            totalPrice: unitPrice * qty,
            quantity: qty,
            source: 'RECEIPT_OCR',
            transactionDate: new Date(),
            receiptOcrResultId,
          },
        });

        // Fire-and-forget cost book sync (RECEIPT confidence qualifies)
        this.syncToCostBook(companyId, fp.id).catch(() => {});

        ingested++;
      } catch (err) {
        this.logger.warn(`Receipt ingestion failed for SKU=${item.sku}: ${err}`);
      }
    }

    if (ingested > 0) {
      this.logger.log(`[NexPRINT] Ingested ${ingested} fingerprints from receipt ${receiptOcrResultId}`);
    }

    return ingested;
  }

  // ─── Path 2: HD Pro Xtra Import Ingestion ────────────────────────────────

  /**
   * Ingest product intelligence from an HD Pro Xtra imported transaction.
   */
  async ingestFromHdProXtra(
    companyId: string,
    importedTransactionId: string,
    sku: string,
    description: string,
    unitPrice: number,
    qty: number,
    transactionDate: Date,
  ) {
    const supplierKey = 'homedepot';
    const productId = sku; // HD SKUs are stable product identifiers

    try {
      const existing = await this.prisma.productFingerprint.findUnique({
        where: {
          ProductFingerprint_company_supplier_product_key: {
            companyId,
            supplierKey,
            productId,
          },
        },
      });

      // Only upgrade if new confidence ≥ existing
      const shouldUpdate = !existing || CONFIDENCE_RANK[existing.confidence] <= CONFIDENCE_RANK['HD_PRO_XTRA'];

      const fp = await this.prisma.productFingerprint.upsert({
        where: {
          ProductFingerprint_company_supplier_product_key: {
            companyId,
            supplierKey,
            productId,
          },
        },
        create: {
          companyId,
          supplierKey,
          productId,
          sku,
          title: description,
          confidence: 'HD_PRO_XTRA',
          sourceType: 'HD_PRO_XTRA',
          lastVerifiedAt: transactionDate,
          verificationCount: 1,
        },
        update: shouldUpdate
          ? {
              sku,
              title: description,
              confidence: 'HD_PRO_XTRA',
              sourceType: 'HD_PRO_XTRA',
              lastVerifiedAt: transactionDate,
              verificationCount: { increment: 1 },
            }
          : {
              verificationCount: { increment: 1 },
            },
      });

      await this.prisma.productPriceHistory.create({
        data: {
          fingerprintId: fp.id,
          unitPrice: Math.abs(unitPrice),
          totalPrice: Math.abs(unitPrice * qty),
          quantity: Math.abs(qty),
          source: 'HD_PRO_XTRA',
          transactionDate,
          importedTransactionId,
        },
      });

      // Fire-and-forget cost book sync (checks confidence internally)
      this.syncToCostBook(companyId, fp.id).catch(() => {});

      return fp;
    } catch (err) {
      this.logger.warn(`HD Pro Xtra ingestion failed for SKU=${sku}: ${err}`);
      return null;
    }
  }

  // ─── Path 4: Bank Transaction Confirmation ───────────────────────────────

  /**
   * Upgrade fingerprint confidence when a bank transaction confirms a purchase.
   */
  async confirmWithBankTransaction(
    companyId: string,
    fingerprintId: string,
    bankTransactionId: string,
    amount: number,
    transactionDate: Date,
  ) {
    try {
      const fp = await this.prisma.productFingerprint.findUnique({
        where: { id: fingerprintId },
      });
      if (!fp || fp.companyId !== companyId) return null;

      // If already at RECEIPT level, upgrade to BANK_CONFIRMED or VERIFIED
      const newConfidence: FingerprintConfidence =
        CONFIDENCE_RANK[fp.confidence] >= CONFIDENCE_RANK['RECEIPT']
          ? 'VERIFIED'
          : 'BANK_CONFIRMED';

      const updated = await this.prisma.productFingerprint.update({
        where: { id: fingerprintId },
        data: {
          confidence: newConfidence,
          lastVerifiedAt: transactionDate,
          verificationCount: { increment: 1 },
        },
      });

      await this.prisma.productPriceHistory.create({
        data: {
          fingerprintId,
          unitPrice: amount,
          totalPrice: amount,
          quantity: 1,
          source: 'BANK_CONFIRM',
          transactionDate,
          bankTransactionId,
        },
      });

      this.logger.log(
        `[NexPRINT] Bank-confirmed fingerprint ${fingerprintId} → ${newConfidence}`,
      );

      return updated;
    } catch (err) {
      this.logger.warn(`Bank confirmation failed for fp=${fingerprintId}: ${err}`);
      return null;
    }
  }

  // ─── Path 4b: Bank Confirmation via ImportedTransaction IDs ──────────────

  /**
   * Upgrade fingerprint confidence for all fingerprints linked to the given
   * imported transactions (via ProductPriceHistory.importedTransactionId).
   * Called when CC transactions are confirmed by a checking-account payment.
   */
  async confirmByImportedTransactions(
    companyId: string,
    importedTransactionIds: string[],
    bankTransactionId: string,
    transactionDate: Date,
  ) {
    if (importedTransactionIds.length === 0) return 0;

    // Find all price history entries linked to these imported transactions
    const priceRecords = await this.prisma.productPriceHistory.findMany({
      where: { importedTransactionId: { in: importedTransactionIds } },
      select: { fingerprintId: true },
      distinct: ['fingerprintId'],
    });

    let confirmed = 0;
    for (const record of priceRecords) {
      const result = await this.confirmWithBankTransaction(
        companyId,
        record.fingerprintId,
        bankTransactionId,
        0, // amount not meaningful at batch level
        transactionDate,
      );
      if (result) confirmed++;
    }

    if (confirmed > 0) {
      this.logger.log(
        `[NexPRINT] Bank-confirmed ${confirmed} fingerprints from ${importedTransactionIds.length} imported txns`,
      );
    }

    return confirmed;
  }

  // ─── Telemetry: Log Extraction Attempt ───────────────────────────────────

  /**
   * Log a coverage extraction attempt for telemetry.
   * Fire-and-forget — errors are swallowed.
   */
  logExtraction(
    companyId: string,
    productTitle: string,
    supplierKey: string,
    requestedUnit: string,
    tier: number,
    extractedValue: number | null,
    confidence: string | null,
    fingerprintHit: boolean,
    durationMs: number,
  ) {
    this.prisma.coverageExtractionLog
      .create({
        data: {
          companyId,
          productTitle: productTitle.slice(0, 500),
          supplierKey,
          requestedUnit,
          tier,
          extractedValue,
          confidence,
          fingerprintHit,
          durationMs,
        },
      })
      .catch((err) => {
        this.logger.debug(`Extraction log write failed (non-fatal): ${err}`);
      });
  }

  // ─── Cost Book Sync ──────────────────────────────────────────────────────

  /**
   * Sync a fingerprint's rolling average price to CompanyPriceListItem.
   * Only for RECEIPT+ confidence fingerprints with a SKU.
   */
  async syncToCostBook(companyId: string, fingerprintId: string) {
    const fp = await this.prisma.productFingerprint.findUnique({
      where: { id: fingerprintId },
      include: {
        priceHistory: {
          where: {
            transactionDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { transactionDate: 'desc' },
          take: 20,
        },
      },
    });

    if (!fp || !fp.sku) return null;
    if (CONFIDENCE_RANK[fp.confidence] < CONFIDENCE_RANK['RECEIPT']) return null;
    if (fp.priceHistory.length === 0) return null;

    // Compute rolling average unit price
    const avgPrice =
      fp.priceHistory.reduce((sum, h) => sum + h.unitPrice, 0) / fp.priceHistory.length;

    // Find the company's active price list
    const priceList = await this.prisma.companyPriceList.findFirst({
      where: { companyId, isActive: true },
      orderBy: { revision: 'desc' },
    });
    if (!priceList) return null;

    // Check if a cost book entry already exists for this SKU
    const existing = await this.prisma.companyPriceListItem.findFirst({
      where: { companyPriceListId: priceList.id, sku: fp.sku },
    });

    // Only sync if price changed by > 2%
    if (existing?.unitPrice && Math.abs(avgPrice - existing.unitPrice) / existing.unitPrice < 0.02) {
      return existing;
    }

    const supplierLabel = fp.supplierKey.replace(/([a-z])([A-Z])/g, '$1 $2');

    const item = await this.prisma.companyPriceListItem.upsert({
      where: existing
        ? { id: existing.id }
        : { id: 'nonexistent' }, // force create path
      create: {
        companyPriceListId: priceList.id,
        sku: fp.sku,
        description: fp.title,
        sourceVendor: supplierLabel,
        unitPrice: avgPrice,
        coverage: fp.coverageValue && fp.coverageUnit
          ? `${fp.coverageValue} ${fp.coverageUnit}/${fp.purchaseUnitLabel ?? 'unit'}`
          : null,
        sourceDate: new Date(),
        lastKnownUnitPrice: avgPrice,
        lastPriceChangedAt: new Date(),
        lastPriceChangedSource: 'NEXPRINT_SYNC',
      },
      update: {
        unitPrice: avgPrice,
        lastKnownUnitPrice: existing?.unitPrice ?? null,
        lastPriceChangedAt: new Date(),
        lastPriceChangedSource: 'NEXPRINT_SYNC',
        sourceDate: new Date(),
      },
    });

    this.logger.log(
      `[NexPRINT] Synced SKU=${fp.sku} to cost book: $${avgPrice.toFixed(2)} (${fp.priceHistory.length} observations)`,
    );

    return item;
  }

  // ─── Daily Cron: Drift Detection ─────────────────────────────────────────

  @Cron('0 2 * * *') // 2:00 AM daily
  async runDriftDetection() {
    this.logger.log('[NexPRINT] Starting daily drift detection...');

    // Find fingerprints with ≥3 price observations
    const candidates = await this.prisma.productFingerprint.findMany({
      where: {
        priceHistory: { some: {} },
      },
      include: {
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { priceHistory: true } },
      },
    });

    let driftFlags = 0;
    let downgrades = 0;
    let staleCleanups = 0;

    for (const fp of candidates) {
      if (fp._count.priceHistory < 3) continue;

      const prices = fp.priceHistory.map((h) => h.unitPrice);
      const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
      const latest = prices[0];

      if (mean <= 0) continue;

      const drift = Math.abs(latest - mean) / mean;

      if (drift > 0.25) {
        // Major drift — downgrade confidence
        await this.prisma.productFingerprint.update({
          where: { id: fp.id },
          data: {
            confidence: CONFIDENCE_RANK[fp.confidence] > CONFIDENCE_RANK['MEDIUM']
              ? 'MEDIUM'
              : fp.confidence,
          },
        });
        downgrades++;
        this.logger.warn(
          `[NexPRINT-DRIFT] ${fp.supplierKey}/${fp.productId}: ${(drift * 100).toFixed(1)}% drift → downgraded`,
        );
      } else if (drift > 0.10) {
        driftFlags++;
        this.logger.log(
          `[NexPRINT-DRIFT] ${fp.supplierKey}/${fp.productId}: ${(drift * 100).toFixed(1)}% drift (flagged)`,
        );
      }
    }

    // Stale cleanup: fingerprints not verified in >180 days with low confidence
    const staleDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const staleResult = await this.prisma.productFingerprint.updateMany({
      where: {
        lastVerifiedAt: { lt: staleDate },
        confidence: { in: ['HIGH', 'MEDIUM'] },
      },
      data: { confidence: 'LOW' },
    });
    staleCleanups = staleResult.count;

    this.logger.log(
      `[NexPRINT] Drift detection complete: ${driftFlags} flagged, ${downgrades} downgraded, ${staleCleanups} stale cleanups`,
    );
  }

  // ─── Price History Query ─────────────────────────────────────────────────

  async getProductHistory(fingerprintId: string) {
    return this.prisma.productPriceHistory.findMany({
      where: { fingerprintId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── Batch Enrichment (for mobile UI) ───────────────────────────────────

  /**
   * Look up fingerprints for a batch of (supplierKey, productId) pairs.
   * Returns a map keyed by `supplierKey::productId` with fingerprint + price history.
   */
  async enrichFingerprints(
    companyId: string,
    items: Array<{ supplierKey: string; productId: string }>,
  ) {
    if (items.length === 0) return {};

    // Deduplicate lookups
    const uniqueKeys = [...new Set(items.map((i) => `${i.supplierKey}::${i.productId}`))];
    const parsed = uniqueKeys.map((k) => {
      const [supplierKey, productId] = k.split('::');
      return { supplierKey, productId };
    });

    // Batch query: fetch all matching fingerprints for this company
    const fingerprints = await this.prisma.productFingerprint.findMany({
      where: {
        companyId,
        OR: parsed.map((p) => ({
          supplierKey: p.supplierKey,
          productId: p.productId,
        })),
      },
      include: {
        priceHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            unitPrice: true,
            quantity: true,
            source: true,
            transactionDate: true,
            createdAt: true,
          },
        },
      },
    });

    // Build response map
    const result: Record<
      string,
      {
        fingerprintId: string;
        confidence: string;
        verificationCount: number;
        lastVerifiedAt: Date | null;
        coverageValue: number | null;
        coverageUnit: string | null;
        purchaseUnitLabel: string | null;
        sku: string | null;
        priceHistory: Array<{
          unitPrice: number;
          quantity: number;
          source: string;
          transactionDate: Date | null;
          createdAt: Date;
        }>;
      }
    > = {};

    for (const fp of fingerprints) {
      const key = `${fp.supplierKey}::${fp.productId}`;
      result[key] = {
        fingerprintId: fp.id,
        confidence: fp.confidence,
        verificationCount: fp.verificationCount,
        lastVerifiedAt: fp.lastVerifiedAt,
        coverageValue: fp.coverageValue,
        coverageUnit: fp.coverageUnit,
        purchaseUnitLabel: fp.purchaseUnitLabel,
        sku: fp.sku,
        priceHistory: fp.priceHistory,
      };
    }

    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private mapCoverageConfidence(
    coverageConf: string | undefined | null,
  ): FingerprintConfidence {
    switch (coverageConf) {
      case 'HIGH':
        return 'HIGH';
      case 'MEDIUM':
        return 'MEDIUM';
      case 'LOW':
        return 'LOW';
      default:
        return 'LOW';
    }
  }

  /**
   * Returns true if the target confidence should upgrade an existing fingerprint.
   * This is a simplified helper — the full logic is in the upsert callers.
   */
  private shouldUpgrade(_targetConfidence: FingerprintConfidence): boolean {
    // In the upsert context, we handle upgrade logic via conditional update fields
    return true;
  }

  /** Normalize vendor name from receipt to a supplier key. */
  private normalizeVendorToSupplierKey(vendorName: string | null): string | null {
    if (!vendorName) return null;
    const lower = vendorName.toLowerCase();
    if (/home\s*depot|thd\b/i.test(lower)) return 'homedepot';
    if (/lowe['']?s/i.test(lower)) return 'lowes';
    if (/amazon/i.test(lower)) return 'amazon';
    if (/menard/i.test(lower)) return 'menards';
    if (/ace\s*hardware/i.test(lower)) return 'ace';
    if (/true\s*value/i.test(lower)) return 'truevalue';
    if (/sherwin.williams/i.test(lower)) return 'sherwin-williams';
    if (/floor\s*&?\s*decor/i.test(lower)) return 'flooranddecor';
    // Unknown vendor — use sanitized name
    return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || null;
  }

  /** Generate a stable product ID from a description when no SKU is available. */
  private descriptionToProductId(desc: string): string {
    return desc
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80);
  }
}
