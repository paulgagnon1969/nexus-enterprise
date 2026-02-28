import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CsvImportSource } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// HD job-name normalizer (ported from scripts/hd-import/parse-hd-csv.ts)
// ---------------------------------------------------------------------------

interface MappingRule { pattern: string; normalized: string; }
interface JobNameMap { rules: MappingRule[]; exact_overrides: Record<string, string>; }

const jobNameMap: JobNameMap = JSON.parse(
  fs.readFileSync(path.join(__dirname, "job-name-map.json"), "utf8"),
);

const compiledRules = jobNameMap.rules.map((r) => ({
  regex: new RegExp(r.pattern, "i"),
  normalized: r.normalized,
}));

function normalizeJobName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed in jobNameMap.exact_overrides) return jobNameMap.exact_overrides[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [key, val] of Object.entries(jobNameMap.exact_overrides)) {
    if (key.toLowerCase() === lower) return val;
  }
  for (const rule of compiledRules) {
    if (rule.regex.test(trimmed)) return rule.normalized;
  }
  return trimmed.toUpperCase() || "UNKNOWN";
}

function parseDollar(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------------------
// Parsed row types (internal)
// ---------------------------------------------------------------------------

interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
  merchant?: string;
  // HD
  jobNameRaw?: string;
  jobName?: string;
  sku?: string;
  department?: string;
  category?: string;
  subcategory?: string;
  purchaser?: string;
  qty?: number;
  unitPrice?: number;
  // Chase
  postingDate?: Date;
  txnType?: string;
  runningBalance?: number;
  checkOrSlip?: string;
  // Apple Card
  clearingDate?: Date;
  cardCategory?: string;
  cardHolder?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Orchestrator ────────────────────────────────────────────────

  async importCsv(
    actor: AuthenticatedUser,
    source: CsvImportSource,
    buffer: Buffer,
    fileName: string,
  ) {
    const content = buffer.toString("utf8");

    let rows: ParsedRow[];
    switch (source) {
      case CsvImportSource.HD_PRO_XTRA:
        rows = this.parseHdCsv(content);
        break;
      case CsvImportSource.CHASE_BANK:
        rows = this.parseChaseCsv(content);
        break;
      case CsvImportSource.APPLE_CARD:
        rows = this.parseAppleCardCsv(content);
        break;
      default:
        throw new BadRequestException(`Unsupported CSV source: ${source}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException("CSV contained no parseable transaction rows.");
    }

    const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
    const dates = rows.map((r) => r.date.getTime());
    const dateRangeStart = new Date(Math.min(...dates));
    const dateRangeEnd = new Date(Math.max(...dates));

    // Create batch
    const batch = await this.prisma.csvImportBatch.create({
      data: {
        companyId: actor.companyId,
        source,
        fileName,
        rowCount: rows.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        dateRangeStart,
        dateRangeEnd,
        uploadedByUserId: actor.userId,
      },
    });

    // Bulk insert in chunks of 500
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await this.prisma.importedTransaction.createMany({
        data: chunk.map((r) => ({
          companyId: actor.companyId,
          batchId: batch.id,
          source,
          date: r.date,
          description: r.description,
          amount: r.amount,
          merchant: r.merchant ?? null,
          jobNameRaw: r.jobNameRaw ?? null,
          jobName: r.jobName ?? null,
          sku: r.sku ?? null,
          department: r.department ?? null,
          category: r.category ?? null,
          subcategory: r.subcategory ?? null,
          purchaser: r.purchaser ?? null,
          qty: r.qty ?? null,
          unitPrice: r.unitPrice ?? null,
          postingDate: r.postingDate ?? null,
          txnType: r.txnType ?? null,
          runningBalance: r.runningBalance ?? null,
          checkOrSlip: r.checkOrSlip ?? null,
          clearingDate: r.clearingDate ?? null,
          cardCategory: r.cardCategory ?? null,
          cardHolder: r.cardHolder ?? null,
        })),
      });
    }

    this.logger.log(
      `Imported ${rows.length} rows from ${source} (batch ${batch.id})`,
    );

    return {
      batchId: batch.id,
      source,
      fileName,
      rowCount: rows.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      dateRangeStart,
      dateRangeEnd,
    };
  }

  // ─── HD Pro Xtra parser ──────────────────────────────────────────

  private parseHdCsv(content: string): ParsedRow[] {
    const lines = content.split(/\r?\n/);

    // Find the header row (starts with "Date,Store Number,")
    let headerIndex = -1;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      if (lines[i].startsWith("Date,Store Number,")) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex === -1) {
      throw new BadRequestException(
        "HD CSV: Could not locate header row starting with 'Date,Store Number,...'",
      );
    }

    const csvContent = lines.slice(headerIndex).join("\n");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as Array<Record<string, string>>;

    return records.map((r) => {
      const qty = parseDollar(r["Quantity"]);
      const netUnitPrice = parseDollar(r["Net Unit Price"]);
      const extRetail = parseDollar(r["Extended Retail (before discount)"]);
      const programDiscount = parseDollar(r["Program Discount Amount"]);
      const otherDiscount = parseDollar(r["Other Discount Amount"]);
      const totalDiscount = programDiscount + otherDiscount;
      const lineTotal = extRetail - totalDiscount;

      const rawJobName = (r["Job Name"] || "").trim();
      const normalizedJob = normalizeJobName(rawJobName);

      return {
        date: new Date(r["Date"]),
        description: r["Description"] || r["Item Description"] || "",
        amount: lineTotal,
        merchant: "The Home Depot",
        jobNameRaw: rawJobName || undefined,
        jobName: normalizedJob || undefined,
        sku: r["SKU"] || undefined,
        department: r["Department"] || undefined,
        category: r["Class"] || r["Category"] || undefined,
        subcategory: r["Subclass"] || r["Subcategory"] || undefined,
        purchaser: r["Purchaser Name"] || undefined,
        qty: qty || undefined,
        unitPrice: netUnitPrice || undefined,
      };
    });
  }

  // ─── Chase bank CSV parser ───────────────────────────────────────

  private parseChaseCsv(content: string): ParsedRow[] {
    // Chase format: Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as Array<Record<string, string>>;

    if (records.length === 0) {
      throw new BadRequestException("Chase CSV: No data rows found.");
    }

    // Validate expected columns
    const first = records[0];
    if (!("Posting Date" in first) && !("Date" in first)) {
      throw new BadRequestException(
        "Chase CSV: Expected 'Posting Date' or 'Date' column. Check file format.",
      );
    }

    return records.map((r) => {
      const dateStr = r["Posting Date"] || r["Date"] || "";
      const amount = parseDollar(r["Amount"]);
      const balance = parseDollar(r["Balance"]);

      return {
        date: new Date(dateStr),
        // Chase amounts: negative = money out, positive = money in
        // We normalize to: positive = expense, negative = credit/income
        amount: -amount,
        description: r["Description"] || "",
        merchant: undefined,
        postingDate: new Date(dateStr),
        txnType: r["Type"] || r["Details"] || undefined,
        runningBalance: balance || undefined,
        checkOrSlip: r["Check or Slip #"] || undefined,
      };
    });
  }

  // ─── Apple Card CSV parser ───────────────────────────────────────

  private parseAppleCardCsv(content: string): ParsedRow[] {
    // Apple Card format: Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD), Purchased By
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as Array<Record<string, string>>;

    if (records.length === 0) {
      throw new BadRequestException("Apple Card CSV: No data rows found.");
    }

    const first = records[0];
    if (!("Transaction Date" in first)) {
      throw new BadRequestException(
        "Apple Card CSV: Expected 'Transaction Date' column. Check file format.",
      );
    }

    return records.map((r) => {
      const txnDateStr = r["Transaction Date"] || "";
      const clearingDateStr = r["Clearing Date"] || "";
      const amount = parseDollar(r["Amount (USD)"] || r["Amount"]);

      return {
        date: new Date(txnDateStr),
        description: r["Description"] || "",
        // Apple Card amounts: positive = purchase, negative = payment/credit
        amount,
        merchant: r["Merchant"] || undefined,
        clearingDate: clearingDateStr ? new Date(clearingDateStr) : undefined,
        cardCategory: r["Category"] || undefined,
        cardHolder: r["Purchased By"] || undefined,
      };
    });
  }

  // ─── Batch management ────────────────────────────────────────────

  async listBatches(companyId: string) {
    return this.prisma.csvImportBatch.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async deleteBatch(companyId: string, batchId: string) {
    const batch = await this.prisma.csvImportBatch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new BadRequestException("Import batch not found.");

    // Cascade delete handles ImportedTransaction rows
    await this.prisma.csvImportBatch.delete({ where: { id: batchId } });
    return { ok: true, deletedRows: batch.rowCount };
  }

  // ─── Unified transaction query ───────────────────────────────────

  async getUnifiedTransactions(
    companyId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      search?: string;
      source?: string; // "PLAID" | "HD_PRO_XTRA" | "CHASE_BANK" | "APPLE_CARD" | undefined (all)
      connectionId?: string; // Filter Plaid transactions by specific bank connection
      batchId?: string; // Filter imported transactions by specific CSV batch
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    // Date filter
    const dateGte = filters.startDate ? new Date(filters.startDate) : undefined;
    const dateLte = filters.endDate ? new Date(filters.endDate) : undefined;
    const dateFilter: any = {};
    if (dateGte) dateFilter.gte = dateGte;
    if (dateLte) dateFilter.lte = dateLte;
    const hasDateFilter = Object.keys(dateFilter).length > 0;

    // Determine which sources to query
    const wantPlaid = !filters.source || filters.source === "PLAID";
    const wantImported =
      !filters.source || ["HD_PRO_XTRA", "CHASE_BANK", "APPLE_CARD"].includes(filters.source);

    const results: Array<{
      id: string;
      source: string;
      date: Date;
      description: string;
      amount: number;
      merchant: string | null;
      category: string | null;
      pending: boolean;
      extra: Record<string, any>;
    }> = [];

    let totalPlaid = 0;
    let totalImported = 0;

    // Query Plaid (BankTransaction)
    if (wantPlaid && !filters.batchId) {
      const where: any = { companyId };
      if (hasDateFilter) where.date = dateFilter;
      if (filters.connectionId) where.bankConnectionId = filters.connectionId;
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: "insensitive" } },
          { merchantName: { contains: filters.search, mode: "insensitive" } },
        ];
      }

      const [plaidRows, plaidCount] = await Promise.all([
        this.prisma.bankTransaction.findMany({
          where,
          orderBy: { date: "desc" },
          skip: wantImported ? 0 : skip,
          take: wantImported ? 10000 : pageSize,
        }),
        this.prisma.bankTransaction.count({ where }),
      ]);

      totalPlaid = plaidCount;
      for (const t of plaidRows) {
        results.push({
          id: t.id,
          source: "PLAID",
          date: t.date,
          description: t.name,
          amount: t.amount,
          merchant: t.merchantName,
          category: t.primaryCategory,
          pending: t.pending,
          extra: {
            plaidTransactionId: t.plaidTransactionId,
            paymentChannel: t.paymentChannel,
            detailedCategory: t.detailedCategory,
          },
        });
      }
    }

    // Query imported (ImportedTransaction)
    if (wantImported && !filters.connectionId) {
      const where: any = { companyId };
      if (hasDateFilter) where.date = dateFilter;
      if (filters.batchId) where.batchId = filters.batchId;
      if (filters.source && filters.source !== "PLAID") {
        where.source = filters.source;
      }
      if (filters.search) {
        where.OR = [
          { description: { contains: filters.search, mode: "insensitive" } },
          { merchant: { contains: filters.search, mode: "insensitive" } },
          { jobName: { contains: filters.search, mode: "insensitive" } },
        ];
      }

      const [importedRows, importedCount] = await Promise.all([
        this.prisma.importedTransaction.findMany({
          where,
          orderBy: { date: "desc" },
          skip: wantPlaid ? 0 : skip,
          take: wantPlaid ? 10000 : pageSize,
        }),
        this.prisma.importedTransaction.count({ where }),
      ]);

      totalImported = importedCount;
      for (const t of importedRows) {
        results.push({
          id: t.id,
          source: t.source,
          date: t.date,
          description: t.description,
          amount: t.amount,
          merchant: t.merchant,
          category: t.category ?? t.cardCategory ?? null,
          pending: false,
          extra: {
            jobNameRaw: t.jobNameRaw,
            jobName: t.jobName,
            sku: t.sku,
            department: t.department,
            subcategory: t.subcategory,
            purchaser: t.purchaser,
            qty: t.qty,
            unitPrice: t.unitPrice,
            txnType: t.txnType,
            runningBalance: t.runningBalance,
            cardHolder: t.cardHolder,
            batchId: t.batchId,
          },
        });
      }
    }

    // Sort combined by date desc and paginate
    results.sort((a, b) => b.date.getTime() - a.date.getTime());

    const total = totalPlaid + totalImported;
    const paged = results.slice(skip, skip + pageSize);

    return {
      transactions: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
