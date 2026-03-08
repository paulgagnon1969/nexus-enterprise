// ---------------------------------------------------------------------------
// Processor: receipt-ocr
// ---------------------------------------------------------------------------
// Receives a receipt image (base64 or URL), runs OCR locally via the
// Tauri pdf-extract crate for PDFs or sends to a lightweight local
// Tesseract process for images. Falls back to API-based OCR if local
// processing isn't available.
// ---------------------------------------------------------------------------

import { fetch } from "@tauri-apps/plugin-http";
import { getCachedToken, getCachedApiUrl } from "../auth";
import type { JobProcessor } from "../mesh-job-runner";

interface ReceiptOcrPayload {
  /** Base64-encoded image data */
  imageBase64?: string;
  /** URL to fetch the image from */
  imageUrl?: string;
  /** MIME type of the image */
  mimeType?: string;
  /** Receipt ID in the database (for result association) */
  receiptId?: string;
}

interface OcrResult {
  receiptId?: string;
  vendor: string | null;
  date: string | null;
  total: number | null;
  currency: string | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    amount: number | null;
  }>;
  rawText: string;
  confidence: number;
}

export const receiptOcrProcessor: JobProcessor = {
  canHandle(type: string): boolean {
    return type === "receipt-ocr";
  },

  async process(
    jobId: string,
    _type: string,
    payload: Record<string, unknown>,
    onProgress: (pct: number, message?: string) => void,
  ): Promise<Record<string, unknown>> {
    const p = payload as unknown as ReceiptOcrPayload;
    onProgress(10, "Preparing image for OCR");

    // Get image data — either from base64 or download from URL
    let imageData: string;
    if (p.imageBase64) {
      imageData = p.imageBase64;
    } else if (p.imageUrl) {
      onProgress(20, "Downloading receipt image");
      const res = await fetch(p.imageUrl);
      const buffer = await res.arrayBuffer();
      imageData = arrayBufferToBase64(buffer);
    } else {
      throw new Error("No image data provided (need imageBase64 or imageUrl)");
    }

    onProgress(40, "Running OCR extraction");

    // For now, delegate OCR to the API's existing endpoint.
    // In a future iteration, we can run Tesseract locally via a Tauri sidecar.
    const token = getCachedToken();
    const apiUrl = getCachedApiUrl();

    if (!token) throw new Error("Not authenticated — cannot call OCR API");

    const res = await fetch(`${apiUrl}/receipts/ocr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image: imageData,
        mimeType: p.mimeType || "image/jpeg",
        source: "mesh-client",
        jobId,
      }),
    });

    onProgress(80, "Processing OCR results");

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`OCR API error ${res.status}: ${errText}`);
    }

    const result: OcrResult = await res.json();

    // Attach the receiptId if provided
    if (p.receiptId) {
      result.receiptId = p.receiptId;
    }

    onProgress(100, "OCR complete");

    return result as unknown as Record<string, unknown>;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
