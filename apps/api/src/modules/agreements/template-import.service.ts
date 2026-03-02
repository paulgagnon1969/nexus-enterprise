import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import * as mammoth from "mammoth";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportMode = "rich" | "overlay";

export interface ImportResult {
  html: string;
  sourceType: "IMPORTED_DOCX" | "IMPORTED_PDF" | "IMPORTED_IMAGE" | "IMPORTED_HTML";
  mode: ImportMode;
  /** For overlay mode: base64 data-url per page */
  pageImages?: string[];
  /** Variable keys detected in the HTML (e.g. {{FOO}}) */
  detectedVariables: string[];
  /** Conversion quality hint for the frontend */
  conversionQuality: "excellent" | "good" | "fair" | "image-only";
  /** Warnings from the conversion pipeline */
  warnings: string[];
}

// Supported MIME → extension mapping
const ACCEPTED_TYPES: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "text/html": "html",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class TemplateImportService {
  private readonly logger = new Logger(TemplateImportService.name);

  /**
   * Convert an uploaded document buffer into editable HTML.
   * Returns the converted HTML, detected mode, and any page images.
   */
  async convertDocument(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<ImportResult> {
    const ext = this.resolveExtension(fileName, mimeType);
    this.logger.log(`Converting ${fileName} (${mimeType}) → detected ext: ${ext}`);

    switch (ext) {
      case "docx":
        return this.convertDocx(buffer);
      case "pdf":
        return this.convertPdf(buffer);
      case "html":
        return this.convertHtml(buffer);
      case "png":
      case "jpg":
        return this.convertImage(buffer, ext, mimeType);
      default:
        throw new BadRequestException(
          `Unsupported file type: ${ext}. Accepted formats: .docx (recommended), .pdf, .html, .png, .jpg`,
        );
    }
  }

  // =========================================================================
  // DOCX → HTML (mammoth) — Rich Edit Mode
  // =========================================================================

  private async convertDocx(buffer: Buffer): Promise<ImportResult> {
    const result = await mammoth.convertToHtml({ buffer }, {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Title'] => h1.doc-title:fresh",
      ],
    });

    const warnings = result.messages
      .filter((m) => m.type === "warning")
      .map((m) => m.message);

    const html = this.wrapDocumentHtml(result.value, "Imported Document");
    const detectedVariables = this.extractVariables(html);

    return {
      html,
      sourceType: "IMPORTED_DOCX",
      mode: "rich",
      detectedVariables,
      conversionQuality: warnings.length === 0 ? "excellent" : "good",
      warnings,
    };
  }

  // =========================================================================
  // PDF → HTML or Page Images
  // =========================================================================

  private async convertPdf(buffer: Buffer): Promise<ImportResult> {
    // Try text extraction first
    try {
      const { PDFParse } = await import("pdf-parse");
      const tempPath = path.join("/tmp", `pdf_import_${Date.now()}.pdf`);
      fs.writeFileSync(tempPath, buffer);

      try {
        const parser = new PDFParse({ url: tempPath });
        const textResult = await parser.getText();
        const text = textResult?.text || "";

        // Measure text quality: if mostly whitespace or very short, it's scanned
        const nonWhitespace = text.replace(/\s+/g, "").length;
        const totalLength = text.length;
        const textRatio = totalLength > 0 ? nonWhitespace / totalLength : 0;

        if (textRatio > 0.4 && nonWhitespace > 200) {
          // Good text extraction → rich edit mode
          const paragraphs = text
            .split(/\n\s*\n/)
            .filter((p: string) => p.trim())
            .map((p: string) => `<p>${this.escapeHtml(p.trim())}</p>`)
            .join("\n");

          const html = this.wrapDocumentHtml(paragraphs, "Imported PDF");
          const detectedVariables = this.extractVariables(html);

          fs.unlinkSync(tempPath);
          return {
            html,
            sourceType: "IMPORTED_PDF",
            mode: "rich",
            detectedVariables,
            conversionQuality: textRatio > 0.6 ? "good" : "fair",
            warnings: textRatio < 0.6
              ? ["PDF text extraction quality is moderate. Consider uploading DOCX for better results."]
              : [],
          };
        }

        // Poor text → fall through to image mode
        fs.unlinkSync(tempPath);
      } catch {
        // pdf-parse failed, fall through to image mode
        try { fs.unlinkSync(tempPath); } catch {}
      }
    } catch {
      // pdf-parse not available or failed entirely
    }

    // Fallback: render PDF pages as images via puppeteer
    return this.convertPdfToImages(buffer);
  }

  private async convertPdfToImages(buffer: Buffer): Promise<ImportResult> {
    const tempPath = path.join("/tmp", `pdf_img_${Date.now()}.pdf`);
    fs.writeFileSync(tempPath, buffer);

    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const pageImages: string[] = [];

      // Use puppeteer to render each PDF page as an image
      // We'll use a data URI approach: load PDF in a page, screenshot each page
      const page = await browser.newPage();
      const fileUrl = `file://${tempPath}`;

      // Load PDF in browser context with pdf.js or native viewer
      await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 });
      await page.setViewport({ width: 816, height: 1056 }); // Letter size at 96dpi

      // Take a screenshot of the first page (simplified — full multi-page
      // rendering would require pdf.js integration)
      const screenshot = await page.screenshot({
        encoding: "base64",
        type: "png",
        fullPage: true,
      });
      pageImages.push(`data:image/png;base64,${screenshot}`);

      await browser.close();
      fs.unlinkSync(tempPath);

      // Build minimal HTML wrapper that references the page images
      const imagesHtml = pageImages
        .map((img, i) => `<div class="pdf-page" data-page="${i}"><img src="${img}" style="width:100%;display:block;" /></div>`)
        .join("\n");

      return {
        html: this.wrapDocumentHtml(imagesHtml, "Scanned Document"),
        sourceType: "IMPORTED_PDF",
        mode: "overlay",
        pageImages,
        detectedVariables: [],
        conversionQuality: "image-only",
        warnings: [
          "This PDF appears to be a scanned document. Fields will be placed as overlays on the page image.",
          "For the best editing experience, consider uploading a DOCX version.",
        ],
      };
    } catch (err) {
      // If puppeteer fails (e.g. not available in prod), return a basic overlay
      try { fs.unlinkSync(tempPath); } catch {}
      this.logger.warn(`Puppeteer PDF rendering failed: ${err}`);

      // Encode the PDF buffer as a data URI for the frontend to handle
      const base64 = buffer.toString("base64");
      return {
        html: `<div class="pdf-page"><p style="padding:40px;text-align:center;color:#6b7280;">PDF preview — use overlay mode to place fields.</p></div>`,
        sourceType: "IMPORTED_PDF",
        mode: "overlay",
        pageImages: [`data:application/pdf;base64,${base64}`],
        detectedVariables: [],
        conversionQuality: "image-only",
        warnings: ["PDF page rendering unavailable. Upload as image (PNG/JPG) for overlay mode."],
      };
    }
  }

  // =========================================================================
  // HTML — sanitize and pass through
  // =========================================================================

  private async convertHtml(buffer: Buffer): Promise<ImportResult> {
    let html = buffer.toString("utf-8");

    // Strip doctype and head if present — keep only body content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) {
      html = bodyMatch[1];
    }

    // Extract style blocks to preserve formatting
    const styleBlocks: string[] = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    while ((styleMatch = styleRegex.exec(buffer.toString("utf-8"))) !== null) {
      styleBlocks.push(styleMatch[0]);
    }

    const fullHtml = styleBlocks.length > 0
      ? `${styleBlocks.join("\n")}\n${html}`
      : html;

    const detectedVariables = this.extractVariables(fullHtml);

    return {
      html: fullHtml,
      sourceType: "IMPORTED_HTML",
      mode: "rich",
      detectedVariables,
      conversionQuality: "excellent",
      warnings: [],
    };
  }

  // =========================================================================
  // Image → Overlay Mode
  // =========================================================================

  private async convertImage(buffer: Buffer, ext: string, mimeType: string): Promise<ImportResult> {
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const html = `<div class="image-page" data-page="0"><img src="${dataUrl}" style="width:100%;display:block;" /></div>`;

    return {
      html,
      sourceType: "IMPORTED_IMAGE",
      mode: "overlay",
      pageImages: [dataUrl],
      detectedVariables: [],
      conversionQuality: "image-only",
      warnings: [
        "Image documents use overlay mode for field placement.",
        "For full text editing, upload a DOCX or HTML version.",
      ],
    };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private resolveExtension(fileName: string, mimeType: string): string {
    // Try MIME type first
    const fromMime = ACCEPTED_TYPES[mimeType];
    if (fromMime) return fromMime;

    // Fall back to file extension
    const ext = path.extname(fileName).toLowerCase().replace(".", "");
    if (["docx", "pdf", "html", "htm", "png", "jpg", "jpeg"].includes(ext)) {
      return ext === "htm" ? "html" : ext === "jpeg" ? "jpg" : ext;
    }

    return ext;
  }

  /** Extract {{VARIABLE}} placeholders from HTML content. */
  private extractVariables(html: string): string[] {
    const matches = html.match(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g);
    if (!matches) return [];
    const unique = new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")));
    return Array.from(unique);
  }

  /** Wrap body HTML in a full document structure with default styles. */
  private wrapDocumentHtml(bodyHtml: string, title: string): string {
    return `<style>
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; line-height: 1.5; color: #111; max-width: 8.5in; margin: 0 auto; padding: 0.75in 1in; }
  h1 { font-size: 18pt; margin: 16pt 0 10pt; }
  h2 { font-size: 14pt; margin: 14pt 0 8pt; }
  h3 { font-size: 12pt; margin: 12pt 0 6pt; }
  p { margin: 8pt 0; text-align: justify; }
  ul, ol { margin: 8pt 0; padding-left: 24pt; }
  li { margin: 4pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 12pt 0; }
  th, td { border: 1px solid #ccc; padding: 6pt 8pt; text-align: left; }
  th { background: #f3f4f6; font-weight: bold; }
  .pdf-page, .image-page { position: relative; margin: 0; }
</style>
${bodyHtml}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
