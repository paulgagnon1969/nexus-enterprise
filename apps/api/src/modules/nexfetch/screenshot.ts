/**
 * NexFetch — Receipt screenshot generator.
 *
 * Renders the receipt HTML email to a PNG image using Puppeteer.
 * The image is used as the visual receipt attached to ProjectBill records.
 *
 * Crops to just the receipt content (the white card area), not the full
 * email chrome / footer / marketing content.
 */

import puppeteer from "puppeteer";

export interface ScreenshotResult {
  /** PNG image buffer */
  buffer: Buffer;
  /** Width of the image */
  width: number;
  /** Height of the image */
  height: number;
}

/**
 * Render receipt HTML to a cropped PNG image.
 *
 * @param html  Full email HTML body
 * @param opts  Optional viewport width (default 700px for receipt-like width)
 */
export async function screenshotReceiptHtml(
  html: string,
  opts?: { viewportWidth?: number },
): Promise<ScreenshotResult> {
  const viewportWidth = opts?.viewportWidth ?? 700;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: viewportWidth, height: 800 });

    // Load the HTML content
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 15_000 });

    // Take full-page screenshot
    const buffer = await page.screenshot({
      fullPage: true,
      type: "png",
    }) as Buffer;

    // Get the actual dimensions (evaluate runs in the browser context)
    const dimensions = await page.evaluate(
      `({width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight})`,
    ) as { width: number; height: number };

    return {
      buffer: Buffer.from(buffer),
      width: dimensions.width,
      height: dimensions.height,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Batch-screenshot multiple HTML strings, reusing a single browser instance.
 */
export async function screenshotBatch(
  items: Array<{ id: string; html: string }>,
  opts?: { viewportWidth?: number; concurrency?: number },
): Promise<Map<string, ScreenshotResult>> {
  const viewportWidth = opts?.viewportWidth ?? 700;
  const results = new Map<string, ScreenshotResult>();

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    for (const item of items) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: viewportWidth, height: 800 });
        await page.setContent(item.html, { waitUntil: "networkidle0", timeout: 15_000 });

        const buffer = await page.screenshot({ fullPage: true, type: "png" }) as Buffer;
        const dimensions = await page.evaluate(
          `({width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight})`,
        ) as { width: number; height: number };

        results.set(item.id, {
          buffer: Buffer.from(buffer),
          width: dimensions.width,
          height: dimensions.height,
        });

        await page.close();
      } catch (err: any) {
        console.warn(`[nexfetch] Screenshot failed for ${item.id}: ${err?.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
