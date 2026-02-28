/**
 * folder-scanner.ts
 *
 * Scans a Buildertrend export folder and categorizes all files.
 * Auto-detects project topology (multi-site, per-unit, single-job).
 */

import fs from "node:fs";
import path from "node:path";
import type { BtFolderScanResult, BtProjectTopology } from "./bt-import.types";

const MEDIA_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".mp4", ".mov", ".heic", ".heif"]);
const DAILY_LOG_RE = /daily\s*log\s*print/i;
const BILLS_CSV_RE = /bills\.csv$/i;
const INVOICES_XLS_RE = /invoices?\.xls$/i;
const VENDOR_PAY_RE = /vendoremployeepayments\.csv$/i;
const CHASE_RE = /chase.*activity.*\.csv$/i;
const PURCHASE_HIST_RE = /purchase_history.*\.csv$/i;

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

function detectTopology(jobNames: string[]): BtProjectTopology {
  if (jobNames.length === 0) return "single-job";

  // Per-unit: most job names contain "Unit NN"
  const unitRe = /unit\s*\d+/i;
  const unitCount = jobNames.filter((n) => unitRe.test(n)).length;
  if (unitCount > 2) return "per-unit";

  // Multi-site: multiple distinct site codes (CBS/CCT/SR or different base names)
  if (jobNames.length >= 3) return "multi-site";

  return "single-job";
}

/** Extract BT job names from Daily Log PDF filenames. */
function extractJobNamesFromPdfNames(pdfPaths: string[]): string[] {
  const names = new Set<string>();
  for (const p of pdfPaths) {
    const base = path.basename(p, ".pdf");
    // Strip "Daily Log Print" suffix and leading prefix
    const cleaned = base.replace(/\s*daily\s*log\s*print\s*/i, "").trim();
    if (cleaned) names.add(cleaned);
  }
  return [...names];
}

export function scanBtFolder(
  sourceDir: string,
  opts?: { includeParentMedia?: boolean },
): BtFolderScanResult {
  const allFiles = walkDir(sourceDir);

  const dailyLogPdfs: string[] = [];
  let billsCsvPath: string | null = null;
  const invoiceXlsPaths: string[] = [];
  const paymentsCsvPaths: string[] = [];
  const bankCsvPaths: string[] = [];
  const purchasesCsvPaths: string[] = [];
  const zipPaths: string[] = [];
  const extractedDirs: string[] = [];
  const looseMediaPaths: string[] = [];
  const otherFiles: string[] = [];

  for (const f of allFiles) {
    const base = path.basename(f);
    const ext = path.extname(f).toLowerCase();

    if (ext === ".pdf" && DAILY_LOG_RE.test(base)) {
      dailyLogPdfs.push(f);
    } else if (BILLS_CSV_RE.test(base)) {
      billsCsvPath = f;
    } else if (INVOICES_XLS_RE.test(base)) {
      invoiceXlsPaths.push(f);
    } else if (VENDOR_PAY_RE.test(base)) {
      paymentsCsvPaths.push(f);
    } else if (CHASE_RE.test(base)) {
      bankCsvPaths.push(f);
    } else if (PURCHASE_HIST_RE.test(base)) {
      purchasesCsvPaths.push(f);
    } else if (ext === ".zip") {
      zipPaths.push(f);
    } else if (MEDIA_EXTS.has(ext)) {
      looseMediaPaths.push(f);
    } else {
      otherFiles.push(f);
    }
  }

  // Detect pre-extracted directories: if a directory exists with a name
  // similar to a zip (minus .zip), it's a pre-extracted dir.
  for (const z of zipPaths) {
    const dirName = z.replace(/\.zip$/i, "");
    if (fs.existsSync(dirName) && fs.statSync(dirName).isDirectory()) {
      extractedDirs.push(dirName);
    }
  }

  // Optionally scan parent directory for loose media (Sheraton pattern)
  if (opts?.includeParentMedia) {
    const parentDir = path.dirname(sourceDir);
    const parentFiles = walkDir(parentDir).filter(
      (f) => !f.startsWith(sourceDir) && MEDIA_EXTS.has(path.extname(f).toLowerCase()),
    );
    looseMediaPaths.push(...parentFiles);
  }

  const jobNames = extractJobNamesFromPdfNames(dailyLogPdfs);
  const topology = detectTopology(jobNames);

  return {
    topology,
    jobNames,
    dailyLogPdfs,
    billsCsvPath,
    invoiceXlsPaths,
    paymentsCsvPaths,
    bankCsvPaths,
    purchasesCsvPaths,
    zipPaths,
    extractedDirs,
    looseMediaPaths,
    otherFiles,
  };
}
