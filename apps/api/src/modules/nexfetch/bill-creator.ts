/**
 * NexFetch — Bill Creator
 *
 * Given a ParsedReceipt, a MatchResult, and an optional screenshot PNG buffer,
 * persists the full data chain:
 *
 *   1. ProjectFile  — receipt screenshot (PNG) stored in GCS
 *   2. ReceiptOcrResult — structured parsed data (vendor, items, totals)
 *   3. ProjectBill  — DRAFT bill with line items
 *   4. ProjectBillAttachment — links bill ↔ ProjectFile
 *   5. EmailReceipt — ingestion record with match metadata
 */

import { PrismaClient, EmailReceiptStatus } from "@prisma/client";
import type { ParsedReceipt } from "./parsers/types";
import type { MatchResult } from "./matcher";

// ── Types ────────────────────────────────────────────────────────────

export interface BillCreateInput {
  receipt: ParsedReceipt;
  match: MatchResult;
  companyId: string;

  /** Screenshot PNG buffer (from screenshot.ts). null = skip attachment. */
  screenshotBuffer: Buffer | null;

  /** Email metadata */
  senderEmail: string;
  subject: string | null;
  receivedAt: Date;
  messageId: string | null;

  /** Source .emlx file path (for audit trail) */
  sourceFilePath: string;
}

