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

      const extractedData = await this.openAiProvider.extractReceipt(imageUrl);

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
   * Get OCR result for a daily log
   */
  async getOcrResultForDailyLog(dailyLogId: string): Promise<any | null> {
    return this.prisma.receiptOcrResult.findUnique({
      where: { dailyLogId },
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

  private async updateDailyLogFromOcr(
    dailyLogId: string,
    data: ReceiptOcrData,
  ): Promise<void> {
    const dailyLog = await this.prisma.dailyLog.findUnique({
      where: { id: dailyLogId },
    });

    if (!dailyLog) return;

    const updates: any = {};

    // Always update fields if OCR extracted data (user can edit after)
    if (data.vendorName) {
      updates.expenseVendor = data.vendorName;
    }
    if (data.totalAmount != null) {
      updates.expenseAmount = data.totalAmount;
    }
    if (data.receiptDate) {
      updates.expenseDate = new Date(data.receiptDate);
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.dailyLog.update({
        where: { id: dailyLogId },
        data: updates,
      });
      this.logger.log(`Updated daily log ${dailyLogId} with OCR data: vendor=${data.vendorName}, amount=${data.totalAmount}, date=${data.receiptDate}`);
    } else {
      this.logger.warn(`No OCR data to update for daily log ${dailyLogId}`);
    }
  }
}
