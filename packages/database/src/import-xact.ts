import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./index";

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[$,]/g, "");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value)
    .replace(/\r?\n/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

// For identity keys (Group Code / Group Description), do NOT collapse whitespace or
// otherwise "normalize" beyond stripping control chars and trimming. We want the
// full field value preserved as exported, because small differences can break
// stable identity across imports.
function cleanKeyText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value)
    .replace(/\r?\n/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
  return s || null;
}

function sanitizeHeaderKey(key: string): string {
  // Remove BOM/control chars and normalize whitespace so header matching is robust.
  return String(key ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
}

function normalizeHeaderLookupKey(key: string): string {
  // Normalize to a comparable key:
  // - lowercase
  // - collapse all non-alphanumerics (except '#') to spaces
  // - collapse whitespace
  return sanitizeHeaderKey(key)
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeRecordHeaders(record: any): any {
  if (!record || typeof record !== "object") return record;
  const out: any = {};
  for (const [k, v] of Object.entries(record)) {
    const cleanKey = sanitizeHeaderKey(k);
    // Prefer first occurrence if multiple headers normalize to the same label.
    if (!(cleanKey in out)) {
      out[cleanKey] = v;
    }
  }
  return out;
}

function cleanNote(value: string | null | undefined, max = 5000): string | null {
  const t = cleanText(value);
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

// Some vendor exports include thousands of "blank" CSV lines that are not truly empty
// (they contain only delimiters like ",,,,"). `csv-parse` will treat these as records
// with every column set to "". These are not real line items and should be ignored.
function isBlankCsvRecord(record: any): boolean {
  if (!record || typeof record !== "object") return true;
  for (const v of Object.values(record)) {
    if (v == null) continue;
    if (typeof v === "string") {
      if (v.trim() !== "") return false;
      continue;
    }
    // Any non-string value means it isn't an "all blank" record.
    return false;
  }
  return true;
}

// Normalize Group Code to a *stable unit grouping key*.
//
// Real-world files often use Group Code for both unit + room (e.g. UNIT_10_BAT2)
// and Group Description may be identical or include the unit prefix.
//
// We want unit grouping to be stable and non-identical to Group Description:
// - If Group Code looks like UNIT/UINT + number: derive UNIT_XX (pad 1-9)
// - Otherwise: fall back to an uppercase truncated prefix
//
// We keep the full raw value in rawRowJson; this is only for grouping/identity.
function normalizeGroupCodeForGrouping(value: string | null | undefined): string | null {
  const raw = cleanKeyText(value);
  if (!raw) return null;

  // UNIT / UINT prefix => group by unit number.
  const m = raw.match(/^(UNIT|UINT)[_\s-]*0*(\d+)/i);
  if (m) {
    const prefix = m[1]!.toUpperCase();
    const n = Number(m[2]);
    if (Number.isFinite(n) && n > 0) {
      const padded = n < 10 ? `0${n}` : String(n);
      // For n >= 100, this will exceed 7 chars; keep full so we don't collide
      // (e.g. UNIT_105 must not become UNIT_10).
      return `${prefix}_${padded}`;
    }
  }

  // Non-unit codes: normalize to uppercase and truncate to 7 chars.
  const upper = raw.toUpperCase();
  return upper.length > 7 ? upper.slice(0, 7) : upper;
}

function toBooleanYesNo(value: string | null | undefined): boolean | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes" || v === "y") return true;
  if (v === "no" || v === "n") return false;
  return null;
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeSignature(record: any, get: (rec: any, ...aliases: string[]) => any): string {
  const fields = [
    get(record, "Group Description", "Group Desc", "Room", "Room Name") ?? "",
    get(record, "Desc", "Description", "Item Description") ?? "",
    get(record, "Qty", "Quantity", "QTY") ?? "",
    get(record, "Item Amount", "ItemAmount", "Line Amount", "Amount") ?? "",
    get(record, "Unit Cost", "UnitCost", "Unit Price", "UnitPrice") ?? "",
    get(record, "Unit", "UOM", "U/M") ?? "",
    get(record, "Activity") ?? "",
    get(record, "Sales Tax", "SalesTax", "Tax") ?? "",
    get(record, "RCV") ?? "",
    get(record, "ACV") ?? "",
    get(record, "Cat", "Category") ?? "",
    get(record, "Sel", "Selection") ?? "",
  ];
  const base = fields.join("|");
  // Single SHA-256 hex digest is sufficient to identify a logical item.
  return crypto.createHash("sha256").update(base).digest("hex");
}

function normalizeKeyPart(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .trim();
}

// Pricing key normalization must match the Golden price list import logic
// (apps/api/src/modules/pricing/pricing.service.ts) so hashes align.
function normalizePricingKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function buildCanonicalKeyHash(
  cat: string | null,
  sel: string | null,
  activity: string | null,
  description: string | null,
): string {
  const canonicalKeyString = [
    normalizePricingKeyPart(cat),
    normalizePricingKeyPart(sel),
    normalizePricingKeyPart(activity),
    normalizePricingKeyPart(description),
  ].join("||");

  return crypto.createHash("sha256").update(canonicalKeyString, "utf8").digest("hex");
}

function parseUnitLabelFromGroupCode(groupCode: string | null | undefined): string | null {
  if (!groupCode) return null;
  const raw = groupCode.trim();
  // Handle codes like UNIT_01, UNIT_1, UINT_01, etc.
  const match = raw.match(/^(?:UNIT|UINT)[_\s-]*0*(\d+)$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Zero-pad 1-9 so lexical sorting is stable (Unit 01..Unit 09, Unit 10..).
  const padded = n < 10 ? `0${n}` : String(n);
  return `Unit ${padded}`;
}

function normalizeUnitLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const raw = String(label).trim();
  if (!raw) return null;

  // Handle already-normalized labels like "Unit 01" / "Unit 1".
  const m1 = raw.match(/^Unit\s+0*(\d+)$/i);
  if (m1) {
    const n = Number(m1[1]);
    if (Number.isFinite(n) && n > 0) {
      const padded = n < 10 ? `0${n}` : String(n);
      return `Unit ${padded}`;
    }
  }

  // Handle raw codes sometimes found in descriptions ("UNIT_01", "UNIT_1").
  const fromCode = parseUnitLabelFromGroupCode(raw);
  if (fromCode) return fromCode;

  return raw;
}

function legacyUnitLabelFromPadded(label: string): string | null {
  const m = label.match(/^Unit\s+0([1-9])$/i);
  if (!m) return null;
  return `Unit ${Number(m[1])}`;
}

function particleExternalKey(groupCode: string | null | undefined, groupDescription: string | null | undefined): string {
  // IMPORTANT: Use the full Group Code + Group Description values (trimmed only)
  // so identity remains stable and we don't "lose" meaningful characters.
  const codeKey = normalizeKeyPart(groupCode);
  const descKey = normalizeKeyPart(groupDescription);
  return `${codeKey}::${descKey}`;
}

function parseUnitAndRoom(groupDescription: string): { unitLabel: string; roomName: string } {
  const raw = groupDescription.trim();
  const parts = raw.split(/-+/);
  if (parts.length < 2) {
    const unitLabel = normalizeUnitLabel("Unit 1") ?? "Unit 1";
    return { unitLabel, roomName: raw || "Whole Unit" };
  }
  const left = parts[0]!.trim() || "Unit 1";
  const right = parts.slice(1).join("-").trim() || "Whole Unit";
  const unitLabel = normalizeUnitLabel(left) ?? left;
  return { unitLabel, roomName: right };
}

// Sync the active Golden price list's unitPrice values with the
// actual unit costs seen in a specific Xact RAW estimate. For each
// (Cat, Sel) pair in the estimate that differs from the Golden price,
// we update PriceListItem.unitPrice to the estimate's unitCost and
// move the previous Golden price into lastKnownUnitPrice.
async function updateGoldenFromEstimate(estimateVersionId: string) {
  const priceList = await prisma.priceList.findFirst({
    where: { kind: "GOLDEN", isActive: true },
    orderBy: { revision: "desc" },
  });

  if (!priceList) {
    return {
      updatedCount: 0,
      avgDelta: 0,
      avgPercentDelta: 0,
    };
  }

  const estimate = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true },
  });

  if (!estimate || !estimate.project) {
    return {
      updatedCount: 0,
      avgDelta: 0,
      avgPercentDelta: 0,
    };
  }

  const companyId = estimate.project.companyId;
  const projectId = estimate.projectId;
  const userId = estimate.importedByUserId ?? null;

  // Load raw rows for this estimate with pricing identity fields.
  const rawRows = await prisma.rawXactRow.findMany({
    where: { estimateVersionId },
    select: {
      cat: true,
      sel: true,
      activity: true,
      desc: true,
      unitCost: true,
    },
  });

  type Agg = {
    canonicalKeyHash: string;
    totalUnitCost: number;
    count: number;
  };

  const byHash = new Map<string, Agg>();

  for (const row of rawRows) {
    // Need Cat + Unit Cost at minimum.
    if (!row.cat || row.unitCost == null) continue;
    const cat = row.cat.trim();
    if (!cat) continue;

    const hash = buildCanonicalKeyHash(
      row.cat ?? null,
      row.sel ?? null,
      row.activity ?? null,
      row.desc ?? null,
    );

    const existing = byHash.get(hash);
    if (existing) {
      existing.totalUnitCost += row.unitCost ?? 0;
      existing.count += 1;
    } else {
      byHash.set(hash, {
        canonicalKeyHash: hash,
        totalUnitCost: row.unitCost ?? 0,
        count: 1,
      });
    }
  }

  if (byHash.size === 0) {
    // Still log a zero-update event so the revision history reflects
    // that this estimate was processed against the Golden price list.
    await prisma.goldenPriceUpdateLog.create({
      data: {
        companyId,
        projectId,
        estimateVersionId,
        userId,
        updatedCount: 0,
        avgDelta: 0,
        avgPercentDelta: 0,
        source: "XACT_ESTIMATE",
      },
    });

    return {
      updatedCount: 0,
      avgDelta: 0,
      avgPercentDelta: 0,
    };
  }

  const hashes = Array.from(byHash.keys());

  // Load Golden items for these hashes.
  const goldenItems = await prisma.priceListItem.findMany({
    where: {
      priceListId: priceList.id,
      canonicalKeyHash: { in: hashes },
    },
    select: {
      id: true,
      canonicalKeyHash: true,
      unitPrice: true,
    },
  });

  const itemByHash = new Map<string, { id: string; unitPrice: number | null }>();
  for (const item of goldenItems) {
    if (!item.canonicalKeyHash) continue;
    if (!itemByHash.has(item.canonicalKeyHash)) {
      itemByHash.set(item.canonicalKeyHash, {
        id: item.id,
        unitPrice: item.unitPrice,
      });
    }
  }

  const updates: { id: string; oldPrice: number; newPrice: number }[] = [];

  for (const [hash, agg] of byHash.entries()) {
    const avgUnitCost = agg.totalUnitCost / (agg.count || 1);
    if (!Number.isFinite(avgUnitCost)) continue;

    const item = itemByHash.get(hash);
    if (!item) continue;

    const oldPrice = item.unitPrice ?? 0;
    const newPrice = avgUnitCost;

    // Skip if effectively the same price (tiny rounding differences).
    if (Math.abs(newPrice - oldPrice) < 0.005) continue;

    updates.push({ id: item.id, oldPrice, newPrice });
  }

  if (updates.length === 0) {
    // No per-item price changes, but we still record a history event so
    // the Golden Price List Revision Log shows that this estimate ran.
    await prisma.goldenPriceUpdateLog.create({
      data: {
        companyId,
        projectId,
        estimateVersionId,
        userId,
        updatedCount: 0,
        avgDelta: 0,
        avgPercentDelta: 0,
        source: "XACT_ESTIMATE",
      },
    });

    return {
      updatedCount: 0,
      avgDelta: 0,
      avgPercentDelta: 0,
    };
  }

  // Apply updates in manageable chunks to avoid hitting Prisma's interactive
  // transaction timeout against Cloud SQL (default ~5s). A single massive
  // $transaction with thousands of UPDATE statements can exceed that limit.
  const chunkSize = 100;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((u) =>
        prisma.priceListItem.update({
          where: { id: u.id },
          data: {
            lastKnownUnitPrice: u.oldPrice,
            unitPrice: u.newPrice,
          },
        }),
      ),
    );
  }

  let sumDelta = 0;
  let sumPercent = 0;

  for (const u of updates) {
    const delta = u.newPrice - u.oldPrice;
    sumDelta += delta;
    if (u.oldPrice > 0) {
      sumPercent += delta / u.oldPrice;
    }
  }

  const updatedCount = updates.length;
  const avgDelta = updatedCount ? sumDelta / updatedCount : 0;
  const avgPercentDelta = updatedCount ? sumPercent / updatedCount : 0;

  await prisma.goldenPriceUpdateLog.create({
    data: {
      companyId,
      projectId,
      estimateVersionId,
      userId,
      updatedCount,
      avgDelta,
      avgPercentDelta,
      source: "XACT_ESTIMATE",
    },
  });

  return {
    updatedCount,
    avgDelta,
    avgPercentDelta,
  };
}