export interface BillCreateResult {
  emailReceiptId: string;
  projectBillId: string | null;
  ocrResultId: string | null;
  projectFileId: string | null;
  status: EmailReceiptStatus;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Upload a buffer to GCS and return the public URL.
 * For the initial CLI import, we write to a local tmp path and generate
 * a placeholder URL.  Production code should use the real GCS uploader.
 */
async function uploadScreenshot(
  buffer: Buffer,
  companyId: string,
  projectId: string,
  fileName: string,
): Promise<string> {
  // TODO: Replace with real GCS upload (e.g. @google-cloud/storage)
  // For now, return a placeholder path — the CLI import stores locally
  const path = `receipts/${companyId}/${projectId}/${fileName}`;
  return `https://storage.googleapis.com/nexus-uploads/${path}`;
}

// ── Main ─────────────────────────────────────────────────────────────

export async function createBillFromReceipt(
  input: BillCreateInput,
  prisma: PrismaClient,
): Promise<BillCreateResult> {
  const { receipt, match, companyId } = input;
  const projectId = match.projectId;

  // If no project match, just create the EmailReceipt (no bill/file)
  if (!projectId) {
    const emailReceipt = await prisma.emailReceipt.create({
      data: {
        companyId,
        tenantEmailAddress: input.senderEmail,
        senderEmail: input.senderEmail,
        subject: input.subject,
        receivedAt: input.receivedAt,
        messageId: input.messageId,
        status: match.status,
        matchConfidence: match.confidence,
        matchReason: match.reason,
        rawEmailJson: { sourceFile: input.sourceFilePath },
      },
    });

    return {
      emailReceiptId: emailReceipt.id,
      projectBillId: null,
      ocrResultId: null,
      projectFileId: null,
      status: match.status,
    };
  }

  // ── Transactional creation (all-or-nothing) ─────────────
  return prisma.$transaction(async (tx) => {
    // 1. ProjectFile (receipt screenshot)
    let projectFileId: string | null = null;
    let fileUrl = "";

    if (input.screenshotBuffer) {
      const fileName = `${receipt.vendor}_receipt_${receipt.store.storeNumber || "unknown"}_${receipt.receiptDate || "nodate"}.png`;
      fileUrl = await uploadScreenshot(input.screenshotBuffer, companyId, projectId, fileName);

      const projectFile = await tx.projectFile.create({
        data: {
          companyId,
          projectId,
          storageUrl: fileUrl,
          fileName,
          mimeType: "image/png",
          sizeBytes: input.screenshotBuffer.length,
        },
      });
      projectFileId = projectFile.id;
    }

    // 2. ProjectBill
    const billDate = receipt.receiptDate
      ? new Date(receipt.receiptDate)
      : input.receivedAt;

    const bill = await tx.projectBill.create({
      data: {
        companyId,
        projectId,
        vendorName: receipt.vendor === "HOME_DEPOT" ? "Home Depot" : "Lowe's",
        billNumber: receipt.transactionNumber || null,
        billDate,
        status: "DRAFT",
        memo: buildMemo(receipt, match),
        totalAmount: receipt.totalAmount || 0,
      },
    });

    // 3. ProjectBillLineItems
    if (receipt.lineItems.length > 0) {
      await tx.projectBillLineItem.createMany({
        data: receipt.lineItems.map((item) => ({
          billId: bill.id,
          kind: "MATERIALS" as const,
          description: truncate(
            `${item.shortDescription}${item.sku ? ` (${item.sku})` : ""}`,
            500,
          ),
          amountSource: "MANUAL" as const,
          amount: item.extendedPrice,
          metaJson: {
            sku: item.sku,
            modelNumber: item.modelNumber,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            fullDescription: item.fullDescription,
          },
        })),
      });
    }

    // 4. ProjectBillAttachment
    if (projectFileId) {
      await tx.projectBillAttachment.create({
        data: {
          billId: bill.id,
          projectFileId,
          fileUrl,
          fileName: `${receipt.vendor}_receipt.png`,
          mimeType: "image/png",
          sizeBytes: input.screenshotBuffer!.length,
        },
      });
    }

    // 5. ReceiptOcrResult (structured data for search/audit)
    let ocrResultId: string | null = null;

    if (projectFileId) {
      const ocrResult = await tx.receiptOcrResult.create({
        data: {
          billId: bill.id,
          projectFileId,
          status: "COMPLETED",
          provider: "nexfetch",
          vendorName: receipt.vendor === "HOME_DEPOT" ? "Home Depot" : "Lowe's",
          vendorAddress: receipt.store.address,
          vendorPhone: receipt.store.phone,
          vendorStoreNumber: receipt.store.storeNumber,
          vendorCity: receipt.store.city,
          vendorState: receipt.store.state,
          vendorZip: receipt.store.zip,
          receiptDate: billDate,
          receiptTime: receipt.receiptTime || null,
          subtotal: receipt.subtotal,
          taxAmount: receipt.taxAmount,
          totalAmount: receipt.totalAmount,
          currency: "USD",
          paymentMethod: receipt.payments?.[0]?.cardType || null,
          lineItemsJson: JSON.stringify(
            receipt.lineItems.map((item) => ({
              description: item.shortDescription,
              sku: item.sku,
              qty: item.quantity || 1,
              unitPrice: item.unitPrice,
              amount: item.extendedPrice,
            })),
          ),
          confidence: 1.0, // Structured HTML — not OCR, so 100% confidence
          processedAt: new Date(),
        },
      });
      ocrResultId = ocrResult.id;
    }

    // 6. EmailReceipt (ingestion record)
    const emailReceipt = await tx.emailReceipt.create({
      data: {
        companyId,
        tenantEmailAddress: input.senderEmail,
        senderEmail: input.senderEmail,
        subject: input.subject,
        receivedAt: input.receivedAt,
        messageId: input.messageId,
        status: match.status,
        projectId,
        matchConfidence: match.confidence,
        matchReason: match.reason,
        ocrResultId,
        rawEmailJson: { sourceFile: input.sourceFilePath },
      },
    });

    return {
      emailReceiptId: emailReceipt.id,
      projectBillId: bill.id,
      ocrResultId,
      projectFileId,
      status: match.status,
    };
  });
}

// ── Utilities ────────────────────────────────────────────────────────

function buildMemo(receipt: ParsedReceipt, match: MatchResult): string {
  const parts: string[] = [];
  const vendor = receipt.vendor === "HOME_DEPOT" ? "Home Depot" : "Lowe's";
  const store = receipt.store.storeNumber ? `#${receipt.store.storeNumber}` : "";

  parts.push(`${vendor} ${store} — ${receipt.lineItems.length} item(s)`);

  if (receipt.loyalty?.poJobName) {
    parts.push(`PO/Job: ${receipt.loyalty.poJobName}`);
  }

  parts.push(`NexFetch: ${match.reason}`);

  return parts.join(" | ");
}

function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 3) + "...";
}
