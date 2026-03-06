import { Injectable, BadRequestException, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { CsvImportSource, TransactionDisposition, CategoryStatus } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { PrescreenService } from "./prescreen.service";
import { NexPriceService } from "./nexprice.service";

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
  rowIndex: number;  // 0-based position in the CSV — part of the fingerprint
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
  storeNumber?: string;
  transactionRef?: string;
  registerNumber?: string;
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
// Fingerprint helpers — deterministic hash for deduplication
// ---------------------------------------------------------------------------

function computeFingerprint(source: CsvImportSource, row: ParsedRow): string {
  const parts: string[] = [];

  // Row index makes every line in a CSV unique, even byte-for-byte identical
  // rows (e.g. same SKU purchased 8× in one HD transaction).
  // Re-importing the same file produces the same indices → dedup still works.
  parts.push(String(row.rowIndex));

  // Common: date + amount + description
  parts.push(row.date.toISOString().slice(0, 10));
  parts.push(row.amount.toFixed(2));
  parts.push(row.description.trim().toLowerCase());

  switch (source) {
    case CsvImportSource.HD_PRO_XTRA:
      parts.push(row.sku ?? "");
      parts.push(String(row.qty ?? ""));
      parts.push(row.purchaser ?? "");
      break;
    case CsvImportSource.CHASE_BANK:
      parts.push(row.txnType ?? "");
      parts.push(String(row.runningBalance ?? ""));
      parts.push(row.checkOrSlip ?? "");
      break;
    case CsvImportSource.APPLE_CARD:
      parts.push(row.merchant?.trim().toLowerCase() ?? "");
      parts.push(row.cardHolder?.trim().toLowerCase() ?? "");
      parts.push(row.clearingDate?.toISOString().slice(0, 10) ?? "");
      break;
  }

  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PrescreenService))
    private readonly prescreen: PrescreenService,
    @Inject(forwardRef(() => NexPriceService))
    private readonly nexprice: NexPriceService,
  ) {}

  // ─── Orchestrator ────────────────────────────────────────────────

  async importCsv(
    actor: AuthenticatedUser,
    source: CsvImportSource,
    buffer: Buffer,
    fileName: string,
  ) {
    const content = buffer.toString("utf8");
    const rawCsv = content; // Preserve original CSV for undo

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

    // Compute fingerprints
    const rowsWithFingerprint = rows.map((r) => ({
      ...r,
      fingerprint: computeFingerprint(source, r),
    }));

    // Create batch (rowCount will be updated after insert)
    const batch = await this.prisma.csvImportBatch.create({
      data: {
        companyId: actor.companyId,
        source,
        fileName,
        rawCsv,
        rowCount: 0,
        totalAmount: 0,
        dateRangeStart,
        dateRangeEnd,
        uploadedByUserId: actor.userId,
      },
    });

    // Bulk insert in chunks of 500, skipping duplicates
    let insertedCount = 0;
    const CHUNK = 500;
    for (let i = 0; i < rowsWithFingerprint.length; i += CHUNK) {
      const chunk = rowsWithFingerprint.slice(i, i + CHUNK);
      const result = await this.prisma.importedTransaction.createMany({
        data: chunk.map((r) => ({
          companyId: actor.companyId,
          batchId: batch.id,
          source,
          date: r.date,
          description: r.description,
          amount: r.amount,
          merchant: r.merchant ?? null,
          fingerprint: r.fingerprint,
          jobNameRaw: r.jobNameRaw ?? null,
          jobName: r.jobName ?? null,
          sku: r.sku ?? null,
          department: r.department ?? null,
          category: r.category ?? null,
          subcategory: r.subcategory ?? null,
          purchaser: r.purchaser ?? null,
          qty: r.qty ?? null,
          unitPrice: r.unitPrice ?? null,
          storeNumber: r.storeNumber ?? null,
          transactionRef: r.transactionRef ?? null,
          registerNumber: r.registerNumber ?? null,
          postingDate: r.postingDate ?? null,
          txnType: r.txnType ?? null,
          runningBalance: r.runningBalance ?? null,
          checkOrSlip: r.checkOrSlip ?? null,
          clearingDate: r.clearingDate ?? null,
          cardCategory: r.cardCategory ?? null,
          cardHolder: r.cardHolder ?? null,
        })),
        skipDuplicates: true,
      });
      insertedCount += result.count;
    }

    const skippedCount = rows.length - insertedCount;
    const insertedAmount = insertedCount === rows.length
      ? totalAmount
      : (await this.prisma.importedTransaction.aggregate({
          where: { batchId: batch.id },
          _sum: { amount: true },
        }))._sum.amount ?? 0;

    // Update batch with actual counts
    await this.prisma.csvImportBatch.update({
      where: { id: batch.id },
      data: {
        rowCount: insertedCount,
        totalAmount: Math.round(insertedAmount * 100) / 100,
      },
    });

    // If nothing was inserted (all duplicates), delete the empty batch
    if (insertedCount === 0) {
      await this.prisma.csvImportBatch.delete({ where: { id: batch.id } });
    }

    this.logger.log(
      `Imported ${insertedCount} new rows (${skippedCount} duplicates skipped) from ${source} (batch ${batch.id})`,
    );

    // Run prescreening on the newly imported batch
    let prescreenResult = { total: 0, prescreened: 0, billsCreated: 0 };
    if (insertedCount > 0) {
      try {
        prescreenResult = await this.prescreen.prescreenBatch(actor.companyId, batch.id);
      } catch (err: any) {
        this.logger.error(`Prescreening failed for batch ${batch.id}: ${err.message}`);
      }
    }

    // NexPRICE dual-write: sync HD SKU rows to the global Master Cost Book
    let nexpriceResult = { synced: 0, created: 0, updated: 0, skipped: 0 };
    if (insertedCount > 0 && source === CsvImportSource.HD_PRO_XTRA) {
      try {
        const skuRows = rows.filter((r) => r.sku && r.unitPrice);
        if (skuRows.length > 0) {
          // Resolve regions for each row via HD store number
          const contributions = await Promise.all(
            skuRows.map(async (r) => {
              const regionZip = r.storeNumber
                ? await this.nexprice.resolveHdStoreRegion(r.storeNumber)
                : null;
              return {
                sku: r.sku!,
                description: r.description,
                unitPrice: r.unitPrice!,
                unit: "EA",
                sourceVendor: "The Home Depot",
                regionZip: regionZip ?? undefined,
                companyId: actor.companyId,
              };
            }),
          );
          nexpriceResult = await this.nexprice.syncBatchToGlobalMaster(contributions);
        }
      } catch (err: any) {
        this.logger.error(`NexPRICE sync failed for batch ${batch.id}: ${err.message}`);
      }
    }

    return {
      batchId: insertedCount > 0 ? batch.id : null,
      source,
      fileName,
      rowCount: insertedCount,
      skippedCount,
      totalAmount: Math.round(insertedAmount * 100) / 100,
      dateRangeStart,
      dateRangeEnd,
      prescreened: prescreenResult.prescreened,
      tentativeBillsCreated: prescreenResult.billsCreated,
      nexpriceSynced: nexpriceResult.synced,
      nexpriceCreated: nexpriceResult.created,
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

    return records.map((r, idx) => {
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
        rowIndex: idx,
        date: new Date(r["Date"]),
        description: r["SKU Description"] || r["Description"] || r["Item Description"] || "",
        amount: lineTotal,
        merchant: "The Home Depot",
        jobNameRaw: rawJobName || undefined,
        jobName: normalizedJob || undefined,
        sku: r["SKU Number"] || r["SKU"] || undefined,
        department: r["Department Name"] || r["Department"] || undefined,
        category: r["Class Name"] || r["Class"] || r["Category"] || undefined,
        subcategory: r["Subclass Name"] || r["Subclass"] || r["Subcategory"] || undefined,
        purchaser: r["Purchaser"] || r["Purchaser Name"] || undefined,
        qty: qty || undefined,
        unitPrice: netUnitPrice || undefined,
        storeNumber: r["Store Number"] || undefined,
        transactionRef: r["Transaction ID"] || r["Order Number"] || r["Invoice Number"] || undefined,
        registerNumber: r["Register Number"] || undefined,
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

    return records.map((r, idx) => {
      const dateStr = r["Posting Date"] || r["Date"] || "";
      const amount = parseDollar(r["Amount"]);
      const balance = parseDollar(r["Balance"]);

      return {
        rowIndex: idx,
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

    return records.map((r, idx) => {
      const txnDateStr = r["Transaction Date"] || "";
      const clearingDateStr = r["Clearing Date"] || "";
      const amount = parseDollar(r["Amount (USD)"] || r["Amount"]);

      return {
        rowIndex: idx,
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
    const batches = await this.prisma.csvImportBatch.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Enrich each batch with assigned transaction count so UI can show undo eligibility
    const batchIds = batches.map((b) => b.id);
    const assignedCounts = batchIds.length > 0
      ? await this.prisma.importedTransaction.groupBy({
          by: ["batchId"],
          where: { batchId: { in: batchIds }, projectId: { not: null } },
          _count: { id: true },
        })
      : [];

    const assignedMap = new Map(assignedCounts.map((r) => [r.batchId, r._count.id]));

    return batches.map((b) => ({
      ...b,
      rawCsv: undefined, // Never send raw CSV in list responses
      assignedCount: assignedMap.get(b.id) ?? 0,
      canUndo: (assignedMap.get(b.id) ?? 0) === 0,
    }));
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

  // ─── Undo import (safe delete + return CSV) ────────────────────────

  async undoImport(companyId: string, batchId: string) {
    const batch = await this.prisma.csvImportBatch.findFirst({
      where: { id: batchId, companyId },
    });
    if (!batch) throw new BadRequestException("Import batch not found.");

    // Check for any transactions assigned to a project
    const assignedCount = await this.prisma.importedTransaction.count({
      where: { batchId, projectId: { not: null } },
    });

    if (assignedCount > 0) {
      throw new BadRequestException(
        `Cannot undo: ${assignedCount} transaction(s) in this batch are assigned to projects. ` +
        `Unassign them first, then retry.`,
      );
    }

    // Grab the raw CSV before deletion
    const rawCsv = batch.rawCsv;

    // Cascade delete
    await this.prisma.csvImportBatch.delete({ where: { id: batchId } });

    this.logger.log(
      `Undo import: deleted batch ${batchId} (${batch.rowCount} rows, source=${batch.source})`,
    );

    return {
      ok: true,
      undone: true,
      batchId: batch.id,
      source: batch.source,
      fileName: batch.fileName,
      rowCount: batch.rowCount,
      rawCsv: rawCsv ?? null, // null for batches imported before this feature
    };
  }

  async bulkUndoImport(companyId: string, batchIds: string[]) {
    if (batchIds.length === 0) {
      throw new BadRequestException("No batch IDs provided.");
    }

    const batches = await this.prisma.csvImportBatch.findMany({
      where: { id: { in: batchIds }, companyId },
    });

    if (batches.length !== batchIds.length) {
      const found = new Set(batches.map((b) => b.id));
      const missing = batchIds.filter((id) => !found.has(id));
      throw new BadRequestException(`Batch(es) not found: ${missing.join(", ")}`);
    }

    // Check all batches for assigned transactions
    const assignedCounts = await this.prisma.importedTransaction.groupBy({
      by: ["batchId"],
      where: { batchId: { in: batchIds }, projectId: { not: null } },
      _count: { id: true },
    });

    const blocked = assignedCounts.filter((r) => r._count.id > 0);
    if (blocked.length > 0) {
      const details = blocked
        .map((r) => {
          const b = batches.find((b) => b.id === r.batchId);
          return `${b?.fileName ?? r.batchId}: ${r._count.id} assigned`;
        })
        .join("; ");
      throw new BadRequestException(
        `Cannot undo: some batches have assigned transactions. ${details}`,
      );
    }

    // Collect raw CSVs before deletion
    const results = batches.map((b) => ({
      batchId: b.id,
      source: b.source,
      fileName: b.fileName,
      rowCount: b.rowCount,
      rawCsv: b.rawCsv ?? null,
    }));

    // Delete all batches (cascade deletes transactions)
    await this.prisma.csvImportBatch.deleteMany({
      where: { id: { in: batchIds }, companyId },
    });

    const totalRows = batches.reduce((sum, b) => sum + b.rowCount, 0);
    this.logger.log(
      `Bulk undo: deleted ${batches.length} batch(es), ${totalRows} total rows`,
    );

    return {
      ok: true,
      undone: results,
      totalBatches: results.length,
      totalRows,
    };
  }

  // ─── Unified transaction query ───────────────────────────────────

  async getUnifiedTransactions(
    companyId: string,
    filters: {
      startDate?: string;
      endDate?: string;
      search?: string;
      source?: string;
      connectionId?: string;
      batchId?: string;
      sortBy?: "date" | "description" | "merchant" | "category" | "amount" | "status" | "project";
      sortDir?: "asc" | "desc";
      category?: string;
      pending?: boolean;
      projectId?: string;
      unassigned?: boolean;
      disposition?: string;
      merchant?: string;
      accountMask?: string;
      amountSearch?: string;
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

    // Determine which sources to query (supports comma-separated multi-select)
    const sourceValues = filters.source ? filters.source.split(',').map(s => s.trim()).filter(Boolean) : [];
    const wantPlaid = sourceValues.length === 0 || sourceValues.includes('PLAID');
    const importedSources = sourceValues.filter(s => s !== 'PLAID');
    const wantImported = sourceValues.length === 0 || importedSources.length > 0;

    type UnifiedRow = {
      id: string;
      source: string;
      date: Date;
      description: string;
      amount: number;
      merchant: string | null;
      category: string | null;
      pending: boolean;
      projectId: string | null;
      projectName: string | null;
      extra: Record<string, any>;
    };

    const results: UnifiedRow[] = [];
    let totalPlaid = 0;
    let totalImported = 0;

    // Query Plaid (BankTransaction)
    if (wantPlaid && !filters.batchId) {
      const where: any = { companyId };
      if (hasDateFilter) where.date = dateFilter;
      if (filters.connectionId) where.bankConnectionId = filters.connectionId;
      if (filters.category) {
        const cats = filters.category.split(',').map(c => c.trim()).filter(Boolean);
        where.primaryCategory = cats.length === 1
          ? { contains: cats[0], mode: "insensitive" }
          : { in: cats };
      }
      if (filters.pending !== undefined) where.pending = filters.pending;
      if (filters.projectId) where.projectId = filters.projectId;
      if (filters.unassigned) where.projectId = null;
      if (filters.disposition) {
        const disps = filters.disposition.split(',').map(d => d.trim()).filter(Boolean);
        where.disposition = disps.length === 1 ? disps[0] : { in: disps };
      }
      if (filters.accountMask) {
        const masks = filters.accountMask.split(',').map(m => m.trim()).filter(Boolean);
        where.bankConnection = {
          accountMask: masks.length === 1 ? masks[0] : { in: masks },
        };
      }
      if (filters.merchant) {
        where.merchantName = { contains: filters.merchant, mode: "insensitive" };
      }
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: "insensitive" } },
          { merchantName: { contains: filters.search, mode: "insensitive" } },
        ];
      }
      if (filters.amountSearch) {
        const parsed = parseFloat(filters.amountSearch);
        if (!isNaN(parsed)) {
          const amountCond = { amount: { in: parsed === 0 ? [0] : [parsed, -parsed] } };
          if (where.AND) { where.AND.push(amountCond); }
          else if (where.OR) { where.AND = [{ OR: where.OR }, amountCond]; delete where.OR; }
          else { where.AND = [amountCond]; }
        }
      }

      const [plaidRows, plaidCount] = await Promise.all([
        this.prisma.bankTransaction.findMany({
          where,
          orderBy: { date: "desc" },
          skip: wantImported ? 0 : skip,
          take: wantImported ? 10000 : pageSize,
          include: {
            project: { select: { id: true, name: true } },
            bankConnection: { select: { institutionName: true, accountMask: true } },
          },
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
          projectId: t.projectId,
          projectName: (t as any).project?.name ?? null,
          extra: {
            plaidTransactionId: t.plaidTransactionId,
            paymentChannel: t.paymentChannel,
            detailedCategory: t.detailedCategory,
            disposition: t.disposition,
            institutionName: (t as any).bankConnection?.institutionName ?? null,
            accountMask: (t as any).bankConnection?.accountMask ?? null,
            categoryOverride: t.categoryOverride ?? null,
            categoryStatus: t.categoryStatus,
          },
        });
      }
    }

    // Query imported (ImportedTransaction)
    if (wantImported && !filters.connectionId) {
      const where: any = { companyId };
      if (hasDateFilter) where.date = dateFilter;
      if (filters.batchId) where.batchId = filters.batchId;
      if (importedSources.length > 0) {
        where.source = importedSources.length === 1 ? importedSources[0] : { in: importedSources };
      }
      if (filters.category) {
        const cats = filters.category.split(',').map(c => c.trim()).filter(Boolean);
        if (cats.length === 1) {
          where.OR = [
            { category: { contains: cats[0], mode: "insensitive" } },
            { cardCategory: { contains: cats[0], mode: "insensitive" } },
          ];
        } else {
          where.OR = [
            { category: { in: cats } },
            { cardCategory: { in: cats } },
          ];
        }
      }
      if (filters.projectId) where.projectId = filters.projectId;
      if (filters.unassigned) where.projectId = null;
      if (filters.disposition) {
        const disps = filters.disposition.split(',').map(d => d.trim()).filter(Boolean);
        where.disposition = disps.length === 1 ? disps[0] : { in: disps };
      }
      if (filters.merchant) {
        where.OR = [
          { merchant: { contains: filters.merchant, mode: "insensitive" } },
          { jobName: { contains: filters.merchant, mode: "insensitive" } },
        ];
      }
      if (filters.search) {
        const searchOr = [
          { description: { contains: filters.search, mode: "insensitive" } },
          { merchant: { contains: filters.search, mode: "insensitive" } },
          { jobName: { contains: filters.search, mode: "insensitive" } },
        ];
        // Merge with existing category OR if present
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: searchOr }];
          delete where.OR;
        } else {
          where.OR = searchOr;
        }
      }
      if (filters.amountSearch) {
        const parsed = parseFloat(filters.amountSearch);
        if (!isNaN(parsed)) {
          const amountCond = { amount: { in: parsed === 0 ? [0] : [parsed, -parsed] } };
          if (where.AND) { (where.AND as any[]).push(amountCond); }
          else if (where.OR) { where.AND = [{ OR: where.OR }, amountCond]; delete where.OR; }
          else { where.AND = [amountCond]; }
        }
      }

      const [importedRows, importedCount] = await Promise.all([
        this.prisma.importedTransaction.findMany({
          where,
          orderBy: { date: "desc" },
          skip: wantPlaid ? 0 : skip,
          take: wantPlaid ? 10000 : pageSize,
          include: { project: { select: { id: true, name: true } } },
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
          projectId: t.projectId,
          projectName: (t as any).project?.name ?? null,
          extra: {
            jobNameRaw: t.jobNameRaw,
            jobName: t.jobName,
            sku: t.sku,
            department: t.department,
            subcategory: t.subcategory,
            purchaser: t.purchaser,
            qty: t.qty,
            unitPrice: t.unitPrice,
            storeNumber: t.storeNumber,
            transactionRef: t.transactionRef,
            registerNumber: t.registerNumber,
            txnType: t.txnType,
            runningBalance: t.runningBalance,
            checkOrSlip: t.checkOrSlip,
            clearingDate: t.clearingDate,
            cardCategory: t.cardCategory,
            cardHolder: t.cardHolder,
            batchId: t.batchId,
            // Prescreening metadata
            prescreenProjectId: t.prescreenProjectId,
            prescreenConfidence: t.prescreenConfidence,
            prescreenReason: t.prescreenReason,
            prescreenStatus: t.prescreenStatus,
            // Disposition
            disposition: t.disposition,
            // Category override
            categoryOverride: t.categoryOverride ?? null,
            categoryStatus: t.categoryStatus,
          },
        });
      }
    }

    // Sort
    const dir = filters.sortDir === "asc" ? 1 : -1;
    const sortKey = filters.sortBy ?? "date";
    results.sort((a, b) => {
      switch (sortKey) {
        case "description": return dir * a.description.localeCompare(b.description);
        case "merchant": return dir * (a.merchant ?? "").localeCompare(b.merchant ?? "");
        case "category": return dir * (a.category ?? "").localeCompare(b.category ?? "");
        case "amount": return dir * (a.amount - b.amount);
        case "status": return dir * (Number(a.pending) - Number(b.pending));
        case "project": return dir * (a.projectName ?? "").localeCompare(b.projectName ?? "");
        case "date":
        default:
          return dir * (a.date.getTime() - b.date.getTime());
      }
    });
    // Default sort is date desc when no sortBy specified
    if (!filters.sortBy) results.reverse();

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

  // ─── PM role check helper ──────────────────────────────────────────

  /**
   * Check if a user is assigned as PM for a project via teamTreeJson.
   * teamTreeJson shape: { "PM": ["userId1", ...], "SUPERINTENDENT": [...], ... }
   */
  private async isUserPmForProject(userId: string, projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { teamTreeJson: true },
    });
    if (!project?.teamTreeJson) return false;
    const teamTree = project.teamTreeJson as Record<string, string[]>;
    const pmList = teamTree["PM"] ?? teamTree["pm"] ?? [];
    return Array.isArray(pmList) && pmList.includes(userId);
  }

  // ─── Create bill from transaction assignment ──────────────────────

  /**
   * Creates a ProjectBill when a transaction is manually assigned to a project.
   * - If the assigning user is the PM for the target project (dual-role),
   *   the bill goes straight to DRAFT (auto-approved).
   * - Otherwise, the bill is TENTATIVE and the PM must review it.
   */
  private async createBillFromTransaction(params: {
    companyId: string;
    projectId: string;
    transactionId: string;
    transactionSource: string;
    vendorName: string;
    billDate: Date;
    totalAmount: number;
    description: string;
    userId?: string;
  }) {
    const { companyId, projectId, transactionId, transactionSource, vendorName, billDate, totalAmount, description, userId } = params;

    // Idempotency: skip if a bill already exists for this transaction on this project
    const existing = await this.prisma.projectBill.findFirst({
      where: { sourceTransactionId: transactionId, projectId },
    });
    if (existing) return existing;

    // Dual-role check: is the assigning user also the PM for this project?
    const isPm = userId ? await this.isUserPmForProject(userId, projectId) : false;
    const billStatus = isPm ? "DRAFT" : "TENTATIVE";

    const bill = await this.prisma.projectBill.create({
      data: {
        companyId,
        projectId,
        vendorName,
        billDate,
        totalAmount,
        status: billStatus,
        sourceTransactionId: transactionId,
        sourceTransactionSource: transactionSource,
        memo: isPm
          ? `Assigned by PM — auto-approved for review`
          : `Assigned from Banking Transactions — pending PM review`,
        createdByUserId: userId ?? null,
        lineItems: {
          create: [
            {
              kind: "MATERIALS",
              description: description || "Imported transaction",
              amount: totalAmount,
              amountSource: "MANUAL",
            },
          ],
        },
      },
    });

    this.logger.log(
      `Created ${billStatus} bill ${bill.id} for txn ${transactionId} on project ${projectId}` +
        (isPm ? " (dual-role: auto-approved)" : ""),
    );

    return bill;
  }

  // ─── Assign transaction to project ────────────────────────────────

  async assignTransactionToProject(
    companyId: string,
    transactionId: string,
    source: string,
    projectId: string | null,
    userId?: string,
  ) {
    // Resolve user name for audit log
    let userName = "System";
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (user) userName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
    }

    // ── Unassign path: clear project + delete TENTATIVE/DRAFT bills ──
    if (!projectId) {
      // Delete any tentative/draft bill linked to this transaction
      await this.prisma.projectBill.deleteMany({
        where: {
          sourceTransactionId: transactionId,
          status: { in: ["TENTATIVE", "DRAFT"] },
        },
      });

      if (source === "PLAID") {
        const txn = await this.prisma.bankTransaction.findFirst({
          where: { id: transactionId, companyId },
        });
        if (!txn) throw new BadRequestException("Transaction not found.");
        const updated = await this.prisma.bankTransaction.update({
          where: { id: transactionId },
          data: { projectId: null, disposition: TransactionDisposition.UNREVIEWED },
          include: { project: { select: { id: true, name: true } } },
        });
        if (userId && txn.disposition !== TransactionDisposition.UNREVIEWED) {
          await this.prisma.transactionDispositionLog.create({
            data: {
              companyId,
              transactionId,
              transactionSource: "PLAID",
              previousDisposition: txn.disposition,
              newDisposition: TransactionDisposition.UNREVIEWED,
              note: `Unassigned from project`,
              userId,
              userName: userName ?? "System",
            },
          });
        }
        return updated;
      } else {
        const txn = await this.prisma.importedTransaction.findFirst({
          where: { id: transactionId, companyId },
        });
        if (!txn) throw new BadRequestException("Transaction not found.");
        const updated = await this.prisma.importedTransaction.update({
          where: { id: transactionId },
          data: { projectId: null, disposition: TransactionDisposition.UNREVIEWED },
          include: { project: { select: { id: true, name: true } } },
        });
        if (userId && txn.disposition !== TransactionDisposition.UNREVIEWED) {
          await this.prisma.transactionDispositionLog.create({
            data: {
              companyId,
              transactionId,
              transactionSource: txn.source,
              previousDisposition: txn.disposition,
              newDisposition: TransactionDisposition.UNREVIEWED,
              note: `Unassigned from project`,
              userId,
              userName: userName ?? "System",
            },
          });
        }
        return updated;
      }
    }

    // ── Assign path: set project + create bill ──────────────────────
    const isPm = userId ? await this.isUserPmForProject(userId, projectId) : false;
    const newDisposition = isPm
      ? TransactionDisposition.ASSIGNED
      : TransactionDisposition.PENDING_APPROVAL;

    if (source === "PLAID") {
      const txn = await this.prisma.bankTransaction.findFirst({
        where: { id: transactionId, companyId },
      });
      if (!txn) throw new BadRequestException("Transaction not found.");
      const updated = await this.prisma.bankTransaction.update({
        where: { id: transactionId },
        data: { projectId, disposition: newDisposition },
        include: { project: { select: { id: true, name: true } } },
      });

      // Create bill in the target project
      await this.createBillFromTransaction({
        companyId,
        projectId,
        transactionId,
        transactionSource: "PLAID",
        vendorName: txn.merchantName ?? txn.name?.slice(0, 100) ?? "Unknown",
        billDate: txn.date,
        totalAmount: txn.amount,
        description: txn.name ?? "Plaid transaction",
        userId,
      });

      // Log the disposition change
      if (userId && txn.disposition !== newDisposition) {
        await this.prisma.transactionDispositionLog.create({
          data: {
            companyId,
            transactionId,
            transactionSource: "PLAID",
            previousDisposition: txn.disposition,
            newDisposition,
            note: isPm
              ? `Assigned to project by PM — auto-approved`
              : `Assigned to project, pending PM approval`,
            userId,
            userName: userName ?? "System",
          },
        });
      }
      return updated;
    } else {
      const txn = await this.prisma.importedTransaction.findFirst({
        where: { id: transactionId, companyId },
      });
      if (!txn) throw new BadRequestException("Transaction not found.");
      const updated = await this.prisma.importedTransaction.update({
        where: { id: transactionId },
        data: { projectId, disposition: newDisposition },
        include: { project: { select: { id: true, name: true } } },
      });

      // Create bill in the target project
      await this.createBillFromTransaction({
        companyId,
        projectId,
        transactionId,
        transactionSource: txn.source,
        vendorName: txn.merchant ?? txn.description?.slice(0, 100) ?? "Unknown",
        billDate: txn.date,
        totalAmount: txn.amount,
        description: txn.description ?? "Imported transaction",
        userId,
      });

      if (userId && txn.disposition !== newDisposition) {
        await this.prisma.transactionDispositionLog.create({
          data: {
            companyId,
            transactionId,
            transactionSource: txn.source,
            previousDisposition: txn.disposition,
            newDisposition,
            note: isPm
              ? `Assigned to project by PM — auto-approved`
              : `Assigned to project, pending PM approval`,
            userId,
            userName: userName ?? "System",
          },
        });
      }
      return updated;
    }
  }

  // ─── Bulk assign ──────────────────────────────────────────────────

  async bulkAssignProject(
    companyId: string,
    ids: Array<{ id: string; source: string }>,
    projectId: string | null,
    userId?: string,
  ) {
    let succeeded = 0;
    const errors: string[] = [];
    for (const item of ids) {
      try {
        await this.assignTransactionToProject(companyId, item.id, item.source, projectId, userId);
        succeeded++;
      } catch (err: any) {
        errors.push(`${item.id}: ${err.message}`);
      }
    }
    if (errors.length > 0) {
      this.logger.warn(`Bulk assign: ${errors.length} errors: ${errors.slice(0, 5).join("; ")}`);
    }
    return { ok: true, updated: succeeded, errors: errors.length, errorDetails: errors.slice(0, 10) };
  }

  // ─── Raw transaction detail ──────────────────────────────────────

  async getRawTransaction(companyId: string, transactionId: string, source: string) {
    if (source === "PLAID") {
      const txn = await this.prisma.bankTransaction.findFirst({
        where: { id: transactionId, companyId },
        include: { project: { select: { id: true, name: true } } },
      });
      if (!txn) throw new BadRequestException("Transaction not found.");
      return {
        source: "PLAID",
        data: txn,
        sourceColumns: [
          { key: "date", label: "Date", type: "date" },
          { key: "name", label: "Description", type: "string" },
          { key: "merchantName", label: "Merchant", type: "string" },
          { key: "amount", label: "Amount", type: "currency" },
          { key: "primaryCategory", label: "Category", type: "string" },
          { key: "detailedCategory", label: "Detailed Category", type: "string" },
          { key: "paymentChannel", label: "Payment Channel", type: "string" },
          { key: "transactionType", label: "Transaction Type", type: "string" },
          { key: "pending", label: "Pending", type: "boolean" },
        ],
      };
    }

    const txn = await this.prisma.importedTransaction.findFirst({
      where: { id: transactionId, companyId },
      include: {
        project: { select: { id: true, name: true } },
        prescreenProject: { select: { id: true, name: true } },
      },
    });
    if (!txn) throw new BadRequestException("Transaction not found.");

    const columnsBySource: Record<string, Array<{ key: string; label: string; type: string }>> = {
      HD_PRO_XTRA: [
        { key: "date", label: "Date", type: "date" },
        { key: "storeNumber", label: "Store #", type: "string" },
        { key: "transactionRef", label: "Transaction ID", type: "string" },
        { key: "registerNumber", label: "Register #", type: "string" },
        { key: "jobNameRaw", label: "Job Name (Raw)", type: "string" },
        { key: "jobName", label: "Job Name (Normalized)", type: "string" },
        { key: "sku", label: "SKU", type: "string" },
        { key: "description", label: "SKU Description", type: "string" },
        { key: "qty", label: "Qty", type: "number" },
        { key: "unitPrice", label: "Unit Price", type: "currency" },
        { key: "amount", label: "Net Amount", type: "currency" },
        { key: "department", label: "Department", type: "string" },
        { key: "category", label: "Class", type: "string" },
        { key: "subcategory", label: "Subclass", type: "string" },
        { key: "purchaser", label: "Purchaser", type: "string" },
      ],
      CHASE_BANK: [
        { key: "postingDate", label: "Posting Date", type: "date" },
        { key: "description", label: "Description", type: "string" },
        { key: "txnType", label: "Type", type: "string" },
        { key: "amount", label: "Amount", type: "currency" },
        { key: "runningBalance", label: "Balance", type: "currency" },
        { key: "checkOrSlip", label: "Check/Slip #", type: "string" },
      ],
      APPLE_CARD: [
        { key: "date", label: "Transaction Date", type: "date" },
        { key: "clearingDate", label: "Clearing Date", type: "date" },
        { key: "description", label: "Description", type: "string" },
        { key: "merchant", label: "Merchant", type: "string" },
        { key: "cardCategory", label: "Category", type: "string" },
        { key: "amount", label: "Amount", type: "currency" },
        { key: "cardHolder", label: "Purchased By", type: "string" },
      ],
    };

    return {
      source: txn.source,
      data: txn,
      sourceColumns: columnsBySource[txn.source] ?? [],
    };
  }

  // ─── Prescreen accept/reject ────────────────────────────────────────

  async acceptPrescreen(companyId: string, transactionId: string, userId?: string) {
    const txn = await this.prisma.importedTransaction.findFirst({
      where: { id: transactionId, companyId },
    });
    if (!txn) throw new BadRequestException("Transaction not found.");
    if (!txn.prescreenProjectId) throw new BadRequestException("No prescreen suggestion.");

    // Accept: set projectId, update prescreen status
    const updated = await this.prisma.importedTransaction.update({
      where: { id: transactionId },
      data: {
        projectId: txn.prescreenProjectId,
        prescreenStatus: "ACCEPTED",
      },
      include: { project: { select: { id: true, name: true } } },
    });

    // Promote tentative bill to DRAFT
    await this.prisma.projectBill.updateMany({
      where: { sourceTransactionId: transactionId, status: "TENTATIVE" },
      data: { status: "DRAFT" },
    });

    // Log feedback
    await this.prisma.prescreenFeedback.create({
      data: {
        companyId,
        transactionId,
        prescreenProjectId: txn.prescreenProjectId,
        actualProjectId: txn.prescreenProjectId,
        feedbackType: "ACCEPTED",
        source: txn.source,
        merchant: txn.merchant,
        jobNameNormalized: txn.jobName,
        storeNumber: txn.storeNumber,
        purchaser: txn.purchaser,
        createdByUserId: userId,
      },
    });

    return updated;
  }

  async rejectPrescreen(companyId: string, transactionId: string, reason: string, userId?: string) {
    const txn = await this.prisma.importedTransaction.findFirst({
      where: { id: transactionId, companyId },
    });
    if (!txn) throw new BadRequestException("Transaction not found.");

    // Reject: clear projectId, update prescreen status
    const updated = await this.prisma.importedTransaction.update({
      where: { id: transactionId },
      data: {
        prescreenStatus: "REJECTED",
        prescreenRejectionReason: reason,
        projectId: null,
      },
    });

    // Delete tentative bill
    await this.prisma.projectBill.deleteMany({
      where: { sourceTransactionId: transactionId, status: "TENTATIVE" },
    });

    // Log feedback
    await this.prisma.prescreenFeedback.create({
      data: {
        companyId,
        transactionId,
        prescreenProjectId: txn.prescreenProjectId,
        actualProjectId: null,
        feedbackType: "REJECTED",
        reason,
        source: txn.source,
        merchant: txn.merchant,
        jobNameNormalized: txn.jobName,
        storeNumber: txn.storeNumber,
        purchaser: txn.purchaser,
        createdByUserId: userId,
      },
    });

    return updated;
  }

  async overridePrescreen(
    companyId: string,
    transactionId: string,
    newProjectId: string,
    reason: string,
    userId?: string,
  ) {
    const txn = await this.prisma.importedTransaction.findFirst({
      where: { id: transactionId, companyId },
    });
    if (!txn) throw new BadRequestException("Transaction not found.");

    // Override: set new projectId, update prescreen status
    const updated = await this.prisma.importedTransaction.update({
      where: { id: transactionId },
      data: {
        projectId: newProjectId,
        prescreenStatus: "OVERRIDDEN",
      },
      include: { project: { select: { id: true, name: true } } },
    });

    // Move tentative bill to new project or delete and recreate
    const existingBill = await this.prisma.projectBill.findFirst({
      where: { sourceTransactionId: transactionId, status: "TENTATIVE" },
    });
    if (existingBill) {
      await this.prisma.projectBill.update({
        where: { id: existingBill.id },
        data: { projectId: newProjectId, status: "DRAFT" },
      });
    }

    // Log feedback
    await this.prisma.prescreenFeedback.create({
      data: {
        companyId,
        transactionId,
        prescreenProjectId: txn.prescreenProjectId,
        actualProjectId: newProjectId,
        feedbackType: "OVERRIDDEN",
        reason,
        source: txn.source,
        merchant: txn.merchant,
        jobNameNormalized: txn.jobName,
        storeNumber: txn.storeNumber,
        purchaser: txn.purchaser,
        createdByUserId: userId,
      },
    });

    return updated;
  }

  // ─── Bulk accept by confidence ────────────────────────────────────

  async bulkAcceptByConfidence(
    companyId: string,
    minConfidence: number,
    userId?: string,
    projectId?: string,
  ) {
    const where: any = {
      companyId,
      prescreenStatus: "PENDING",
      prescreenConfidence: { gte: minConfidence },
      prescreenProjectId: { not: null },
    };
    if (projectId) where.prescreenProjectId = projectId;

    const candidates = await this.prisma.importedTransaction.findMany({
      where,
      select: { id: true },
    });

    let accepted = 0;
    const errors: string[] = [];
    for (const c of candidates) {
      try {
        await this.acceptPrescreen(companyId, c.id, userId);
        accepted++;
      } catch (err: any) {
        errors.push(`${c.id}: ${err.message}`);
      }
    }

    return { ok: true, found: candidates.length, accepted, errors };
  }

  // ─── Re-run prescreening ───────────────────────────────────────────

  async rerunPrescreening(companyId: string) {
    // Find all distinct batchIds with unprocessed imported transactions
    const batches = await this.prisma.importedTransaction.findMany({
      where: {
        companyId,
        prescreenStatus: "PENDING",
        prescreenProjectId: null,
      },
      distinct: ["batchId"],
      select: { batchId: true },
    });

    if (batches.length === 0) {
      return { ok: true, batchesProcessed: 0, totalPrescreened: 0, totalBillsCreated: 0 };
    }

    let totalPrescreened = 0;
    let totalBillsCreated = 0;
    const errors: string[] = [];

    for (const { batchId } of batches) {
      try {
        const result = await this.prescreen.prescreenBatch(companyId, batchId);
        totalPrescreened += result.prescreened;
        totalBillsCreated += result.billsCreated;
      } catch (err: any) {
        this.logger.error(`Prescreening failed for batch ${batchId}: ${err.message}`);
        errors.push(`Batch ${batchId}: ${err.message}`);
      }
    }

    return {
      ok: true,
      batchesProcessed: batches.length,
      totalPrescreened,
      totalBillsCreated,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ─── Distinct categories ──────────────────────────────────────────

  async getDistinctCategories(companyId: string) {
    const [plaidCats, importedCats, appleCats] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: { companyId, primaryCategory: { not: null } },
        distinct: ["primaryCategory"],
        select: { primaryCategory: true },
      }),
      this.prisma.importedTransaction.findMany({
        where: { companyId, category: { not: null } },
        distinct: ["category"],
        select: { category: true },
      }),
      this.prisma.importedTransaction.findMany({
        where: { companyId, cardCategory: { not: null } },
        distinct: ["cardCategory"],
        select: { cardCategory: true },
      }),
    ]);

    const all = new Set<string>();
    for (const r of plaidCats) if (r.primaryCategory) all.add(r.primaryCategory);
    for (const r of importedCats) if (r.category) all.add(r.category);
    for (const r of appleCats) if (r.cardCategory) all.add(r.cardCategory);

    return Array.from(all).sort();
  }

  // ─── Store-to-card reconciliation ─────────────────────────────────

  async getStoreCardMatches(
    companyId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const dateGte = startDate ? new Date(startDate) : undefined;
    const dateLte = endDate ? new Date(endDate) : undefined;
    const dateFilter: any = {};
    if (dateGte) dateFilter.gte = dateGte;
    if (dateLte) dateFilter.lte = dateLte;
    const hasDate = Object.keys(dateFilter).length > 0;

    // 1. Load HD store transactions (not yet reconciled)
    const hdTxns = await this.prisma.importedTransaction.findMany({
      where: {
        companyId,
        source: CsvImportSource.HD_PRO_XTRA,
        storeNumber: { not: null },
        reconciledWithId: null,
        ...(hasDate ? { date: dateFilter } : {}),
      },
      orderBy: { date: "asc" },
    });

    // 2. Load credit card transactions (Apple Card + Chase, not yet reconciled)
    const cardTxns = await this.prisma.importedTransaction.findMany({
      where: {
        companyId,
        source: { in: [CsvImportSource.APPLE_CARD, CsvImportSource.CHASE_BANK] },
        reconciledWithId: null,
        ...(hasDate ? { date: dateFilter } : {}),
      },
      orderBy: { date: "asc" },
    });

    // 3. Group HD transactions by (date ISO, storeNumber) → sum amounts
    type StoreGroup = {
      dateStr: string;
      storeNumber: string;
      totalAmount: number;
      transactionIds: string[];
      items: Array<{ id: string; description: string; amount: number; sku?: string | null; qty?: number | null }>;
    };
    const storeGroups = new Map<string, StoreGroup>();

    for (const t of hdTxns) {
      const dateStr = t.date.toISOString().slice(0, 10);
      const key = `${dateStr}|${t.storeNumber}`;
      if (!storeGroups.has(key)) {
        storeGroups.set(key, {
          dateStr,
          storeNumber: t.storeNumber!,
          totalAmount: 0,
          transactionIds: [],
          items: [],
        });
      }
      const g = storeGroups.get(key)!;
      g.totalAmount += t.amount;
      g.transactionIds.push(t.id);
      g.items.push({ id: t.id, description: t.description, amount: t.amount, sku: t.sku, qty: t.qty });
    }

    // 4. For each store group, find matching card transactions (±1 day, ±$0.02)
    const AMOUNT_TOLERANCE = 0.02;
    const DAY_MS = 86_400_000;

    type MatchResult = {
      storeGroup: StoreGroup;
      cardTransaction: {
        id: string;
        source: string;
        date: string;
        description: string;
        merchant: string | null;
        amount: number;
        cardHolder: string | null;
      };
      amountDiff: number;
      dateDiffDays: number;
    };

    const matches: MatchResult[] = [];
    const matchedCardIds = new Set<string>();
    const matchedStoreKeys = new Set<string>();

    for (const [key, group] of storeGroups.entries()) {
      const groupDate = new Date(group.dateStr).getTime();
      const roundedTotal = Math.round(group.totalAmount * 100) / 100;

      for (const card of cardTxns) {
        if (matchedCardIds.has(card.id)) continue;
        const cardDate = card.date.getTime();
        const dateDiff = Math.abs(cardDate - groupDate);
        if (dateDiff > DAY_MS) continue;

        const amountDiff = Math.abs(card.amount - roundedTotal);
        if (amountDiff > AMOUNT_TOLERANCE) continue;

        // Match found
        matches.push({
          storeGroup: group,
          cardTransaction: {
            id: card.id,
            source: card.source,
            date: card.date.toISOString().slice(0, 10),
            description: card.description,
            merchant: card.merchant,
            amount: card.amount,
            cardHolder: card.cardHolder,
          },
          amountDiff: Math.round(amountDiff * 100) / 100,
          dateDiffDays: Math.round(dateDiff / DAY_MS),
        });
        matchedCardIds.add(card.id);
        matchedStoreKeys.add(key);
        break; // One card match per store group
      }
    }

    // Unmatched groups
    const unmatchedStoreGroups = Array.from(storeGroups.entries())
      .filter(([key]) => !matchedStoreKeys.has(key))
      .map(([, g]) => g);

    const unmatchedCards = cardTxns
      .filter((c) => !matchedCardIds.has(c.id))
      .map((c) => ({
        id: c.id,
        source: c.source,
        date: c.date.toISOString().slice(0, 10),
        description: c.description,
        merchant: c.merchant,
        amount: c.amount,
        cardHolder: c.cardHolder,
      }));

    return {
      matches,
      unmatchedStoreGroups,
      unmatchedCards,
      summary: {
        totalMatches: matches.length,
        totalUnmatchedStoreGroups: unmatchedStoreGroups.length,
        totalUnmatchedCards: unmatchedCards.length,
      },
    };
  }

  async linkStoreToCard(
    companyId: string,
    storeTransactionIds: string[],
    cardTransactionId: string,
  ) {
    // Verify all transactions belong to this company
    const storeTxns = await this.prisma.importedTransaction.findMany({
      where: { id: { in: storeTransactionIds }, companyId },
    });
    if (storeTxns.length !== storeTransactionIds.length) {
      throw new BadRequestException("One or more store transactions not found.");
    }

    const cardTxn = await this.prisma.importedTransaction.findFirst({
      where: { id: cardTransactionId, companyId },
    });
    if (!cardTxn) throw new BadRequestException("Card transaction not found.");

    const now = new Date();

    // Link all store transactions → card transaction
    await this.prisma.importedTransaction.updateMany({
      where: { id: { in: storeTransactionIds } },
      data: { reconciledWithId: cardTransactionId, reconciledAt: now },
    });

    // Link card transaction → first store transaction (bidirectional ref)
    await this.prisma.importedTransaction.update({
      where: { id: cardTransactionId },
      data: { reconciledWithId: storeTransactionIds[0], reconciledAt: now },
    });

    return { ok: true, linked: storeTransactionIds.length + 1 };
  }

  async unlinkReconciliation(companyId: string, transactionIds: string[]) {
    // Find all transactions that reference any of these IDs
    const txns = await this.prisma.importedTransaction.findMany({
      where: {
        companyId,
        OR: [
          { id: { in: transactionIds } },
          { reconciledWithId: { in: transactionIds } },
        ],
      },
      select: { id: true },
    });

    const allIds = txns.map((t) => t.id);
    await this.prisma.importedTransaction.updateMany({
      where: { id: { in: allIds } },
      data: { reconciledWithId: null, reconciledAt: null },
    });

    return { ok: true, unlinked: allIds.length };
  }

  // ─── Per-project summary (for reconciliation) ─────────────────────

  async getProjectsSummary(
    companyId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const dateGte = startDate ? new Date(startDate) : undefined;
    const dateLte = endDate ? new Date(endDate) : undefined;
    const dateFilter: any = {};
    if (dateGte) dateFilter.gte = dateGte;
    if (dateLte) dateFilter.lte = dateLte;
    const hasDate = Object.keys(dateFilter).length > 0;

    // Get all projects for the company
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
    });

    // Aggregate bank transactions by project
    const bankAgg = await this.prisma.bankTransaction.groupBy({
      by: ["projectId"],
      where: {
        companyId,
        projectId: { not: null },
        ...(hasDate ? { date: dateFilter } : {}),
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Aggregate imported transactions by project
    const importAgg = await this.prisma.importedTransaction.groupBy({
      by: ["projectId"],
      where: {
        companyId,
        projectId: { not: null },
        ...(hasDate ? { date: dateFilter } : {}),
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Count unassigned
    const [unassignedBank, unassignedImported] = await Promise.all([
      this.prisma.bankTransaction.count({
        where: { companyId, projectId: null, ...(hasDate ? { date: dateFilter } : {}) },
      }),
      this.prisma.importedTransaction.count({
        where: { companyId, projectId: null, ...(hasDate ? { date: dateFilter } : {}) },
      }),
    ]);

    // Build per-project map
    const projMap = new Map<string, {
      projectId: string;
      projectName: string;
      status: string;
      totalAmount: number;
      transactionCount: number;
    }>();

    for (const p of projects) {
      projMap.set(p.id, {
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        totalAmount: 0,
        transactionCount: 0,
      });
    }

    for (const row of bankAgg) {
      if (!row.projectId) continue;
      const p = projMap.get(row.projectId);
      if (p) {
        p.totalAmount += row._sum.amount ?? 0;
        p.transactionCount += row._count.id;
      }
    }
    for (const row of importAgg) {
      if (!row.projectId) continue;
      const p = projMap.get(row.projectId);
      if (p) {
        p.totalAmount += row._sum.amount ?? 0;
        p.transactionCount += row._count.id;
      }
    }

    const projectSummaries = Array.from(projMap.values())
      .filter((p) => p.transactionCount > 0)
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      projects: projectSummaries,
      unassignedCount: unassignedBank + unassignedImported,
      totalProjects: projectSummaries.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Transaction Disposition
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Set the disposition on a transaction (imported or Plaid).
   * Creates an audit log entry with the mandatory note.
   */
  async dispositionTransaction(params: {
    companyId: string;
    transactionId: string;
    source: string;
    disposition: TransactionDisposition;
    note: string;
    userId: string;
  }) {
    const { companyId, transactionId, source, disposition, note, userId } = params;

    // Resolve user name for audit log
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const userName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : "Unknown";

    let previousDisposition: TransactionDisposition;

    if (source === "PLAID") {
      const txn = await this.prisma.bankTransaction.findFirst({
        where: { id: transactionId, companyId },
      });
      if (!txn) throw new BadRequestException("Transaction not found.");
      previousDisposition = txn.disposition;
      await this.prisma.bankTransaction.update({
        where: { id: transactionId },
        data: { disposition },
      });
    } else {
      const txn = await this.prisma.importedTransaction.findFirst({
        where: { id: transactionId, companyId },
      });
      if (!txn) throw new BadRequestException("Transaction not found.");
      previousDisposition = txn.disposition;
      await this.prisma.importedTransaction.update({
        where: { id: transactionId },
        data: { disposition },
      });
    }

    // Create audit log
    const log = await this.prisma.transactionDispositionLog.create({
      data: {
        companyId,
        transactionId,
        transactionSource: source,
        previousDisposition,
        newDisposition: disposition,
        note,
        userId,
        userName,
      },
    });

    return { ok: true, disposition, previousDisposition, logId: log.id };
  }

  /**
   * Get disposition audit log for a transaction.
   */
  async getDispositionLog(companyId: string, transactionId: string) {
    return this.prisma.transactionDispositionLog.findMany({
      where: { companyId, transactionId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get disposition summary counts for the company.
   */
  async getDispositionCounts(companyId: string) {
    const [bankCounts, importedCounts] = await Promise.all([
      this.prisma.bankTransaction.groupBy({
        by: ["disposition"],
        where: { companyId },
        _count: { id: true },
      }),
      this.prisma.importedTransaction.groupBy({
        by: ["disposition"],
        where: { companyId },
        _count: { id: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const v of Object.values(TransactionDisposition)) counts[v] = 0;
    for (const row of bankCounts) counts[row.disposition] = (counts[row.disposition] ?? 0) + row._count.id;
    for (const row of importedCounts) counts[row.disposition] = (counts[row.disposition] ?? 0) + row._count.id;

    return counts;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Category Override + Verification
  // ═══════════════════════════════════════════════════════════════════

  async overrideCategory(params: {
    companyId: string;
    transactionId: string;
    source: string;
    newCategory: string;
    note?: string;
    userId: string;
  }) {
    const { companyId, transactionId, source, newCategory, note, userId } = params;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const userName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : "Unknown";

    let previousCategory: string | null = null;
    let previousStatus: CategoryStatus = CategoryStatus.ORIGINAL;
    let merchant: string | null = null;

    if (source === "PLAID") {
      const txn = await this.prisma.bankTransaction.findFirst({ where: { id: transactionId, companyId } });
      if (!txn) throw new BadRequestException("Transaction not found.");
      previousCategory = txn.categoryOverride ?? txn.primaryCategory ?? null;
      previousStatus = txn.categoryStatus;
      merchant = txn.merchantName;
      await this.prisma.bankTransaction.update({
        where: { id: transactionId },
        data: {
          categoryOverride: newCategory,
          categoryStatus: CategoryStatus.TENTATIVE,
          categoryOverrideByUserId: userId,
          categoryOverrideAt: new Date(),
        },
      });
    } else {
      const txn = await this.prisma.importedTransaction.findFirst({ where: { id: transactionId, companyId } });
      if (!txn) throw new BadRequestException("Transaction not found.");
      previousCategory = txn.categoryOverride ?? txn.category ?? txn.cardCategory ?? null;
      previousStatus = txn.categoryStatus;
      merchant = txn.merchant;
      await this.prisma.importedTransaction.update({
        where: { id: transactionId },
        data: {
          categoryOverride: newCategory,
          categoryStatus: CategoryStatus.TENTATIVE,
          categoryOverrideByUserId: userId,
          categoryOverrideAt: new Date(),
        },
      });
    }

    // Audit log
    await this.prisma.categoryOverrideLog.create({
      data: {
        companyId,
        transactionId,
        transactionSource: source,
        previousCategory,
        newCategory,
        previousStatus,
        newStatus: CategoryStatus.TENTATIVE,
        note: note ?? null,
        userId,
        userName,
      },
    });

    // Upsert MerchantCategoryRule for learning
    if (merchant && previousCategory) {
      const merchantKey = merchant.toLowerCase().trim();
      try {
        await this.prisma.merchantCategoryRule.upsert({
          where: {
            MerchantCategoryRule_company_merchant_from_key: {
              companyId,
              merchantKey,
              fromCategory: previousCategory,
            },
          },
          update: {
            toCategory: newCategory,
            ruleCount: { increment: 1 },
            lastAppliedAt: new Date(),
          },
          create: {
            companyId,
            merchantKey,
            fromCategory: previousCategory,
            toCategory: newCategory,
            ruleCount: 1,
            lastAppliedAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to upsert MerchantCategoryRule: ${err.message}`);
      }
    }

    return { ok: true, newCategory, previousCategory, categoryStatus: CategoryStatus.TENTATIVE };
  }

  async verifyCategory(params: {
    companyId: string;
    transactionId: string;
    source: string;
    userId: string;
  }) {
    const { companyId, transactionId, source, userId } = params;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const userName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email : "Unknown";

    let previousCategory: string | null = null;

    if (source === "PLAID") {
      const txn = await this.prisma.bankTransaction.findFirst({ where: { id: transactionId, companyId } });
      if (!txn) throw new BadRequestException("Transaction not found.");
      if (txn.categoryStatus !== CategoryStatus.TENTATIVE) {
        throw new BadRequestException("Only TENTATIVE categories can be verified.");
      }
      previousCategory = txn.categoryOverride ?? txn.primaryCategory ?? null;
      await this.prisma.bankTransaction.update({
        where: { id: transactionId },
        data: { categoryStatus: CategoryStatus.VERIFIED },
      });
    } else {
      const txn = await this.prisma.importedTransaction.findFirst({ where: { id: transactionId, companyId } });
      if (!txn) throw new BadRequestException("Transaction not found.");
      if (txn.categoryStatus !== CategoryStatus.TENTATIVE) {
        throw new BadRequestException("Only TENTATIVE categories can be verified.");
      }
      previousCategory = txn.categoryOverride ?? txn.category ?? txn.cardCategory ?? null;
      await this.prisma.importedTransaction.update({
        where: { id: transactionId },
        data: { categoryStatus: CategoryStatus.VERIFIED },
      });
    }

    await this.prisma.categoryOverrideLog.create({
      data: {
        companyId,
        transactionId,
        transactionSource: source,
        previousCategory,
        newCategory: previousCategory ?? "",
        previousStatus: CategoryStatus.TENTATIVE,
        newStatus: CategoryStatus.VERIFIED,
        note: "PM verified category",
        userId,
        userName,
      },
    });

    return { ok: true, categoryStatus: CategoryStatus.VERIFIED };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Transaction Tags
  // ═══════════════════════════════════════════════════════════════════

  async createTag(companyId: string, name: string, color?: string) {
    return this.prisma.transactionTag.create({
      data: { companyId, name: name.trim(), color: color ?? null },
    });
  }

  async listTags(companyId: string) {
    return this.prisma.transactionTag.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    });
  }

  async deleteTag(companyId: string, tagId: string) {
    const tag = await this.prisma.transactionTag.findFirst({
      where: { id: tagId, companyId },
    });
    if (!tag) throw new BadRequestException("Tag not found.");
    await this.prisma.transactionTag.delete({ where: { id: tagId } });
    return { ok: true };
  }

  async assignTag(transactionId: string, transactionSource: string, tagId: string, userId?: string) {
    return this.prisma.transactionTagAssignment.create({
      data: { transactionId, transactionSource, tagId, assignedByUserId: userId ?? null },
    });
  }

  async removeTag(transactionId: string, tagId: string) {
    const assignment = await this.prisma.transactionTagAssignment.findUnique({
      where: { TransactionTagAssignment_txn_tag_key: { transactionId, tagId } },
    });
    if (!assignment) throw new BadRequestException("Tag assignment not found.");
    await this.prisma.transactionTagAssignment.delete({ where: { id: assignment.id } });
    return { ok: true };
  }

  async getTransactionTags(transactionId: string) {
    return this.prisma.transactionTagAssignment.findMany({
      where: { transactionId },
      include: { tag: true },
      orderBy: { assignedAt: "asc" },
    });
  }
}
