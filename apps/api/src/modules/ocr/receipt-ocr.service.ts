import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OcrStatus } from '@prisma/client';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import { ReceiptOcrData } from './ocr-provider.interface';
import { ReceiptInventoryBridgeService } from '../daily-log/receipt-inventory-bridge.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Role, GlobalRole } from '../auth/auth.guards';

@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiProvider: OpenAiOcrProvider,
    private readonly inventoryBridge: ReceiptInventoryBridgeService,
  ) {}

  /**
   * Create a pending OCR result record for a receipt image
   */
  async createPendingOcrResult(params: {
    projectFileId: string;
    dailyLogId?: string;
    billId?: string;
  }): Promise<string> {
    const result = await this.prisma.receiptOcrResult.create({
      data: {
        projectFileId: params.projectFileId,
        dailyLogId: params.dailyLogId ?? null,
        billId: params.billId ?? null,
        status: OcrStatus.PENDING,
        provider: 'openai',
      },
      select: { id: true },
    });

    this.logger.log(`Created pending OCR result: ${result.id}`);
    return result.id;
  }

  /**
   * Process a receipt image and extract data using OCR
   * This can be called immediately or via a job queue
   */
  async processReceipt(ocrResultId: string): Promise<ReceiptOcrData | null> {
    // Mark as processing
    await this.prisma.receiptOcrResult.update({
      where: { id: ocrResultId },
      data: { status: OcrStatus.PROCESSING },
    });

    const ocrResult = await this.prisma.receiptOcrResult.findUnique({
      where: { id: ocrResultId },
      include: {
        projectFile: { select: { id: true, storageUrl: true } },
      },
    });

    if (!ocrResult) {
      this.logger.error(`OCR result not found: ${ocrResultId}`);
      return null;
    }

    const imageUrl = ocrResult.projectFile.storageUrl;
    if (!imageUrl) {
      await this.markFailed(ocrResultId, 'No image URL available');
      return null;
    }

    try {
      this.logger.log(`Processing receipt OCR: ${ocrResultId}`);

      // Route PDFs to text extraction, images to vision OCR
      const isPdf = imageUrl.toLowerCase().endsWith('.pdf') ||
        ocrResult.projectFile.storageUrl?.toLowerCase().endsWith('.pdf');
      const extractedData = isPdf
        ? await this.openAiProvider.extractReceiptFromPdf(imageUrl)
        : await this.openAiProvider.extractReceipt(imageUrl);

      // Update OCR result with extracted data
      await this.prisma.receiptOcrResult.update({
        where: { id: ocrResultId },
        data: {
          status: OcrStatus.COMPLETED,
          vendorName: extractedData.vendorName ?? null,
          vendorAddress: extractedData.vendorAddress ?? null,
          vendorPhone: extractedData.vendorPhone ?? null,
          vendorStoreNumber: extractedData.vendorStoreNumber ?? null,
          vendorCity: extractedData.vendorCity ?? null,
          vendorState: extractedData.vendorState ?? null,
          vendorZip: extractedData.vendorZip ?? null,
          receiptDate: extractedData.receiptDate
            ? new Date(extractedData.receiptDate)
            : null,
          receiptTime: extractedData.receiptTime ?? null,
          subtotal: extractedData.subtotal ?? null,
          taxAmount: extractedData.taxAmount ?? null,
          totalAmount: extractedData.totalAmount ?? null,
          currency: extractedData.currency ?? 'USD',
          paymentMethod: extractedData.paymentMethod ?? null,
          lineItemsJson: extractedData.lineItems
            ? JSON.stringify(extractedData.lineItems)
            : null,
          rawResponseJson: extractedData.rawResponse ?? null,
          confidence: extractedData.confidence ?? null,
          processedAt: new Date(),
        },
      });

      // If linked to a daily log, update the expense fields
      if (ocrResult.dailyLogId) {
        await this.updateDailyLogFromOcr(ocrResult.dailyLogId, extractedData);

        // Auto-promote receipt line items to inventory
        await this.promoteReceiptInventory(ocrResult.dailyLogId);
      }

      this.logger.log(
        `OCR completed for ${ocrResultId}: ${extractedData.vendorName} - $${extractedData.totalAmount}`,
      );

      return extractedData;
    } catch (error: any) {
      await this.markFailed(ocrResultId, error?.message ?? 'OCR processing failed');
      return null;
    }
  }

  /**
   * Process receipt immediately (synchronous flow for MVP)
   * In production, this would be queued via Bull/BullMQ
   */
  async processReceiptAsync(params: {
    projectFileId: string;
    dailyLogId?: string;
    billId?: string;
  }): Promise<void> {
    const ocrResultId = await this.createPendingOcrResult(params);

    // Process in background (fire-and-forget for now)
    // In production: queue.add('process-receipt', { ocrResultId })
    setImmediate(async () => {
      try {
        await this.processReceipt(ocrResultId);
      } catch (error: any) {
        this.logger.error(`Background OCR processing failed: ${error?.message ?? error}`);
      }
    });
  }

  /**
   * Get all OCR results for a daily log (supports multi-receipt)
   */
  async getOcrResultsForDailyLog(dailyLogId: string): Promise<any[]> {
    return this.prisma.receiptOcrResult.findMany({
      where: { dailyLogId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get OCR result for a bill
   */
  async getOcrResultForBill(billId: string): Promise<any | null> {
    return this.prisma.receiptOcrResult.findUnique({
      where: { billId },
    });
  }

  /**
   * Get merged line items from all OCR results for a daily log.
   * Each item tagged with ocrResultId + lineItemIndex for stable identification.
   */
  async getMergedLineItemsForDailyLog(dailyLogId: string): Promise<{
    lineItems: Array<{
      ocrResultId: string;
      lineItemIndex: number;
      description: string;
      sku?: string | null;
      quantity?: number | null;
      unitPrice?: number | null;
      amount?: number | null;
      category?: string | null;
    }>;
    ocrSummaries: Array<{
      ocrResultId: string;
      vendorName: string | null;
      totalAmount: number | null;
      receiptDate: Date | null;
      confidence: number | null;
      fileName: string | null;
    }>;
  }> {
    const results = await this.prisma.receiptOcrResult.findMany({
      where: { dailyLogId, status: OcrStatus.COMPLETED },
      orderBy: { createdAt: 'asc' },
      include: { projectFile: { select: { fileName: true } } },
    });

    const lineItems: any[] = [];
    const ocrSummaries: any[] = [];

    for (const ocr of results) {
      ocrSummaries.push({
        ocrResultId: ocr.id,
        vendorName: ocr.vendorName,
        totalAmount: ocr.totalAmount != null ? Number(ocr.totalAmount) : null,
        receiptDate: ocr.receiptDate,
        confidence: ocr.confidence,
        fileName: ocr.projectFile?.fileName ?? null,
      });

      if (ocr.lineItemsJson) {
        try {
          const items = JSON.parse(ocr.lineItemsJson);
          if (Array.isArray(items)) {
            for (let i = 0; i < items.length; i++) {
              lineItems.push({
                ocrResultId: ocr.id,
                lineItemIndex: i,
                description: items[i].description ?? '',
                sku: items[i].sku ?? null,
                quantity: items[i].quantity ?? items[i].qty ?? null,
                unitPrice: items[i].unitPrice ?? items[i].unit_price ?? null,
                amount: items[i].amount ?? null,
                category: items[i].category ?? null,
              });
            }
          }
        } catch {
          this.logger.warn(`Failed to parse lineItemsJson for OCR ${ocr.id}`);
        }
      }
    }

    return { lineItems, ocrSummaries };
  }

  private async markFailed(ocrResultId: string, errorMessage: string): Promise<void> {
    this.logger.error(`OCR failed for ${ocrResultId}: ${errorMessage}`);
    await this.prisma.receiptOcrResult.update({
      where: { id: ocrResultId },
      data: {
        status: OcrStatus.FAILED,
        errorMessage,
        processedAt: new Date(),
      },
    });
  }

  /**
   * After OCR completes, auto-promote receipt line items to MaterialLots
   * and create InventoryPositions. Reconstructs actor from the DailyLog creator.
   */
  private async promoteReceiptInventory(dailyLogId: string): Promise<void> {
    try {
      const log = await this.prisma.dailyLog.findUnique({
        where: { id: dailyLogId },
      });

      if (!log) {
        this.logger.warn(`Cannot promote receipt: log ${dailyLogId} not found`);
        return;
      }

      // Look up the creator for actor reconstruction
      const creator = await this.prisma.user.findUnique({
        where: { id: log.createdById },
        select: { id: true, email: true, globalRole: true, userType: true },
      });

      if (!creator) {
        this.logger.warn(`Cannot promote receipt: creator ${log.createdById} not found`);
        return;
      }

      // Get companyId from the project
      const project = await this.prisma.project.findUnique({
        where: { id: log.projectId },
        select: { companyId: true },
      });

      if (!project) return;

      // Get role from company membership
      const membership = await this.prisma.companyMembership.findFirst({
        where: { userId: creator.id, companyId: project.companyId },
        select: { role: true },
      });

      // Reconstruct minimal actor from log creator
      const actor: AuthenticatedUser = {
        userId: creator.id,
        companyId: project.companyId,
        role: (membership?.role ?? 'MEMBER') as unknown as Role,
        email: creator.email,
        globalRole: (creator.globalRole ?? 'NONE') as unknown as GlobalRole,
        userType: creator.userType,
      };

      const result = await this.inventoryBridge.promoteReceipt(dailyLogId, project.companyId, actor);
      this.logger.log(
        `Inventory promotion for log ${dailyLogId}: ${result.materialLotIds.length} lots, vendor match=${result.vendorMatchType}`,
      );
    } catch (err: any) {
      this.logger.warn(`Inventory promotion failed for log ${dailyLogId}: ${err?.message ?? err}`);
      // Don't throw — promotion is best-effort, should not break OCR flow
    }
  }

  /**
   * Merge logic: aggregate totals across ALL completed OCR results for the log.
   * First vendor name wins; amounts are summed; earliest date wins.
   */
  private async updateDailyLogFromOcr(
    dailyLogId: string,
    _latestData: ReceiptOcrData,
  ): Promise<void> {
    const dailyLog = await this.prisma.dailyLog.findUnique({
      where: { id: dailyLogId },
    });
    if (!dailyLog) return;

    // Fetch all completed OCR results for this log
    const allOcr = await this.prisma.receiptOcrResult.findMany({
      where: { dailyLogId, status: OcrStatus.COMPLETED },
      orderBy: { createdAt: 'asc' },
    });

    if (allOcr.length === 0) return;

    // First vendor name wins (most likely the primary receipt)
    const vendor = allOcr.find(o => o.vendorName)?.vendorName ?? null;
    // Sum total amounts across all receipts
    let totalAmount = 0;
    for (const ocr of allOcr) {
      if (ocr.totalAmount != null) totalAmount += Number(ocr.totalAmount);
    }
    // Earliest receipt date wins
    const dates = allOcr.map(o => o.receiptDate).filter(Boolean) as Date[];
    const earliestDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;

    const updates: any = {};
    if (vendor) updates.expenseVendor = vendor;
    if (totalAmount > 0) updates.expenseAmount = totalAmount;
    if (earliestDate) updates.expenseDate = earliestDate;

    if (Object.keys(updates).length > 0) {
      await this.prisma.dailyLog.update({
        where: { id: dailyLogId },
        data: updates,
      });
      this.logger.log(`Merged OCR data for log ${dailyLogId}: ${allOcr.length} receipt(s), vendor=${vendor}, total=${totalAmount}`);
    }
  }
}
