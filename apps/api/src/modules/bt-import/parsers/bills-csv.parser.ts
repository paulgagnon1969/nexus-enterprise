/**
 * bills-csv.parser.ts
 *
 * Parses native Buildertrend Bills CSV export.
 * Format: header rows, then: Job, Bill #, Bill Title, Pay To, Bill Amount, ...
 */

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import type { BtBill } from "../bt-import.types";

function parseMoney(raw: string | undefined): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/[$,]/g, "")) || 0;
}

function parseOptionalDate(raw: string | undefined): Date | null {
  if (!raw || raw === "-" || raw.trim() === "") return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function parseBillsCsv(csvPath: string): BtBill[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n");

  // Find the header row (starts with "Job,Bill #")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i]!.startsWith("Job,") || lines[i]!.includes("Bill #")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  // Parse from header row onward
  const csvData = lines.slice(headerIdx).join("\n");
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const bills: BtBill[] = [];
  for (const row of records) {
    const jobName = row["Job"]?.trim();
    if (!jobName) continue; // subtotal row

    const amount = parseMoney(row["Bill Amount"]);
    if (amount === 0) continue;

    bills.push({
      jobName,
      billNumber: row["Bill #"]?.trim() || null,
      billTitle: row["Bill Title"]?.trim() || null,
      vendorName: row["Pay To"]?.trim() || "Unknown Vendor",
      totalAmount: amount,
      invoiceDate: parseOptionalDate(row["Invoice Date"]),
      dueDate: parseOptionalDate(row["Due Date"]),
      status: row["Bill Status"]?.trim() || "Unknown",
      createdDate: parseOptionalDate(row["Created Date"]),
      costCodes: (row["Cost Codes"] || "")
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean),
      fileCount: parseInt(row["Files"] || "0") || 0,
      source: csvPath,
    });
  }

  return bills;
}
