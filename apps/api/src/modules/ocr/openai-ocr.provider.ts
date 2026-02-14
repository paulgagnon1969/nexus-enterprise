import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OcrProvider, ReceiptOcrData } from './ocr-provider.interface';

const RECEIPT_EXTRACTION_PROMPT = `You are a receipt OCR system. Extract the following data from this receipt image and return ONLY valid JSON (no markdown, no explanation):

{
  "vendor_name": "Store/business name",
  "vendor_address": "Full address if visible",
  "receipt_date": "YYYY-MM-DD format",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "currency": "USD",
  "payment_method": "CASH or CARD or CHECK or OTHER",
  "line_items": [
    {"description": "Item name", "quantity": 1, "unit_price": 0.00, "amount": 0.00}
  ],
  "confidence": 0.95
}

Rules:
- All amounts should be numbers (not strings)
- Date must be ISO format (YYYY-MM-DD)
- If a field is not visible/readable, omit it or use null
- Confidence should be 0-1 based on image quality and readability
- Return ONLY the JSON object, nothing else`;

@Injectable()
export class OpenAiOcrProvider implements OcrProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiOcrProvider.name);
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

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

  async extractReceipt(imageUrl: string): Promise<ReceiptOcrData> {
    const client = this.getClient();

    this.logger.log(`Extracting receipt data from: ${imageUrl.substring(0, 50)}...`);

    try {
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
                  url: imageUrl,
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
        rawResponse: content,
      };

      this.logger.log(
        `Receipt extracted: ${result.vendorName ?? 'Unknown'} - $${result.totalAmount ?? 0}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(`OCR extraction failed: ${error?.message ?? error}`);
      throw error;
    }
  }
}
