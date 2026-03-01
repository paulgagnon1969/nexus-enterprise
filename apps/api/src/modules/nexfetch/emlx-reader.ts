/**
 * NexFetch — EMLX file reader.
 *
 * macOS Mail stores emails as `.emlx` (or `.partial.emlx`) files.
 * Format:  first line is the byte count of the RFC 822 message,
 *          followed by the raw email, then an Apple plist trailer.
 *
 * This module reads an .emlx file and extracts:
 *   - HTML body (for vendor-specific parsing)
 *   - Email metadata (from, subject, date, message-id)
 *   - Auto-detects vendor from sender address
 */

import * as fs from "fs";
import * as path from "path";
import { simpleParser, ParsedMail } from "mailparser";
import type { VendorId } from "./parsers/types";

// ── Types ────────────────────────────────────────────────────────────

export interface EmlxResult {
  /** Full HTML body of the email */
  html: string;
  /** Plain-text body (fallback if no HTML) */
  text: string | null;
  /** Sender email address */
  from: string;
  /** Email subject */
  subject: string;
  /** Date the email was sent */
  date: Date;
  /** IMAP Message-ID header (for de-duplication) */
  messageId: string | null;
  /** Detected vendor based on sender address */
  vendor: VendorId | null;
  /** Original filename */
  fileName: string;
}

// ── Vendor detection ─────────────────────────────────────────────────

const VENDOR_MAP: Array<{ pattern: RegExp; vendor: VendorId }> = [
  { pattern: /homedepot\.com/i, vendor: "HOME_DEPOT" },
  { pattern: /lowes\.com/i, vendor: "LOWES" },
];

function detectVendor(from: string): VendorId | null {
  for (const { pattern, vendor } of VENDOR_MAP) {
    if (pattern.test(from)) return vendor;
  }
  return null;
}

// ── Reader ───────────────────────────────────────────────────────────

/**
 * Read a single .emlx file and extract its contents.
 */
export async function readEmlxFile(filePath: string): Promise<EmlxResult> {
  const raw = await fs.promises.readFile(filePath);

  // The first line is the byte count of the RFC 822 portion.
  // Find the first newline to skip it.
  const firstNewline = raw.indexOf(0x0a); // \n
  if (firstNewline < 0) {
    throw new Error(`Invalid .emlx file (no newline found): ${filePath}`);
  }

  // The RFC 822 message starts after the first line
  const emailBytes = raw.subarray(firstNewline + 1);

  // Parse with mailparser
  const parsed: ParsedMail = await simpleParser(emailBytes);

  const from = parsed.from?.value?.[0]?.address || "";
  const subject = parsed.subject || "";
  const date = parsed.date || new Date();
  const messageId = parsed.messageId || null;

  // Extract HTML body
  let html = "";
  if (parsed.html && typeof parsed.html === "string") {
    html = parsed.html;
  } else if (parsed.textAsHtml) {
    html = parsed.textAsHtml;
  }

  const text = parsed.text || null;

  return {
    html,
    text,
    from,
    subject,
    date,
    messageId,
    vendor: detectVendor(from),
    fileName: path.basename(filePath),
  };
}

/**
 * Scan a directory for .emlx files (non-recursive).
 */
export async function listEmlxFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dirPath);
  return entries
    .filter((e) => e.endsWith(".emlx"))
    .sort()
    .map((e) => path.join(dirPath, e));
}
