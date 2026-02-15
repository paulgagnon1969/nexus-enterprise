/**
 * Receipt OCR Provider Interface
 * Abstraction layer for different OCR providers (OpenAI, AWS Textract, Google Document AI, etc.)
 */

export interface ReceiptLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
}

export interface ReceiptOcrData {
  vendorName?: string;
  vendorAddress?: string;
  receiptDate?: string; // ISO date string
  subtotal?: number;
  taxAmount?: number;
  totalAmount?: number;
  currency?: string;
  paymentMethod?: string; // "CASH", "CARD", "CHECK", "OTHER"
  lineItems?: ReceiptLineItem[];
  confidence?: number; // 0-1 overall confidence score
  extractionNotes?: string; // Notes about image quality or extraction issues
  rawResponse?: string; // Raw provider response for audit
}

export interface OcrProvider {
  readonly name: string;

  /**
   * Extract receipt data from an image URL
   * @param imageUrl - Public URL of the receipt image
   * @returns Extracted receipt data
   */
  extractReceipt(imageUrl: string): Promise<ReceiptOcrData>;
}
