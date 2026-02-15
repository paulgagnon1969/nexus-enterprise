import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { OcrStatus } from '@prisma/client';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import { ReceiptOcrData } from './ocr-provider.interface';

@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiProvider: OpenAiOcrProvider,
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
        projectFile: true,
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
          receiptDate: extractedData.receiptDate
            ? new Date(extractedData.receiptDate)
            : null,
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
