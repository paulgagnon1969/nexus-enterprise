import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OcrProvider, ReceiptOcrData } from './ocr-provider.interface';
import { ObjectStorageService } from '../../infra/storage/object-storage.service';
import * as fs from 'fs';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import pdfParse from 'pdf-parse';

const RECEIPT_EXTRACTION_PROMPT = `You are an expert receipt OCR system. Analyze this receipt image carefully and extract data. The image may be a phone photo with varying quality, angles, or lighting.

Extract the following data and return ONLY valid JSON (no markdown, no explanation):

{
  "vendor_name": "Store/business name (look for logo, header, or printed store name)",
  "vendor_address": "Full street address if visible",
  "vendor_phone": "Store phone number if visible",
  "vendor_store_number": "Store/location number if visible (e.g. '0604' from 'Home Depot #0604')",
  "vendor_city": "City from address",
  "vendor_state": "State abbreviation from address (e.g. 'TX')",
  "vendor_zip": "ZIP code from address",
  "receipt_date": "YYYY-MM-DD format (look for date stamps, transaction date)",
  "receipt_time": "HH:mm format (24-hour, from timestamp on receipt)",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "currency": "USD",
  "payment_method": "CASH or CARD or CHECK or OTHER",
  "line_items": [
    {"description": "Item name", "sku": "Item SKU/product code if printed", "quantity": 1, "unit_price": 0.00, "amount": 0.00, "category": "Material category (LUMBER, ELECTRICAL, PLUMBING, PAINT, HARDWARE, HVAC, CONCRETE, DRYWALL, FLOORING, ROOFING, TOOLS, SAFETY, GENERAL)"},
    {"description": "Sales Tax", "quantity": 1, "amount": 0.00, "category": "TAX"}
  ],
  "confidence": 0.95,
  "extraction_notes": "Any notes about image quality or partial reads"
}

Rules:
- Look carefully at the ENTIRE image, including rotated or angled text
- All amounts should be numbers (not strings), e.g. 12.99 not "$12.99"
- total_amount MUST come from the line labeled "TOTAL" on the receipt. This is the most important field. Never return 0 if a TOTAL line exists.
- Line item amounts should be POSITIVE for purchases. Only use negative amounts if the receipt explicitly says "RETURN", "REFUND", or shows a negative sign/parentheses on the total.
- "RECALL AMOUNT" on Home Depot receipts is NOT a return — it is the item subtotal for a store pickup / special order. Treat it as a normal positive line item.
- Date must be ISO format (YYYY-MM-DD). Common formats: MM/DD/YY, MM-DD-YYYY, etc. If year is 2-digit, assume 2026.
- Time must be 24-hour HH:mm format. Convert from 12-hour if needed.
- The TOTAL is usually the largest amount, often at the bottom, sometimes labeled "TOTAL", "AMOUNT DUE", "BALANCE". For actual returns it will be negative.
- CRITICAL: The sum of all line_items amounts MUST equal total_amount. To achieve this, ALWAYS include "Sales Tax" as a separate line item with category "TAX" if the receipt shows any tax amount.
- SKU: Look for item/product codes printed next to each line item (often 6-12 digit numbers)
- Store number: Often printed near the store name or in the header (e.g. "Store #0604", "Loc: 1234")
- Phone: Usually in the header near the address
- Break the address into city, state, zip components when possible
- Category: Classify each item into the most appropriate construction material category
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
    @Optional() private readonly gcsService?: ObjectStorageService,
  ) {}

  private getClient(): OpenAI {
    if (!this.client) {
      // Prefer xAI (Grok) if configured, fall back to OpenAI
      const xaiKey = this.configService.get<string>('XAI_API_KEY');
      const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
      const apiKey = xaiKey || openaiKey;
      if (!apiKey) {
        throw new Error('Neither XAI_API_KEY nor OPENAI_API_KEY is configured');
      }
      this.client = new OpenAI({
        apiKey,
        ...(xaiKey ? { baseURL: 'https://api.x.ai/v1' } : {}),
      });
      this.logger.log(`OCR provider: ${xaiKey ? 'xAI (Grok)' : 'OpenAI'}`);
    }
    return this.client;
  }

  private getVisionModel(): string {
    return this.configService.get<string>('VISION_MODEL') || 'gpt-4o';
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
   * Try to extract a gs:// URI from a MinIO public URL.
   * MinIO public URLs look like: https://host/bucket/key
   * Returns the gs:// URI if matched, or null.
   */
  private extractGcsUriFromPublicUrl(url: string): string | null {
    // Match URLs containing a known bucket name pattern (nexus-*) in the path
    const match = url.match(/\/(nexus-[a-z0-9-]+)\/(.+)$/);
    if (match) return `gs://${match[1]}/${match[2]}`;
    return null;
  }

  /**
   * Download a gs:// URI from object storage and return as base64 data URL.
   */
  private async gcsToBase64(gcsUri: string): Promise<string> {
    if (!this.gcsService) {
      throw new Error(`Cannot resolve gs:// URI without storage service: ${gcsUri}`);
    }
    this.logger.log(`Downloading from storage for OCR: ${gcsUri}`);
    const localPath = await this.gcsService.downloadToTmp(gcsUri);
    const base64Url = await this.localFileToBase64(localPath);
    await fsPromises.unlink(localPath).catch(() => {});
    return base64Url;
  }

  /**
   * Prepare image URL for OpenAI/xAI — always convert to base64.
   *
   * MinIO files are never publicly accessible (behind Docker / Cloudflare
   * Tunnel), so we MUST download and base64-encode rather than passing URLs
   * to the AI provider.
   */
  private async prepareImageUrl(imageUrl: string): Promise<string> {
    // Already base64 — pass through
    if (imageUrl.startsWith('data:')) return imageUrl;

    // Local file path → base64
    if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('/')) {
      this.logger.log(`Converting local file to base64: ${imageUrl}`);
      return this.localFileToBase64(imageUrl);
    }

    // gs:// URI → download from MinIO → base64
    if (imageUrl.startsWith('gs://') || imageUrl.startsWith('s3://')) {
      return this.gcsToBase64(imageUrl);
    }

    // HTTP URL that looks like a MinIO public URL → convert to gs:// and download
    if (imageUrl.startsWith('http')) {
      const gcsUri = this.extractGcsUriFromPublicUrl(imageUrl);
      if (gcsUri) {
        this.logger.log(`Converting MinIO public URL to storage URI: ${gcsUri}`);
        return this.gcsToBase64(gcsUri);
      }
      // Truly public URL (e.g. CDN) — pass through
      return imageUrl;
    }

    throw new Error(`Unsupported image URL format: ${imageUrl}`);
  }

  /**
   * Extract receipt data from a PDF file (text-based extraction).
   * Downloads the PDF, extracts text with pdf-parse, then sends to
   * Grok/OpenAI for structured data extraction.
   */
  async extractReceiptFromPdf(storageUrl: string): Promise<ReceiptOcrData> {
    const client = this.getClient();

    this.logger.log(`Extracting receipt from PDF: ${storageUrl.substring(0, 80)}...`);

    // Download PDF from storage
    let localPath: string;
    let gcsUri = storageUrl;
    if (storageUrl.startsWith('http')) {
      const extracted = this.extractGcsUriFromPublicUrl(storageUrl);
      if (extracted) gcsUri = extracted;
    }

    if (!this.gcsService) {
      throw new Error('Storage service required for PDF extraction');
    }

    localPath = await this.gcsService.downloadToTmp(gcsUri);

    try {
      const pdfBuffer = await fsPromises.readFile(localPath);
      const parsed = await pdfParse(pdfBuffer);

      const pdfText = parsed.text?.trim() || '';
      const pdfMetadata = {
        pages: parsed.numpages,
        author: parsed.info?.Author || undefined,
        creator: parsed.info?.Creator || undefined,
        producer: parsed.info?.Producer || undefined,
        creationDate: parsed.info?.CreationDate || undefined,
        modDate: parsed.info?.ModDate || undefined,
        title: parsed.info?.Title || undefined,
      };

      this.logger.log(
        `PDF parsed: ${parsed.numpages} page(s), ${pdfText.length} chars of text`,
      );

      if (pdfText.length < 20) {
        // Scanned PDF with no selectable text — fall back to image OCR
        // (future: convert PDF page to image and use vision API)
        return {
          confidence: 0,
          extractionNotes: 'PDF contains no extractable text (scanned image). Upload as image instead.',
          pdfMetadata,
        };
      }

      // Send extracted text to AI for structured extraction
      const textPrompt = `You are an expert receipt parser. The following text was extracted from a receipt PDF. Parse it and return ONLY valid JSON (no markdown).

Extract the following data:

{
  "vendor_name": "Store/business name (e.g. 'Home Depot', 'Lowe's' — infer from store number, address, or receipt format if not explicitly printed)",
  "vendor_address": "Full street address if visible",
  "vendor_phone": "Store phone number if visible",
  "vendor_store_number": "Store/location number if visible",
  "vendor_city": "City from address",
  "vendor_state": "State abbreviation (e.g. 'TX')",
  "vendor_zip": "ZIP code from address",
  "receipt_date": "YYYY-MM-DD format",
  "receipt_time": "HH:mm format (24-hour)",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "currency": "USD",
  "payment_method": "CASH or CARD or CHECK or OTHER",
  "line_items": [
    {"description": "Item name", "sku": "Item SKU if present", "quantity": 1, "unit_price": 0.00, "amount": 0.00, "category": "LUMBER|ELECTRICAL|PLUMBING|PAINT|HARDWARE|HVAC|CONCRETE|DRYWALL|FLOORING|ROOFING|TOOLS|SAFETY|GENERAL"},
    {"description": "Sales Tax", "quantity": 1, "amount": 0.00, "category": "TAX"}
  ],
  "confidence": 0.95,
  "extraction_notes": "Any notes about the extraction"
}

Rules:
- All amounts must be numbers (not strings), e.g. 12.99 not "$12.99"
- total_amount MUST come from the line labeled "TOTAL" on the receipt. This is the most important field. Never return 0 if a TOTAL line exists.
- subtotal comes from the "SUBTOTAL" line. tax_amount comes from "SALES TAX" or "TAX".
- CRITICAL: The sum of all line_items amounts MUST equal total_amount. To achieve this, ALWAYS include "Sales Tax" as a separate line item with category "TAX" if the receipt shows any tax amount.
- Line item amounts should be POSITIVE for purchases. Only use negative amounts if the receipt explicitly says "RETURN", "REFUND", or shows a negative sign/parentheses on the total.
- "RECALL AMOUNT" on Home Depot receipts is NOT a return — it is the item subtotal for a store pickup / special order. Treat it as a normal positive line item.
- Date must be ISO format YYYY-MM-DD. If year is 2-digit (e.g. 02/15/26), assume 2026.
- Store number format hints: Home Depot uses 4-digit (e.g. 6989), Lowe's uses 4-digit, etc.
- Infer vendor_name from context if not explicitly stated (store format, address, receipt layout)
- If a field is unclear, set it to null
- Return ONLY the JSON object

Receipt text:
---
${pdfText.substring(0, 8000)}
---`;

      const response = await client.chat.completions.create({
        model: this.getVisionModel(),
        messages: [{ role: 'user', content: textPrompt }],
        max_tokens: 1500,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from AI');
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Invalid JSON response: ${content.substring(0, 200)}`);
      }

      const parsed2 = JSON.parse(jsonMatch[0]);

      const result: ReceiptOcrData = {
        vendorName: parsed2.vendor_name ?? undefined,
        vendorAddress: parsed2.vendor_address ?? undefined,
        vendorPhone: parsed2.vendor_phone ?? undefined,
        vendorStoreNumber: parsed2.vendor_store_number ?? undefined,
        vendorCity: parsed2.vendor_city ?? undefined,
        vendorState: parsed2.vendor_state ?? undefined,
        vendorZip: parsed2.vendor_zip ?? undefined,
        receiptDate: parsed2.receipt_date ?? undefined,
        receiptTime: parsed2.receipt_time ?? undefined,
        subtotal: typeof parsed2.subtotal === 'number' ? parsed2.subtotal : undefined,
        taxAmount: typeof parsed2.tax_amount === 'number' ? parsed2.tax_amount : undefined,
        totalAmount: typeof parsed2.total_amount === 'number' ? parsed2.total_amount : undefined,
        currency: parsed2.currency ?? 'USD',
        paymentMethod: parsed2.payment_method ?? undefined,
        lineItems: Array.isArray(parsed2.line_items)
          ? parsed2.line_items.map((item: any) => ({
              description: item.description ?? '',
              sku: item.sku ?? undefined,
              quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
              unitPrice: typeof item.unit_price === 'number' ? item.unit_price : undefined,
              amount: typeof item.amount === 'number' ? item.amount : undefined,
              category: item.category ?? undefined,
            }))
          : undefined,
        confidence: typeof parsed2.confidence === 'number' ? parsed2.confidence : 0.85,
        extractionNotes: `PDF text extraction (${parsed.numpages} page(s)). ${parsed2.extraction_notes || ''}`.trim(),
        rawResponse: content,
        pdfMetadata,
      };

      this.logger.log(
        `PDF receipt extracted: vendor=${result.vendorName ?? 'Unknown'}, total=$${result.totalAmount ?? 0}, items=${result.lineItems?.length ?? 0}`,
      );

      return result;
    } finally {
      await fsPromises.unlink(localPath).catch(() => {});
    }
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
        model: this.getVisionModel(),
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
        vendorPhone: parsed.vendor_phone ?? undefined,
        vendorStoreNumber: parsed.vendor_store_number ?? undefined,
        vendorCity: parsed.vendor_city ?? undefined,
        vendorState: parsed.vendor_state ?? undefined,
        vendorZip: parsed.vendor_zip ?? undefined,
        receiptDate: parsed.receipt_date ?? undefined,
        receiptTime: parsed.receipt_time ?? undefined,
        subtotal: typeof parsed.subtotal === 'number' ? parsed.subtotal : undefined,
        taxAmount: typeof parsed.tax_amount === 'number' ? parsed.tax_amount : undefined,
        totalAmount: typeof parsed.total_amount === 'number' ? parsed.total_amount : undefined,
        currency: parsed.currency ?? 'USD',
        paymentMethod: parsed.payment_method ?? undefined,
        lineItems: Array.isArray(parsed.line_items)
          ? parsed.line_items.map((item: any) => ({
              description: item.description ?? '',
              sku: item.sku ?? undefined,
              quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
              unitPrice: typeof item.unit_price === 'number' ? item.unit_price : undefined,
              amount: typeof item.amount === 'number' ? item.amount : undefined,
              category: item.category ?? undefined,
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
