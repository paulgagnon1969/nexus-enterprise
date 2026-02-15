import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OcrProvider, ReceiptOcrData } from './ocr-provider.interface';
import { GcsService } from '../../infra/storage/gcs.service';
import * as fs from 'fs';
import * as path from 'path';
import * as fsPromises from 'fs/promises';

const RECEIPT_EXTRACTION_PROMPT = `You are an expert receipt OCR system. Analyze this receipt image carefully and extract data. The image may be a phone photo with varying quality, angles, or lighting.

Extract the following data and return ONLY valid JSON (no markdown, no explanation):

{
  "vendor_name": "Store/business name (look for logo, header, or printed store name)",
  "vendor_address": "Full address if visible",
  "receipt_date": "YYYY-MM-DD format (look for date stamps, transaction date)",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "currency": "USD",
  "payment_method": "CASH or CARD or CHECK or OTHER",
  "line_items": [
    {"description": "Item name", "quantity": 1, "unit_price": 0.00, "amount": 0.00}
  ],
  "confidence": 0.95,
  "extraction_notes": "Any notes about image quality or partial reads"
}

Rules:
- Look carefully at the ENTIRE image, including rotated or angled text
- All amounts should be numbers (not strings), e.g. 12.99 not "$12.99"
- Date must be ISO format (YYYY-MM-DD). Common formats: MM/DD/YY, MM-DD-YYYY, etc.
- The TOTAL is usually the largest amount, often at the bottom, sometimes labeled "TOTAL", "AMOUNT DUE", "BALANCE"
- If a field is unclear or not visible, set it to null (don't guess)
- For confidence: 0.9+ = clear/readable, 0.7-0.9 = some blur/glare, 0.5-0.7 = difficult to read, <0.5 = very poor quality
- If the image is NOT a receipt (e.g., blank, unrelated), set confidence to 0 and note this
- Return ONLY the JSON object, nothing else`;

@Injectable()
export class OpenAiOcrProvider implements OcrProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiOcrProvider.name);
  private client: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly gcsService?: GcsService,
  ) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  /**
   * Check if a URL is a local/relative path or GCS URI that needs conversion
   */
  private isLocalOrGcsUrl(url: string): boolean {
    return (
      url.startsWith('/') ||
      url.startsWith('gs://') ||
      url.startsWith('file://') ||
      !url.startsWith('http')
    );
  }

  /**
   * Convert local file path to base64 data URL
   */
  private async localFileToBase64(localPath: string): Promise<string> {
    // Handle relative paths (e.g., /uploads/daily-logs/file.jpg)
    let fullPath = localPath;
    if (localPath.startsWith('/uploads/')) {
      fullPath = path.resolve(process.cwd(), localPath.substring(1));
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Local file not found: ${fullPath}`);
    }

    const buffer = fs.readFileSync(fullPath);
    const base64 = buffer.toString('base64');

    // Detect mime type from extension
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Prepare image URL for OpenAI - convert local/GCS paths to base64
   */
  private async prepareImageUrl(imageUrl: string): Promise<string> {
    if (!this.isLocalOrGcsUrl(imageUrl)) {
      // Already a public HTTP URL
      return imageUrl;
    }

    if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('/')) {
      this.logger.log(`Converting local file to base64: ${imageUrl}`);
      return this.localFileToBase64(imageUrl);
    }

    if (imageUrl.startsWith('gs://')) {
      // Download from GCS and convert to base64
      if (this.gcsService) {
        try {
          this.logger.log(`Downloading GCS file for OCR: ${imageUrl}`);
          const localPath = await this.gcsService.downloadToTmp(imageUrl);
          const base64Url = await this.localFileToBase64(localPath);
          // Clean up temp file
          await fsPromises.unlink(localPath).catch(() => {});
          return base64Url;
        } catch (gcsErr: any) {
          this.logger.warn(`GCS download failed, trying public URL: ${gcsErr?.message}`);
        }
      }

      // Fallback: try converting to public URL format
      const match = imageUrl.match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (match) {
        const publicUrl = `https://storage.googleapis.com/${match[1]}/${match[2]}`;
        this.logger.log(`Converted GCS URI to public URL: ${publicUrl}`);
        return publicUrl;
      }
    }

    throw new Error(`Unsupported image URL format: ${imageUrl}`);
  }

  async extractReceipt(imageUrl: string): Promise<ReceiptOcrData> {
    const client = this.getClient();

    this.logger.log(`Extracting receipt data from: ${imageUrl.substring(0, 80)}...`);

    try {
      // Convert local/GCS URLs to a format OpenAI can use
      const processedUrl = await this.prepareImageUrl(imageUrl);
      const isBase64 = processedUrl.startsWith('data:');

      this.logger.log(
        `Image prepared for OCR: ${isBase64 ? 'base64 encoded' : processedUrl.substring(0, 60)}...`,
      );

      const response = await client.chat.completions.create({
        model: 'gpt-4o', // GPT-4 Vision model
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: RECEIPT_EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: processedUrl,
                  detail: 'high', // High detail for receipt text
                },
              },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Invalid JSON response: ${content.substring(0, 200)}`);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Map to our interface (snake_case to camelCase)
      const result: ReceiptOcrData = {
        vendorName: parsed.vendor_name ?? undefined,
        vendorAddress: parsed.vendor_address ?? undefined,
        receiptDate: parsed.receipt_date ?? undefined,
        subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : undefined,
        taxAmount: typeof parsed.tax_amount === 'number' ? parsed.tax_amount : undefined,
        totalAmount: typeof parsed.total_amount === 'number' ? parsed.total_amount : undefined,
        currency: parsed.currency ?? 'USD',
        paymentMethod: parsed.payment_method ?? undefined,
        lineItems: Array.isArray(parsed.line_items)
          ? parsed.line_items.map((item: any) => ({
              description: item.description ?? '',
              quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
              unitPrice: typeof item.unit_price === 'number' ? item.unit_price : undefined,
              amount: typeof item.amount === 'number' ? item.amount : undefined,
            }))
          : undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        extractionNotes: parsed.extraction_notes ?? undefined,
        rawResponse: content,
      };

      this.logger.log(
        `Receipt extracted: vendor=${result.vendorName ?? 'Unknown'}, total=$${result.totalAmount ?? 0}, confidence=${result.confidence}${result.extractionNotes ? `, notes: ${result.extractionNotes}` : ''}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(`OCR extraction failed: ${error?.message ?? error}`);
      throw error;
    }
  }
}
