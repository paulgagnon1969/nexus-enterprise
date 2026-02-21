import { BadRequestException, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { CombinedAuthGuard } from '../auth/auth.guards';
import { OpenAiOcrProvider } from './openai-ocr.provider';
import type { FastifyRequest } from 'fastify';

/**
 * Standalone OCR endpoint — scan a receipt image without creating a log.
 * Used by mobile to get instant OCR feedback while the user is still editing.
 */
@Controller('ocr')
export class OcrController {
  private readonly logger = new Logger(OcrController.name);

  constructor(private readonly ocrProvider: OpenAiOcrProvider) {}

  /**
   * POST /ocr/receipt-scan
   *
   * Accepts a multipart file upload (field name: "file").
   * Converts the image to base64, runs GPT-4 Vision OCR, and returns
   * extracted receipt data (vendor, amount, date, confidence, line items).
   *
   * No log or project context required — this is a stateless scan.
   */
  @UseGuards(CombinedAuthGuard)
  @Post('receipt-scan')
  async scanReceipt(@Req() req: FastifyRequest) {
    const parts = (req as any).parts?.();
    if (!parts) {
      throw new BadRequestException('Multipart support is not configured');
    }

    let filePart: {
      filename: string;
      mimetype: string;
      toBuffer: () => Promise<Buffer>;
    } | undefined;

    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        filePart = part;
        break;
      }
    }

    if (!filePart) {
      throw new BadRequestException('No file uploaded. Send a multipart form with field "file".');
    }

    // Validate it's an image
    if (!filePart.mimetype.startsWith('image/')) {
      throw new BadRequestException(`Expected an image file, got: ${filePart.mimetype}`);
    }

    const buffer = await filePart.toBuffer();

    // 10 MB limit
    if (buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Image too large. Maximum size is 10 MB.');
    }

    this.logger.log(
      `Receipt scan requested: ${filePart.filename} (${filePart.mimetype}, ${Math.round(buffer.length / 1024)} KB)`,
    );

    // Convert to base64 data URL for OpenAI
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${filePart.mimetype};base64,${base64}`;

    try {
      const result = await this.ocrProvider.extractReceipt(dataUrl);

      return {
        success: true,
        vendor: result.vendorName ?? null,
        amount: result.totalAmount ?? null,
        date: result.receiptDate ?? null,
        subtotal: result.subtotal ?? null,
        taxAmount: result.taxAmount ?? null,
        currency: result.currency ?? 'USD',
        paymentMethod: result.paymentMethod ?? null,
        lineItems: result.lineItems ?? [],
        confidence: result.confidence ?? null,
        notes: result.extractionNotes ?? null,
      };
    } catch (error: any) {
      this.logger.error(`Receipt scan failed: ${error?.message ?? error}`);
      return {
        success: false,
        error: error?.message ?? 'OCR processing failed',
        vendor: null,
        amount: null,
        date: null,
        confidence: null,
      };
    }
  }
}