// Update the active tenant CompanyPriceList (Tenant Golden PETL) based on
// observed unit costs in a project's PETL (SOW items). This is the primary
// hook that lets Xact/MPETL estimates continuously refine tenant cost books.
export async function updateTenantGoldenFromPetl(options: {
  companyId: string;
  projectId: string;
  estimateVersionId: string;
  sowItems: { categoryCode: string | null; selectionCode: string | null; unitCost: number | null }[];
  changedByUserId?: string;
  source: string; // e.g. "PROJECT_PETL_IMPORT" | "PROJECT_MPETL_MANUAL"
}) {
  const { companyId, projectId, estimateVersionId, sowItems, changedByUserId, source } = options;

  if (!sowItems.length) {
    return { updatedCount: 0 };
  }

  // Find an active CompanyPriceList for this tenant.
  const companyPriceList = await prisma.companyPriceList.findFirst({
    where: { companyId, isActive: true },
    orderBy: { revision: "desc" },
  });

  if (!companyPriceList) {
    // Tenant has no cost book yet; nothing to update.
    return { updatedCount: 0 };
  }

  type Agg = {
    cat: string;
    sel: string | null;
    totalUnitCost: number;
    count: number;
  };

  const byKey = new Map<string, Agg>();

  for (const item of sowItems) {
    if (!item.categoryCode || item.unitCost == null) continue;
    const cat = item.categoryCode.trim().toUpperCase();
    if (!cat) continue;
    const sel = item.selectionCode ? item.selectionCode.trim().toUpperCase() : null;
    const key = `${cat}::${sel ?? ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.totalUnitCost += item.unitCost ?? 0;
      existing.count += 1;
    } else {
      byKey.set(key, {
        cat,
        sel,
        totalUnitCost: item.unitCost ?? 0,
        count: 1,
      });
    }
  }

  if (byKey.size === 0) {
    return { updatedCount: 0 };
  }

  // Load existing tenant items for these Cats.
  const cats = Array.from(new Set(Array.from(byKey.values()).map(a => a.cat)));

  const tenantItems = await prisma.companyPriceListItem.findMany({
    where: {
      companyPriceListId: companyPriceList.id,
      cat: { in: cats },
    },
    select: {
      id: true,
      cat: true,
      sel: true,
      unitPrice: true,
      lastKnownUnitPrice: true,
      canonicalKeyHash: true,
    },
  });

  const itemByKey = new Map<
    string,
    { id: string; unitPrice: number | null; lastKnownUnitPrice: number | null; canonicalKeyHash: string | null }
  >();

  for (const item of tenantItems) {
    const cat = (item.cat ?? "").trim().toUpperCase();
    if (!cat) continue;
    const sel = item.sel ? item.sel.trim().toUpperCase() : null;
    const key = `${cat}::${sel ?? ""}`;
    if (!itemByKey.has(key)) {
      itemByKey.set(key, {
        id: item.id,
        unitPrice: item.unitPrice,
        lastKnownUnitPrice: item.lastKnownUnitPrice,
        canonicalKeyHash: item.canonicalKeyHash ?? null,
      });
    }
  }

  const updates: {
    id: string;
    oldPrice: number | null;
    newPrice: number;
    cat: string;
    sel: string | null;
    canonicalKeyHash: string | null;
  }[] = [];

  for (const [key, agg] of byKey.entries()) {
    const avgUnitCost = agg.totalUnitCost / (agg.count || 1);
    if (!Number.isFinite(avgUnitCost)) continue;

    const existing = itemByKey.get(key);
    const oldPrice = existing?.unitPrice ?? null;
    const newPrice = avgUnitCost;

    if (oldPrice != null && Math.abs(newPrice - oldPrice) < 0.005) {
      continue; // effectively unchanged
    }

    updates.push({
      id: existing?.id ?? "",
      oldPrice,
      newPrice,
      cat: agg.cat,
      sel: agg.sel,
      canonicalKeyHash: existing?.canonicalKeyHash ?? null,
    });
  }

  if (updates.length === 0) {
    return { updatedCount: 0 };
  }

  const now = new Date();
  const updatedItems: { id: string; oldPrice: number | null; newPrice: number; cat: string; sel: string | null; canonicalKeyHash: string | null }[] = [];

  // Apply updates/creates in batches.
  const chunkSize = 100;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const u of chunk) {
        if (u.id) {
          // Existing item – update price fields and freshness metadata.
          const updated = await tx.companyPriceListItem.update({
            where: { id: u.id },
            data: {
              lastKnownUnitPrice: u.oldPrice ?? undefined,
              unitPrice: u.newPrice,
              lastPriceChangedAt: now,
              lastPriceChangedByUserId: changedByUserId,
              lastPriceChangedSourceImportJobId: null,
              lastPriceChangedSource: source,
            },
          });

          updatedItems.push({
            id: updated.id,
            oldPrice: u.oldPrice,
            newPrice: u.newPrice,
            cat: u.cat,
            sel: u.sel,
            canonicalKeyHash: updated.canonicalKeyHash ?? null,
          });
        } else {
          // No existing tenant item for this Cat/Sel – create a new one.
          const created = await tx.companyPriceListItem.create({
            data: {
              companyPriceListId: companyPriceList.id,
              cat: u.cat,
              sel: u.sel,
              unitPrice: u.newPrice,
              lastKnownUnitPrice: null,
              lastPriceChangedAt: now,
              lastPriceChangedByUserId: changedByUserId,
              lastPriceChangedSourceImportJobId: null,
              lastPriceChangedSource: source,
            },
          });

          updatedItems.push({
            id: created.id,
            oldPrice: null,
            newPrice: u.newPrice,
            cat: u.cat,
            sel: u.sel,
            canonicalKeyHash: created.canonicalKeyHash ?? null,
          });
        }
      }
    });
  }

  // Write TenantPriceUpdateLog rows for all changes.
  const logsData = updatedItems.map((u) => ({
    companyId,
    companyPriceListId: companyPriceList.id,
    companyPriceListItemId: u.id,
    canonicalKeyHash: u.canonicalKeyHash,
    oldUnitPrice: u.oldPrice,
    newUnitPrice: u.newPrice,
    source,
    sourceImportJobId: null,
    projectId,
    estimateVersionId,
    changedByUserId,
  }));

  if (logsData.length > 0) {
    await prisma.tenantPriceUpdateLog.createMany({ data: logsData });
  }

  return { updatedCount: updatedItems.length };
}

export async function importXactCsvForProject(options: {
  projectId: string;
  csvPath: string;
  importedByUserId?: string;
}) {
  const { projectId, csvPath, importedByUserId } = options;

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error("Project not found");
  }

  const csvRelativePath = path.relative(process.cwd(), csvPath);

  const estimateVersion = await prisma.estimateVersion.create({
    data: {
      projectId,
      sourceType: "xact_raw_carrier",
      fileName: path.basename(csvPath),
      storedPath: csvRelativePath,
      estimateKind: "initial",
      sequenceNo: 0,
      defaultPayerType: "carrier",
      status: "parsing",
      importedByUserId,
    },
  });

  try {
    const trace: any = {
      csvPath,
      phases: {},
    };

    // Strip BOM up-front so delimiter detection and header matching are stable.
    const rawCsv = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");

    // Xact exports are often TSV (tab) but saved with a .csv extension.
    // Rather than guessing from counts (which can fail when header has few separators),
    // try common delimiters and choose the one that produces a multi-column dataset.
    const delimiterCandidates: string[] = ["\t", ",", ";", "|"];

    const tryParse = (delimiter: string) => {
      try {
        const parsedRecordsRaw: any[] = parse(rawCsv, {
          columns: true,
          skip_empty_lines: true,
          delimiter,
          // Be tolerant of slightly malformed exports.
          relax_column_count: true,
          relax_quotes: true,
        });

        const parsedRecords: any[] = parsedRecordsRaw.map(sanitizeRecordHeaders);
        const blankRecordCount = parsedRecords.reduce(
          (n, r) => n + (isBlankCsvRecord(r) ? 1 : 0),
          0,
        );
        const records: any[] = parsedRecords.filter((r) => !isBlankCsvRecord(r));
        const first = records[0] ?? null;
        const columnCount = first ? Object.keys(first).length : 0;

        // Prefer parses that include expected columns.
        const normKeys = first ? Object.keys(first).map(normalizeHeaderLookupKey) : [];
        const hasGroupDesc = normKeys.some((k) => k.includes("group") && k.includes("desc"));
        const hasDesc = normKeys.some((k) => k === "desc" || k.includes("description"));

        return {
          ok: true as const,
          delimiter,
          parsedRecordsCount: parsedRecords.length,
          blankRecordCount,
          records,
          columnCount,
          hasSignalColumns: hasGroupDesc || hasDesc,
        };
      } catch (err: any) {
        return {
          ok: false as const,
          delimiter,
          error: err?.message ?? String(err),
        };
      }
    };

    const attempts = delimiterCandidates.map(tryParse);

    // Choose best: highest column count, then most records, then signal columns.
    const successful = attempts.filter((a: any) => a.ok) as Array<
      ReturnType<typeof tryParse> & { ok: true }
    >;

    successful.sort((a, b) => {
      if (a.columnCount !== b.columnCount) return b.columnCount - a.columnCount;
      if (a.records.length !== b.records.length) return b.records.length - a.records.length;
      if (a.hasSignalColumns !== b.hasSignalColumns) return a.hasSignalColumns ? -1 : 1;
      return 0;
    });

    const best = successful[0] ?? null;

    if (!best || best.records.length === 0 || best.columnCount <= 1) {
      const diag = attempts.map((a: any) => {
        if (!a.ok) return `${a.delimiter}: error=${a.error}`;
        return `${a.delimiter}: cols=${a.columnCount} records=${a.records.length} blanks=${a.blankRecordCount}`;
      });
      throw new Error(
        `XACT_RAW parse produced no usable records (check delimiter/format). Attempts: ${diag.join(" | ")}`,
      );
    }

    const delimiter = best.delimiter;
    const records: any[] = best.records;
    const blankRecordCount = best.blankRecordCount;

    trace.csv = {
      bytes: Buffer.byteLength(rawCsv, "utf8"),
      delimiter,
      parsedRecordsCount: best.parsedRecordsCount,
      blankRecordCount,
      recordCount: records.length,
      columnCount: best.columnCount,
    };

    // Build a per-file header lookup so we can read columns even if the exact
    // header label differs (e.g. "Group Desc" vs "Group Description").
    const headerKeys = Object.keys(records[0] ?? {});
    const headerKeyByNorm = new Map<string, string>();
    for (const k of headerKeys) {
      const nk = normalizeHeaderLookupKey(k);
      if (!headerKeyByNorm.has(nk)) headerKeyByNorm.set(nk, k);
    }

    const getCol = (rec: any, ...aliases: string[]) => {
      for (const a of aliases) {
        const key = headerKeyByNorm.get(normalizeHeaderLookupKey(a));
        if (key && Object.prototype.hasOwnProperty.call(rec, key)) {
          return (rec as any)[key];
        }

        // Fallback: direct access in case this record has different keys.
        if (Object.prototype.hasOwnProperty.call(rec, a)) {
          return (rec as any)[a];
        }

        // Fallback: case/whitespace-insensitive scan (rare).
        const target = normalizeHeaderLookupKey(a);
        for (const k of Object.keys(rec ?? {})) {
          if (normalizeHeaderLookupKey(k) === target) return (rec as any)[k];
        }
      }
      return undefined;
    };


  // Bulk-insert raw rows to avoid thousands of individual INSERT statements
  // against a remote Cloud SQL database.
  //
  // IMPORTANT: The Xactimate "#" field is *not* guaranteed to be sequential
  // or even sorted in the export. To preserve the file's row ordering, we
  // stamp a deterministic createdAt per row and read rows back ordered by
  // createdAt.
  const createdAtBase = new Date();

  const rawRowsData = records.map((record, index) => {
    // Xactimate exports often label the line number column as "#", but we see
    // real-world variants due to BOM/control chars, hidden prefixes, or different
    // export templates.
    const keys = Object.keys(record ?? {});

    const pickLineKey = () => {
      // Highest confidence: header is exactly "#" (after cleaning)
      const exactHash = keys.find((k) => normalizeHeaderLookupKey(k) === "#");
      if (exactHash) return exactHash;

      // Next: header contains a #
      const containsHash = keys.find((k) => normalizeHeaderLookupKey(k).includes("#"));
      if (containsHash) return containsHash;

      // Next: "line no" / "line number" variants
      const lineNoLike = keys.find((k) => {
        const n = normalizeHeaderLookupKey(k);
        return (n.includes("line") && n.includes("no")) || n.includes("line number") || n.includes("linenumber");
      });
      if (lineNoLike) return lineNoLike;

      // Fallback: first column (what users typically expect)
      return keys[0] ?? null;
    };

    const lineKey = pickLineKey();
    const rawLineNoValue = lineKey ? (record[lineKey] as any) : undefined;

    const parsedLineNo = rawLineNoValue
      ? Number(String(rawLineNoValue).replace(/,/g, "")) || 0
      : 0;

    const createdAt = new Date(createdAtBase.getTime() + index);

    return {
      estimateVersionId: estimateVersion.id,
      lineNo: parsedLineNo,

      // Store the *grouping* code (see normalizeGroupCodeForGrouping). The full
      // raw Group Code is still preserved in rawRowJson.
      groupCode: normalizeGroupCodeForGrouping(getCol(record, "Group Code", "GroupCode", "Unit Code", "UnitCode")),
      groupDescription: cleanKeyText(getCol(record, "Group Description", "Group Desc", "GroupDescription", "Room", "Room Name", "Room Description")),
      desc: cleanText(getCol(record, "Desc", "Description", "Item Description")),
      age: toNumber(getCol(record, "Age")),
      condition: cleanText(getCol(record, "Condition")),
      qty: toNumber(getCol(record, "Qty", "Quantity", "QTY")),
      itemAmount: toNumber(getCol(record, "Item Amount", "ItemAmount", "Line Amount", "Amount")),
      reportedCost: toNumber(getCol(record, "Reported Cost", "ReportedCost")),
      unitCost: toNumber(getCol(record, "Unit Cost", "UnitCost", "Unit Price", "UnitPrice")),
      unit: cleanText(getCol(record, "Unit", "UOM", "U/M")),
      coverage: cleanText(getCol(record, "Coverage")),
      activity: cleanText(getCol(record, "Activity")),
      workersWage: toNumber(getCol(record, "Worker's Wage", "Workers Wage", "Worker Wage")),
      laborBurden: toNumber(getCol(record, "Labor burden", "Labor Burden")),
      laborOverhead: toNumber(getCol(record, "Labor Overhead")),
      material: toNumber(getCol(record, "Material")),
      equipment: toNumber(getCol(record, "Equipment")),
      marketConditions: toNumber(getCol(record, "Market Conditions")),
      laborMinimum: toNumber(getCol(record, "Labor Minimum")),
      salesTax: toNumber(getCol(record, "Sales Tax", "SalesTax", "Tax")),
      rcv: toNumber(getCol(record, "RCV")),
      life: getCol(record, "Life") ? Number(getCol(record, "Life")) : null,
      depreciationType: getCol(record, "Depreciation Type", "DepreciationType") || null,
      depreciationAmount: toNumber(getCol(record, "Depreciation Amount", "Depreciation")),
      recoverable: toBooleanYesNo(getCol(record, "Recoverable")),
      acv: toNumber(getCol(record, "ACV")),
      tax: toNumber(getCol(record, "Tax")),
      replaceFlag: toBooleanYesNo(getCol(record, "Replace")),
      cat: cleanText(getCol(record, "Cat", "Category")),
      sel: cleanText(getCol(record, "Sel", "Selection")),
      owner: cleanText(getCol(record, "Owner")),
      originalVendor: cleanText(getCol(record, "Original Vendor", "OriginalVendor")),
      sourceName: cleanText(getCol(record, "Source Name", "SourceName")),
      sourceDate: toDate(getCol(record, "Date")),
      note1: cleanNote(getCol(record, "Note 1", "Note1")),
      adjSource: getCol(record, "ADJ_SOURCE") || null,

      rawRowJson: record as any,

      createdAt,
      updatedAt: createdAt,
    };
  });

  // Insert raw rows in chunks. A single createMany with thousands of rows can
  // hit database/driver limits (e.g., Postgres parameter limits).
  //
  // Use a conservative chunk size because RawXactRow has many columns.
  const rawChunkSize = 250;
  let rawInserted = 0;
  for (let i = 0; i < rawRowsData.length; i += rawChunkSize) {
    const chunk = rawRowsData.slice(i, i + rawChunkSize);
    if (chunk.length === 0) continue;
    const res = await prisma.rawXactRow.createMany({ data: chunk });
    rawInserted += res.count;
    if (res.count !== chunk.length) {
      throw new Error(
        `XACT_RAW raw row insert mismatch: attempted ${chunk.length} but inserted ${res.count} (chunk starting at index ${i}).`,
      );
    }
  }

  trace.phases.rawRows = {
    attempted: rawRowsData.length,
    inserted: rawInserted,
    chunkSize: rawChunkSize,
  };

  if (rawInserted !== rawRowsData.length) {
    throw new Error(
      `XACT_RAW raw row insert mismatch: attempted ${rawRowsData.length} but inserted ${rawInserted}.`,
    );
  }

  const rawRows = await prisma.rawXactRow.findMany({
    where: { estimateVersionId: estimateVersion.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  // If raw row insert partially succeeded, downstream logic will silently skip
  // records due to rawRows[i] being undefined. Fail fast instead.
  if (rawRows.length !== rawRowsData.length) {
    throw new Error(
      `XACT_RAW import incomplete: parsed ${rawRowsData.length} CSV record(s) but inserted ${rawRows.length} raw row(s).`,
    );
  }

  // --- Phase 1: precompute all unit / particle keys so we can batch DB work ---
  //
  // IMPORTANT: In Xactimate exports, Group Code behaves like the *parent* grouping
  // (e.g. UNIT_01), and Group Description identifies the *child* group/room.
  // To keep particle identity stable across imports, we key particles by:
  //   (Group Code, Group Description)
  // rather than parsing the unit label out of Group Description.
  type ParticleKeyInfo = {
    unitExternalCode: string;
    unitLabel: string;
    roomName: string;
    groupCode: string | null;
    groupDescription: string;
  };

  const particleKeyToInfo = new Map<string, ParticleKeyInfo>();
  const unitExternalCodes = new Set<string>();
  const unitLabelByExternalCode = new Map<string, string>();

  for (const record of records) {
    const groupDescription = cleanKeyText(getCol(record, "Group Description", "Group Desc", "GroupDescription", "Room", "Room Name", "Room Description"));
    if (!groupDescription) continue;

    // Group Code is the authoritative *unit grouping* in Xact exports.
    // Group Description is the authoritative room / particle label.
    const groupCode = normalizeGroupCodeForGrouping(getCol(record, "Group Code", "GroupCode", "Unit Code", "UnitCode"));

    const unitExternalCode = groupCode ?? "__no_group_code__";
    const unitLabel = parseUnitLabelFromGroupCode(groupCode) ?? (groupCode ?? "(No unit)");

    unitExternalCodes.add(unitExternalCode);
    if (!unitLabelByExternalCode.has(unitExternalCode)) {
      unitLabelByExternalCode.set(unitExternalCode, unitLabel);
    }

    const particleKey = particleExternalKey(unitExternalCode, groupDescription);
    if (!particleKeyToInfo.has(particleKey)) {
      particleKeyToInfo.set(particleKey, {
        unitExternalCode,
        unitLabel,
        roomName: groupDescription,
        groupCode,
        groupDescription,
      });
    }
  }

  trace.phases.keys = {
    unitExternalCodeCount: unitExternalCodes.size,
    particleKeyCount: particleKeyToInfo.size,
  };

  // --- Phase 2: ensure all units exist (reusing existing ones when present) ---
  const existingUnits = await prisma.projectUnit.findMany({
    where: { projectId },
    select: { id: true, label: true, externalCode: true }
  });

  const unitByExternalCode = new Map<string, (typeof existingUnits)[number]>();
  const unitByLabel = new Map<string, (typeof existingUnits)[number]>();

  for (const u of existingUnits) {
    unitByLabel.set(u.label, u);
    if (u.externalCode) {
      unitByExternalCode.set(u.externalCode.trim(), u);
    }
  }

  const unitsToCreate: Array<{ projectId: string; companyId: string; label: string; externalCode?: string | null }> = [];

  // Track units we plan to create in this import run, so we don't enqueue two creates
  // with the same (projectId, label), which would violate the unique constraint.
  const plannedUnitLabels = new Set<string>();
  let skippedDuplicatePlannedUnitLabel = 0;

  // Merge backfill + rename updates per unit.
  const unitUpdateById = new Map<string, { externalCode?: string; label?: string }>();

  const queueUnitUpdate = (id: string, patch: { externalCode?: string; label?: string }) => {
    const existing = unitUpdateById.get(id) ?? {};
    unitUpdateById.set(id, { ...existing, ...patch });
  };

  for (const extCode of unitExternalCodes) {
    const desiredLabel = unitLabelByExternalCode.get(extCode) ?? extCode;
    const legacyLabel = legacyUnitLabelFromPadded(desiredLabel);

    // Reuse by externalCode when possible.
    const existingByExt = unitByExternalCode.get(extCode);
    if (existingByExt) {
      // Keep display label consistent with our preferred formatting (Unit 01..)
      if (existingByExt.label !== desiredLabel) {
        const conflict = unitByLabel.get(desiredLabel);
        if (!conflict || conflict.id === existingByExt.id) {
          queueUnitUpdate(existingByExt.id, { label: desiredLabel });
          unitByLabel.delete(existingByExt.label);
          unitByLabel.set(desiredLabel, { ...existingByExt, label: desiredLabel });
        }
      }
      continue;
    }

    // Otherwise reuse by label; support legacy (unpadded) labels as well.
    const existingByLabel =
      unitByLabel.get(desiredLabel) ?? (legacyLabel ? unitByLabel.get(legacyLabel) : undefined);

    if (existingByLabel) {
      // Backfill external code if missing.
      if (!existingByLabel.externalCode) {
        queueUnitUpdate(existingByLabel.id, { externalCode: extCode });
        unitByExternalCode.set(extCode, { ...existingByLabel, externalCode: extCode });
      }

      // If we matched a legacy label, rename it to the padded label (if no conflict).
      if (legacyLabel && existingByLabel.label === legacyLabel && desiredLabel !== legacyLabel) {
        const conflict = unitByLabel.get(desiredLabel);
        if (!conflict || conflict.id === existingByLabel.id) {
          queueUnitUpdate(existingByLabel.id, { label: desiredLabel });
          unitByLabel.delete(existingByLabel.label);
          unitByLabel.set(desiredLabel, { ...existingByLabel, label: desiredLabel });
        }
      }

      continue;
    }

    if (plannedUnitLabels.has(desiredLabel)) {
      // Example: UNIT_01 and UINT_01 both normalize to label "Unit 01".
      // We create one unit row for the label and let particles map by label fallback.
      skippedDuplicatePlannedUnitLabel += 1;
      continue;
    }

    plannedUnitLabels.add(desiredLabel);

    unitsToCreate.push({
      projectId,
      companyId: project!.companyId,
      label: desiredLabel,
      externalCode: extCode,
    });
  }

  trace.phases.units = {
    existingUnitCount: existingUnits.length,
    willCreate: unitsToCreate.length,
    willUpdate: unitUpdateById.size,
    skippedDuplicatePlannedUnitLabel,
  };

  // Apply any queued updates (small count; keep it simple).
  for (const [id, data] of unitUpdateById.entries()) {
    await prisma.projectUnit.update({ where: { id }, data });
  }

  if (unitsToCreate.length > 0) {
    const res = await prisma.projectUnit.createMany({ data: unitsToCreate });
    if (res.count !== unitsToCreate.length) {
      throw new Error(
        `XACT_RAW unit insert mismatch: attempted ${unitsToCreate.length} but inserted ${res.count}.`,
      );
    }
  }

  const allUnits = await prisma.projectUnit.findMany({
    where: { projectId },
    select: { id: true, label: true, externalCode: true }
  });

  const unitByExternal = new Map<string, (typeof allUnits)[number]>();
  const unitByLabelFinal = new Map<string, (typeof allUnits)[number]>();

  for (const u of allUnits) {
    unitByLabelFinal.set(u.label.trim(), u);
    if (u.externalCode) {
      unitByExternal.set(u.externalCode.trim(), u);
    }
  }

  // --- Phase 3: ensure all particles exist and build a key -> id map ---
  const existingParticles = await prisma.projectParticle.findMany({
    where: { projectId },
    select: {
      id: true,
      unitId: true,
      externalGroupCode: true,
      externalGroupDescription: true,
    },
  });

  const particleIdByKey = new Map<string, string>();
  for (const p of existingParticles) {
    const code = p.externalGroupCode ? p.externalGroupCode.trim() : null;
    const desc = p.externalGroupDescription ? normalizeKeyPart(p.externalGroupDescription) : null;
    if (!code || !desc) continue;
    const key = particleExternalKey(code, desc);
    if (!particleIdByKey.has(key)) {
      particleIdByKey.set(key, p.id);
    }
  }

  const particlesToCreate: any[] = [];
  for (const [key, info] of particleKeyToInfo.entries()) {
    if (particleIdByKey.has(key)) continue;

    const unitKey = info.unitExternalCode.trim();

    // Unit external codes are stable when Group Code is a UNIT_XX value. For other group codes
    // (e.g. WASH_U), we may have reused an existing unit by *label* to avoid violating the
    // (projectId, label) uniqueness constraint. In that case, fall back to label lookup.
    const unit = unitByExternal.get(unitKey) ?? unitByLabelFinal.get(info.unitLabel.trim()) ?? null;

    particlesToCreate.push({
      projectId,
      companyId: project!.companyId,
      unitId: unit?.id ?? null,
      type: "ROOM",
      name: info.roomName,
      fullLabel: `${info.unitLabel} - ${info.roomName}`,
      externalGroupCode: info.groupCode,
      externalGroupDescription: info.groupDescription
    });
  }

  trace.phases.particles = {
    existingParticleCount: existingParticles.length,
    willCreate: particlesToCreate.length,
  };

  if (particlesToCreate.length > 0) {
    const res = await prisma.projectParticle.createMany({ data: particlesToCreate });
    if (res.count !== particlesToCreate.length) {
      throw new Error(
        `XACT_RAW particle insert mismatch: attempted ${particlesToCreate.length} but inserted ${res.count}.`,
      );
    }
  }

  const allParticles = await prisma.projectParticle.findMany({
    where: { projectId },
    select: {
      id: true,
      unitId: true,
      fullLabel: true,
      externalGroupCode: true,
      externalGroupDescription: true,
    },
  });

  particleIdByKey.clear();
  for (const p of allParticles) {
    const code = p.externalGroupCode ? p.externalGroupCode.trim() : null;
    const desc = p.externalGroupDescription ? normalizeKeyPart(p.externalGroupDescription) : null;
    if (!code || !desc) continue;
    const key = particleExternalKey(code, desc);
    if (!particleIdByKey.has(key)) {
      particleIdByKey.set(key, p.id);
    }
  }

  // Keep imported particles aligned with our unit grouping (Group Code) and labels.
  const desiredByKey = new Map<string, { fullLabel: string; unitId: string | null }>();
  for (const [key, info] of particleKeyToInfo.entries()) {
    const unitKey = info.unitExternalCode.trim();

    // Same logic as particle creation: prefer externalCode (Group Code), but fall back to
    // label lookup to handle historical/case differences (e.g. UNIT_01 vs Unit_01).
    const unit = unitByExternal.get(unitKey) ?? unitByLabelFinal.get(info.unitLabel.trim()) ?? null;

    desiredByKey.set(key, {
      fullLabel: `${info.unitLabel} - ${info.roomName}`,
      unitId: unit?.id ?? null,
    });
  }

  let particlesUpdated = 0;
  for (const p of allParticles) {
    const code = p.externalGroupCode ? p.externalGroupCode.trim() : null;
    const desc = p.externalGroupDescription ? normalizeKeyPart(p.externalGroupDescription) : null;
    if (!code || !desc) continue;

    const key = particleExternalKey(code, desc);
    const desired = desiredByKey.get(key);
    if (!desired) continue;

    if (p.fullLabel !== desired.fullLabel || (p.unitId ?? null) !== desired.unitId) {
      await prisma.projectParticle.update({
        where: { id: p.id },
        data: { fullLabel: desired.fullLabel, unitId: desired.unitId },
      });
      particlesUpdated += 1;
    }
  }

  trace.phases.particles = {
    ...(trace.phases.particles ?? {}),
    updated: particlesUpdated,
  };
  // --- Phase 4: pre-create logical items for each distinct (particle, signature) ---
  const logicalKeyToData = new Map<string, { projectParticleId: string; signature: string }>();

  for (const record of records) {
    const groupDescription = cleanKeyText(
      getCol(record, "Group Description", "Group Desc", "GroupDescription", "Room", "Room Name", "Room Description"),
    );
    if (!groupDescription) continue;

    const groupCode = normalizeGroupCodeForGrouping(
      getCol(record, "Group Code", "GroupCode", "Unit Code", "UnitCode"),
    );

    const unitExternalCode = groupCode ?? "__no_group_code__";

    const particleKey = particleExternalKey(unitExternalCode, groupDescription);
    const projectParticleId = particleIdByKey.get(particleKey);
    if (!projectParticleId) continue;

    const signature = computeSignature(record, getCol);
    const logicalKey = `${projectParticleId}:${signature}`;
    if (!logicalKeyToData.has(logicalKey)) {
      logicalKeyToData.set(logicalKey, { projectParticleId, signature });
    }
  }

  const logicalItemsToCreate = Array.from(logicalKeyToData.values()).map(
    ({ projectParticleId, signature }) => ({
      projectId,
      projectParticleId,
      signatureHash: signature
    })
  );

  // Create logical items in chunks for the same reason we chunk raw rows.
  const logicalChunkSize = 1000;
  let logicalInserted = 0;
  for (let i = 0; i < logicalItemsToCreate.length; i += logicalChunkSize) {
    const chunk = logicalItemsToCreate.slice(i, i + logicalChunkSize);
    if (chunk.length === 0) continue;
    const res = await prisma.sowLogicalItem.createMany({ data: chunk });
    logicalInserted += res.count;
    if (res.count !== chunk.length) {
      throw new Error(
        `XACT_RAW logical item insert mismatch: attempted ${chunk.length} but inserted ${res.count} (chunk starting at index ${i}).`,
      );
    }
  }

  trace.phases.logicalItems = {
    attempted: logicalItemsToCreate.length,
    inserted: logicalInserted,
    chunkSize: logicalChunkSize,
  };

  const allLogicalItems = await prisma.sowLogicalItem.findMany({
    where: { projectId }
  });
  const logicalIdByKey = new Map<string, string>();
  for (const logical of allLogicalItems) {
    const key = `${logical.projectParticleId}:${logical.signatureHash}`;
    if (!logicalIdByKey.has(key)) {
      logicalIdByKey.set(key, logical.id);
    }
  }

  // --- Phase 5: build SOW + PETL rows using the precomputed maps ---
  const sow = await prisma.sow.create({
    data: {
      projectId,
      estimateVersionId: estimateVersion.id,
      sourceType: "xact_raw_carrier",
      totalAmount: null
    }
  });

  const sowItemsData: any[] = [];

  // Track skipped rows so we never silently drop line items.
  let skippedNoRaw = 0;
  let skippedNoGroupDescription = 0;
  let skippedNoParticle = 0;
  const skippedParticleExamples: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const raw = rawRows[i];

    if (!raw) {
      skippedNoRaw += 1;
      continue;
    }

    const groupDescription =
      cleanKeyText(getCol(record, "Group Description", "Group Desc", "GroupDescription", "Room", "Room Name", "Room Description")) || "";
    if (!groupDescription) {
      skippedNoGroupDescription += 1;
      continue;
    }

    const groupCode = normalizeGroupCodeForGrouping(getCol(record, "Group Code", "GroupCode", "Unit Code", "UnitCode"));

    const unitExternalCode = groupCode ?? "__no_group_code__";

    const particleKey = particleExternalKey(unitExternalCode, groupDescription);
    const projectParticleId = particleIdByKey.get(particleKey);
    if (!projectParticleId) {
      skippedNoParticle += 1;
      if (skippedParticleExamples.length < 5) {
        skippedParticleExamples.push(`${particleKey}`);
      }
      continue;
    }

    const signature = computeSignature(record, getCol);
    const logicalKey = `${projectParticleId}:${signature}`;

    let logicalItemId = logicalIdByKey.get(logicalKey);
    if (!logicalItemId) {
      // Extremely rare fallback: create on-demand if the pre-create path missed one
      const logical = await prisma.sowLogicalItem.create({
        data: {
          projectId,
          projectParticleId,
          signatureHash: signature
        }
      });
      logicalItemId = logical.id;
      logicalIdByKey.set(logicalKey, logicalItemId!);
    }

    sowItemsData.push({
      sowId: sow.id,
      estimateVersionId: estimateVersion.id,
      rawRowId: raw.id,
      logicalItemId,
      projectParticleId,
      // PETL line numbers are managed internally and should be sequential.
      lineNo: sowItemsData.length + 1,
      // Persist the original Xactimate "#" column (from RawXactRow.lineNo) so the UI can display
      // the same line item numbers users see in the source CSV.
      sourceLineNo: raw.lineNo && raw.lineNo > 0 ? raw.lineNo : null,
      description: cleanText(getCol(record, "Desc", "Description", "Item Description")) || "",
      qty: toNumber(getCol(record, "Qty", "Quantity", "QTY")),
      unit: getCol(record, "Unit", "UOM", "U/M") || null,
      unitCost: toNumber(getCol(record, "Unit Cost", "UnitCost", "Unit Price", "UnitPrice")),
      itemAmount: toNumber(getCol(record, "Item Amount", "ItemAmount", "Line Amount", "Amount")),
      rcvAmount: toNumber(getCol(record, "RCV")),
      acvAmount: toNumber(getCol(record, "ACV")),
      depreciationAmount: toNumber(getCol(record, "Depreciation Amount", "Depreciation")),
      salesTaxAmount: toNumber(getCol(record, "Sales Tax", "SalesTax", "Tax")),
      categoryCode: getCol(record, "Cat", "Category") || null,
      selectionCode: getCol(record, "Sel", "Selection") || null,
      activity: getCol(record, "Activity") || null,
      materialAmount: toNumber(getCol(record, "Material")),
      equipmentAmount: toNumber(getCol(record, "Equipment")),
      payerType: estimateVersion.defaultPayerType,
      performed: false,
      eligibleForAcvRefund: false,
      acvRefundAmount: null,
      percentComplete: 50
    });
  }

  // If we skipped any rows, fail fast. We want PETL to reflect the CSV precisely.
  const skippedTotal = skippedNoRaw + skippedNoGroupDescription + skippedNoParticle;
  if (skippedTotal > 0) {
    throw new Error(
      [
        `XACT_RAW import skipped ${skippedTotal}/${records.length} CSV row(s).`,
        skippedNoRaw ? `missing raw row mapping: ${skippedNoRaw}` : null,
        skippedNoGroupDescription ? `missing Group Description: ${skippedNoGroupDescription}` : null,
        skippedNoParticle ? `missing particle mapping: ${skippedNoParticle}` : null,
        skippedParticleExamples.length ? `examples: ${skippedParticleExamples.join(" | ")}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  trace.phases.sowItems = {
    csvRecordCount: records.length,
    built: sowItemsData.length,
    skipped: {
      missingRaw: skippedNoRaw,
      missingGroupDescription: skippedNoGroupDescription,
      missingParticle: skippedNoParticle,
      examples: skippedParticleExamples,
    },
  };

  // Larger batch size reduces DB round-trips during SOW item insert.
  // Use a moderate chunk size; SowItem has many columns and we want to avoid
  // parameter/statement limits in remote DBs.
  const chunkSize = 250;
  let sowInserted = 0;
  for (let i = 0; i < sowItemsData.length; i += chunkSize) {
    const chunk = sowItemsData.slice(i, i + chunkSize);
    const res = await prisma.sowItem.createMany({ data: chunk });
    sowInserted += res.count;
    if (res.count !== chunk.length) {
      throw new Error(
        `XACT_RAW sow item insert mismatch: attempted ${chunk.length} but inserted ${res.count} (chunk starting at index ${i}).`,
      );
    }
  }

  trace.phases.sowItems = {
    ...(trace.phases.sowItems ?? {}),
    inserted: sowInserted,
    chunkSize,
  };

  if (sowInserted !== sowItemsData.length) {
    throw new Error(
      `XACT_RAW sow item insert mismatch: attempted ${sowItemsData.length} but inserted ${sowInserted}.`,
    );
  }

  const sowItemCountInDb = await prisma.sowItem.count({ where: { sowId: sow.id } });
  trace.phases.sowItems = {
    ...(trace.phases.sowItems ?? {}),
    countedInDb: sowItemCountInDb,
  };

  if (sowItemCountInDb !== sowItemsData.length) {
    throw new Error(
      `XACT_RAW sow item count mismatch after insert: expected ${sowItemsData.length} but found ${sowItemCountInDb} in DB.`,
    );
  }

  // Baseline SOW total on RCV; fall back to Item Amount only if RCV is missing.
  const totalAmount = sowItemsData.reduce(
    (sum: number, item: any) => sum + (item.rcvAmount ?? item.itemAmount ?? 0),
    0
  );

  await prisma.$transaction([
    prisma.estimateVersion.update({
      where: { id: estimateVersion.id },
      data: {
        status: "completed",
        importedAt: new Date(),
      },
    }),
    prisma.sow.update({
      where: { id: sow.id },
      data: { totalAmount },
    }),
  ]);

  // Load SOW items from the database so we can update the tenant cost book
  // (Tenant Golden PETL) based on observed unit costs in this estimate.
  const sowItems = await prisma.sowItem.findMany({
    where: { sowId: sow.id },
    select: {
      categoryCode: true,
      selectionCode: true,
      unitCost: true,
    },
  });

  await updateTenantGoldenFromPetl({
    companyId: project.companyId,
    projectId,
    estimateVersionId: estimateVersion.id,
    sowItems,
    changedByUserId: importedByUserId,
    source: "PROJECT_PETL_IMPORT",
  });

  const goldenUpdate = await updateGoldenFromEstimate(estimateVersion.id);

  return {
    projectId,
    estimateVersionId: estimateVersion.id,
    sowId: sow.id,
    itemCount: sowItemsData.length,
    totalAmount,
    goldenUpdate,
    trace,
  };
  } catch (err: any) {
    const message = err?.message ?? String(err);

    // Mark the estimate as failed so the API doesn't treat partial data as the active PETL.
    try {
      await prisma.estimateVersion.update({
        where: { id: estimateVersion.id },
        data: {
          status: "failed",
          errorMessage: message,
        },
      });
    } catch {
      // best effort
    }

    throw err;
  }
}
