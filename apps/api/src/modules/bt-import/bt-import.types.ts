/**
 * bt-import.types.ts
 *
 * Shared interfaces for the Buildertrend → NCC migration tool.
 */

// ── Parsed data types ───────────────────────────────────────────────────

export interface BtDailyLogEntry {
  /** Raw date string from the PDF header, e.g. "Jan 23, 2026" */
  dateRaw: string;
  /** Parsed JS Date */
  logDate: Date;
  /** BT job name, e.g. "NEX - TAP - CBS - Crystal Boarding School NM" */
  jobName: string;
  /** Optional title */
  title: string | null;
  /** Author name, e.g. "Tyler Gagnon" */
  addedBy: string;
  /** Free-text log notes */
  logNotes: string;
  /** Weather block (raw text) */
  weatherRaw: string | null;
  /** Parsed weather JSON */
  weatherJson: Record<string, any> | null;
  /** Tags (e.g. "# # Work Delay / Stoppage") */
  tags: string[];
  /** Attachment count from the PDF */
  attachmentCount: number;
  /** Source PDF filename */
  sourcePdf: string;
}

export interface BtBill {
  jobName: string;
  billNumber: string | null;
  billTitle: string | null;
  vendorName: string;
  totalAmount: number;
  invoiceDate: Date | null;
  dueDate: Date | null;
  status: string;
  createdDate: Date | null;
  costCodes: string[];
  fileCount: number;
  /** Source file (CSV row or HD CSV transaction) */
  source: string;
}

export interface BtInvoice {
  jobName: string;
  invoiceNumber: string | null;
  description: string | null;
  amount: number;
  date: Date | null;
  status: string;
  source: string;
}

export interface BtPayment {
  payTo: string;
  payFrom: string;
  amount: number;
  sendDate: Date | null;
  deliverDate: Date | null;
  status: string;
  referenceNumber: string | null;
  source: string;
}

export interface BtFileEntry {
  /** Absolute local path */
  localPath: string;
  /** Original filename */
  fileName: string;
  /** Detected MIME type */
  mimeType: string | null;
  /** File size in bytes */
  sizeBytes: number;
  /** Category for folder placement */
  category: BtFileCategory;
  /** Which BT job this is associated with (if known) */
  jobName: string | null;
  /** SHA-256 content hash for dedup */
  contentHash: string | null;
}

export type BtFileCategory =
  | "daily-logs"
  | "bills-receipts"
  | "invoices"
  | "messages"
  | "drawings"
  | "client-uploads"
  | "media"
  | "surveys"
  | "correspondence"
  | "other";

// ── Project structure detection ─────────────────────────────────────────

export type BtProjectTopology = "multi-site" | "per-unit" | "single-job";

export interface BtFolderScanResult {
  topology: BtProjectTopology;
  /** All unique BT job names found */
  jobNames: string[];
  /** Daily Log PDF paths */
  dailyLogPdfs: string[];
  /** Bills CSV (native BT export) */
  billsCsvPath: string | null;
  /** Invoice XLS paths */
  invoiceXlsPaths: string[];
  /** Payments CSV paths (VendorEmployeePayments) */
  paymentsCsvPaths: string[];
  /** Bank CSV paths (Chase activity) */
  bankCsvPaths: string[];
  /** HD Purchase History CSV paths */
  purchasesCsvPaths: string[];
  /** ZIP archive paths */
  zipPaths: string[];
  /** Pre-extracted subdirectories (alongside zips) */
  extractedDirs: string[];
  /** Loose media files (JPG/MOV/MP4/PNG not in zips) */
  looseMediaPaths: string[];
  /** All other files */
  otherFiles: string[];
}

// ── Import configuration ────────────────────────────────────────────────

export interface BtImportConfig {
  sourceDir: string;
  companyId: string;
  dryRun: boolean;
  skipFiles: boolean;
  /** Include parent directory for loose media (Sheraton pattern) */
  includeParentMedia: boolean;
  /** Map of BT author name → NCC userId */
  authorMap: Record<string, string>;
  /** Fallback userId for unmapped authors */
  fallbackUserId: string;
  /** Project group label override */
  projectGroupLabel?: string;
}

// ── Import result summary ───────────────────────────────────────────────

export interface BtImportResult {
  projectGroupId: string | null;
  projects: { id: string; name: string; btJobNames: string[] }[];
  counts: {
    dailyLogs: number;
    bills: number;
    invoices: number;
    payments: number;
    files: number;
    filesDeduped: number;
  };
  errors: string[];
}
