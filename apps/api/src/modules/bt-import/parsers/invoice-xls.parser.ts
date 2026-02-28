/**
 * invoice-xls.parser.ts
 *
 * Parses Buildertrend Invoice XLS exports.
 */

import * as XLSX from "xlsx";
import type { BtInvoice } from "../bt-import.types";

function parseMoney(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/[$,]/g, "")) || 0;
  return 0;
}

function parseOptionalDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    return new Date(d.y, d.m - 1, d.d);
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? null : d;
}

export function parseInvoiceXls(xlsPath: string): BtInvoice[] {
  const workbook = XLSX.readFile(xlsPath);
  const invoices: BtInvoice[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]!;
    // BT XLS exports have a title row, a blank row, then the header row.
    // Use array-of-arrays to find the header row dynamically.
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" });

    // Find the header row (first row that contains "Job" and "Total Price" or "Amount")
    let headerIdx = -1;
    let headers: string[] = [];
    for (let r = 0; r < Math.min(10, aoa.length); r++) {
      const row = (aoa[r] as any[]).map((c: any) => String(c).trim());
      if (row.includes("Job") && (row.includes("Total Price") || row.includes("Amount") || row.includes("Invoice Amount"))) {
        headerIdx = r;
        headers = row;
        break;
      }
    }

    if (headerIdx === -1) {
      console.warn(`[invoice-xls] No header row found in sheet "${sheetName}" of ${xlsPath}`);
      continue;
    }

    // Map column indices
    const col = (name: string) => headers.indexOf(name);
    const jobCol = col("Job");
    const idCol = col("ID#") !== -1 ? col("ID#") : col("Invoice #");
    const titleCol = col("Title") !== -1 ? col("Title") : col("Description");
    const statusCol = col("Status");
    const totalCol = col("Total Price") !== -1 ? col("Total Price") : col("Amount");
    const deadlineCol = col("Deadline");
    const datePaidCol = col("Date Paid");

    // Parse data rows
    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const row = aoa[r] as any[];
      if (!row || row.length === 0) continue;

      const amount = totalCol !== -1 ? parseMoney(row[totalCol]) : 0;
      if (amount === 0) continue;

      const jobName = jobCol !== -1 ? String(row[jobCol] || "").trim() : sheetName;
      if (!jobName || jobName === "Totals" || jobName === "Total") continue; // skip summary rows

      invoices.push({
        jobName: jobName || "Unknown",
        invoiceNumber: idCol !== -1 ? String(row[idCol] || "").trim() || null : null,
        description: titleCol !== -1 ? String(row[titleCol] || "").trim() || null : null,
        amount,
        date: deadlineCol !== -1 ? parseOptionalDate(row[deadlineCol]) :
              datePaidCol !== -1 ? parseOptionalDate(row[datePaidCol]) : null,
        status: statusCol !== -1 ? String(row[statusCol] || "ISSUED").trim() : "ISSUED",
        source: xlsPath,
      });
    }
  }

  return invoices;
}
