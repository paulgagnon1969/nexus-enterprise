import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ManualRenderService } from "./manual-render.service";
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
    }
  ): Promise<Buffer> {
    // Get rendered HTML
    const html = await this.renderService.renderManualHtml(manualId, {
      includeRevisionMarkers: true,
      includeToc: true,
      includeCoverPage: true,
      companyBranding: options?.companyBranding,
    });

    // Generate PDF
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Set content and wait for load
      await page.setContent(html, {
        waitUntil: ["load", "networkidle0"],
      });

      // Generate PDF with print settings
      const pdfBuffer = await page.pdf({
        format: "letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: "0.75in",
          right: "0.75in",
          bottom: "1in",
          left: "0.75in",
        },
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; color: #888; padding: 0 0.75in; display: flex; justify-content: space-between;">
            <span class="title"></span>
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
   */
  generateFilename(manualTitle: string, version: number): string {
    const safeName = manualTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    
    const date = new Date().toISOString().split("T")[0];
    return `${safeName}-v${version}-${date}.pdf`;
  }
}
