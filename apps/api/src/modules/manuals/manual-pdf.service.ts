import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ManualRenderService } from "./manual-render.service";
import { NCC_LOGO_BASE64 } from "./logo.constants";
import * as crypto from "crypto";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import * as path from "path";
import * as os from "os";
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
      // Use system Chromium if PUPPETEER_EXECUTABLE_PATH is set (Docker/production)
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      
      this.browser = await puppeteer.launch({
        headless: true,
        ...(executablePath && { executablePath }),
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
      compactToc?: boolean;
      viewId?: string;
      userContext?: { userId: string; userName?: string };
    }
  ): Promise<Buffer> {
    // Get rendered HTML with user context for serialization
    const html = await this.renderService.renderManualHtml(manualId, {
      includeRevisionMarkers: true,
      includeToc: true,
      includeCoverPage: true,
      compactToc: options?.compactToc ?? false,
      viewId: options?.viewId,
      companyBranding: options?.companyBranding,
      userContext: options?.userContext,
    });

    // Generate PDF
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Set content and wait for load (including base64 images and external scripts like Mermaid)
      await page.setContent(html, {
        waitUntil: ["load", "networkidle0"],
      });

      // Wait for Mermaid diagrams to render (if any exist)
      const hasMermaid = await page.evaluate(`
        document.querySelectorAll('.mermaid').length > 0
      `);
      
      if (hasMermaid) {
        // Wait for Mermaid to signal it's done rendering (max 10 seconds)
        await page.evaluate(`
          new Promise((resolve) => {
            // Check if already rendered
            if (window.mermaidRendered) {
              resolve();
              return;
            }
            
            // Listen for the custom event
            const handler = () => {
              resolve();
            };
            document.addEventListener('mermaidRendered', handler, { once: true });
            
            // Timeout fallback
            setTimeout(() => {
              document.removeEventListener('mermaidRendered', handler);
              resolve();
            }, 10000);
          })
        `);
        
        // Additional small delay to ensure SVGs are fully painted
        await new Promise(r => setTimeout(r, 500));
      }

      // Wait for all images to load
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
      // Note: We rely on the HTML content for logo/watermark since headerTemplate
      // has issues with large base64 images. Page numbers use footerTemplate.
      const pdfBuffer = await page.pdf({
        format: "letter",
        printBackground: true,
        preferCSSPageSize: false,
        margin: {
          top: "0.6in",
          right: "0.6in",
          bottom: "1in", // Extra space for footer
          left: "0.6in",
        },
        displayHeaderFooter: true,
        headerTemplate: `<div></div>`,
        footerTemplate: `
          <div style="width: 100%; font-size: 8px; padding: 0 0.5in; text-align: center; border-top: 1px solid #ddd; padding-top: 8px;">
            <div style="color: #dc3545; font-weight: 600; font-size: 7px; letter-spacing: 0.5px; margin-bottom: 2px;">CONFIDENTIAL &amp; PROPRIETARY</div>
            <div style="color: #666; font-size: 6px; margin-bottom: 4px;">This document contains confidential information belonging to Nexus Group. Unauthorized distribution prohibited.</div>
            <div style="display: flex; justify-content: space-between; color: #888;">
              <span style="font-size: 7px;"><span class="date"></span></span>
              <span style="font-size: 8px;">Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
            </div>
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

  // =========================================================================
  // DRM-Protected PDF Generation
  // =========================================================================

  /**
   * Generate a DRM-protected PDF for a share link recipient.
   * - Watermarks every page with recipient info (diagonal + serial stamp)
   * - Embeds forensic serial number in PDF metadata
   * - Adds verification URL to each page
   * - Encrypts with AES-256 (user password to open, owner password for full control)
   * - Restricts printing, copying, editing, extraction
   */
  async generateSecurePdf(
    manualId: string,
    recipient: {
      name: string;
      email: string;
      serialNumber: string;
      userPassword: string;
    },
    options?: { title?: string; compactToc?: boolean; viewId?: string },
  ): Promise<{ buffer: Buffer; filename: string }> {
    // 1. Generate base PDF using existing pipeline
    const basePdf = await this.generatePdf(manualId, {
      compactToc: options?.compactToc,
      viewId: options?.viewId,
      userContext: { userId: "share", userName: recipient.name },
    });

    // 2. Load PDF with pdf-lib for watermarking + metadata injection
    const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
    const pdfDoc = await PDFDocument.load(basePdf);

    // Set forensic metadata
    pdfDoc.setTitle(options?.title || "Nexus Document");
    pdfDoc.setAuthor("Nexus Group");
    pdfDoc.setCreator("Nexus Document System");
    pdfDoc.setProducer(`NXS-DRM | Serial: ${recipient.serialNumber}`);
    pdfDoc.setKeywords([recipient.serialNumber, recipient.email, "CONFIDENTIAL"]);
    pdfDoc.setSubject(`Licensed to: ${recipient.name} (${recipient.email})`);

    // Add watermark to every page
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();

      // Diagonal watermark — recipient identity
      page.drawText(
        `Licensed to: ${recipient.name} | ${recipient.email}`,
        {
          x: width * 0.08,
          y: height * 0.52,
          size: 18,
          font,
          color: rgb(0.85, 0.85, 0.85),
          opacity: 0.12,
          rotate: degrees(-35),
        },
      );

      // Diagonal watermark — serial number
      page.drawText(
        `Serial: ${recipient.serialNumber}`,
        {
          x: width * 0.15,
          y: height * 0.44,
          size: 14,
          font,
          color: rgb(0.85, 0.85, 0.85),
          opacity: 0.12,
          rotate: degrees(-35),
        },
      );

      // Bottom-right serial stamp (visible but unobtrusive)
      page.drawText(recipient.serialNumber, {
        x: width - 180,
        y: 15,
        size: 7,
        font,
        color: rgb(0.7, 0.7, 0.7),
        opacity: 0.3,
      });

      // Bottom-left verification URL
      page.drawText(
        `Verify: staging-ncc.nfsgrp.com/verify/${recipient.serialNumber}`,
        {
          x: 30,
          y: 15,
          size: 6,
          font,
          color: rgb(0.75, 0.75, 0.75),
          opacity: 0.25,
        },
      );
    }

    // 3. Save watermarked PDF
    const watermarkedPdf = Buffer.from(await pdfDoc.save());

    // 4. Encrypt with qpdf (AES-256, no-print/no-copy/no-edit)
    let finalPdf: Buffer;
    try {
      finalPdf = await this.encryptPdf(watermarkedPdf, {
        userPassword: recipient.userPassword,
        ownerPassword: crypto.randomBytes(16).toString("hex"),
      });
    } catch (err: any) {
      this.logger.warn(
        `PDF encryption failed (qpdf may not be installed): ${err?.message}. Returning watermarked PDF without encryption.`,
      );
      finalPdf = watermarkedPdf;
    }

    // 5. Generate filename with serial
    const baseFilename = this.generateFilename(options?.title || "Nexus Document");
    const filename = baseFilename.replace(".pdf", ` [${recipient.serialNumber}].pdf`);

    return { buffer: finalPdf, filename };
  }

  /**
   * Encrypt a PDF buffer using qpdf with AES-256 encryption.
   * Sets owner password (full control) and user password (view-only).
   * Restricts: print, modify, extract, annotate.
   */
  private async encryptPdf(
    buffer: Buffer,
    passwords: { userPassword: string; ownerPassword: string },
  ): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const ts = Date.now();
    const inputPath = path.join(tmpDir, `nexus-drm-${ts}-in.pdf`);
    const outputPath = path.join(tmpDir, `nexus-drm-${ts}-out.pdf`);

    try {
      await writeFile(inputPath, buffer);

      await new Promise<void>((resolve, reject) => {
        execFile(
          "qpdf",
          [
            "--encrypt",
            passwords.userPassword,
            passwords.ownerPassword,
            "256",
            "--print=none",
            "--modify=none",
            "--extract=n",
            "--annotate=n",
            "--",
            inputPath,
            outputPath,
          ],
          (error, _stdout, stderr) => {
            if (error) {
              reject(new Error(`qpdf encryption failed: ${stderr || error.message}`));
            } else {
              resolve();
            }
          },
        );
      });

      return await readFile(outputPath);
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }
}
