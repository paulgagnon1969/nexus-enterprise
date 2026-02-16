import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ManualRenderService } from "./manual-render.service";
import { NCC_LOGO_BASE64 } from "./logo.constants";
import type { Browser, Page } from "puppeteer";

// Dynamically import puppeteer to avoid issues if not installed
let puppeteer: typeof import("puppeteer") | null = null;

@Injectable()
export class ManualPdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ManualPdfService.name);
  private browser: Browser | null = null;

  constructor(private readonly renderService: ManualRenderService) {}

  async onModuleInit() {
    try {
      puppeteer = await import("puppeteer");
      this.logger.log("Puppeteer loaded successfully");
    } catch (e) {
      this.logger.warn(
        "Puppeteer not available - PDF generation will be disabled. Install with: npm install puppeteer"
      );
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Check if PDF generation is available
   */
  isAvailable(): boolean {
    return puppeteer !== null;
  }

  /**
   * Get or create browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!puppeteer) {
      throw new Error("Puppeteer is not installed. Run: npm install puppeteer");
    }

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }

    return this.browser;
  }

  /**
   * Generate PDF buffer for a manual
   */
  async generatePdf(
    manualId: string,
    options?: {
      companyBranding?: { name?: string; logoUrl?: string };
      userContext?: { userId: string; userName?: string };
    }
  ): Promise<Buffer> {
    // Get rendered HTML with user context for serialization
    const html = await this.renderService.renderManualHtml(manualId, {
      includeRevisionMarkers: true,
      includeToc: true,
      includeCoverPage: true,
      companyBranding: options?.companyBranding,
      userContext: options?.userContext,
    });

    // Generate PDF
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Set content and wait for load (including base64 images)
      await page.setContent(html, {
        waitUntil: ["load", "networkidle0"],
      });

      // Additional wait to ensure base64 images are rendered
      await page.evaluate(`
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map((img) => new Promise((resolve) => {
              img.onload = img.onerror = resolve;
            }))
        )
      `);

      // Generate PDF with print settings
      const pdfBuffer = await page.pdf({
        format: "letter",
        printBackground: true,
        preferCSSPageSize: false,
        margin: {
          top: "1in",
          right: "0.75in",
          bottom: "0.75in",
          left: "0.75in",
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width: 100%; font-size: 9px; padding: 0 0.5in; display: flex; align-items: center; justify-content: space-between;">
            <img src="${NCC_LOGO_BASE64}" style="height: 24px;" />
            <span style="color: #666; font-size: 8px;">Official Documentation</span>
          </div>
        `,
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; color: #888; padding: 0 0.5in; display: flex; justify-content: space-between;">
            <span style="color: #999; font-size: 7px;">Confidential &amp; Proprietary</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        `,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  /**
   * Generate a filename for the PDF
   * Format: "Manual Name - yyyy.mm.dd.pdf"
   */
  generateFilename(manualTitle: string, _version?: number): string {
    // Sanitize the title: keep alphanumeric, spaces, and common punctuation
    const safeName = manualTitle
      .replace(/[<>:"/\\|?*]/g, "") // Remove filesystem-unsafe characters
      .trim();
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dateStr = `${year}.${month}.${day}`;
    
    return `${safeName} - ${dateStr}.pdf`;
  }
}
