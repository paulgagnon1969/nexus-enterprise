import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { prisma } from "./index";

function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value)
    .replace(/\r?\n/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function moneyToNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Remove currency symbols, commas, spaces, and the trailing asterisk used in Xact exports
  const normalized = trimmed
    .replace(/[$,\s]/g, "")
    .replace(/\*/g, "");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function toBooleanYesNo(value: string | null | undefined): boolean | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "yes" || v === "y") return true;
  if (v === "no" || v === "n") return false;
  return null;
}

export async function importXactComponentsRecordsForEstimate(options: {
  estimateVersionId: string;
  projectId: string;
  records: any[];
  skipWipe?: boolean;
}) {
  const { estimateVersionId, projectId, records, skipWipe } = options;

  if (records.length === 0) {
    return {
      estimateVersionId,
      projectId,
      rawCount: 0,
      summaryCount: 0,
    };
  }

  if (!skipWipe) {
    // Wipe any prior import for this estimate so we can safely re-import.
    await prisma.$transaction([
      prisma.rawComponentRow.deleteMany({ where: { estimateVersionId } }),
      prisma.componentSummary.deleteMany({ where: { estimateVersionId } }),
    ]);
  }

  const now = new Date();

  const rawRowsData = records.map((record) => {
    const code = record["Code"] as string | undefined;
    const description = record["Description"] as string | undefined;
    const taxStatus = record["Tax Status"] as string | undefined;
    const contractorSupplied = record["Contractor Supplied"] as string | undefined;
    const quantity = record["Quantity"] as string | undefined;
    const unit = record["Unit"] as string | undefined;
    const unitPrice = record["Unit Price"] as string | undefined;
    const total = record["Total"] as string | undefined;
    const requestThirdPartyPricing = record["Request third-party pricing"] as
      | string
      | undefined;

    return {
      estimateVersionId,
      code: cleanText(code),
      description: cleanText(description),
      taxStatus: cleanText(taxStatus),
      contractorSuppliedRaw: contractorSupplied ?? null,
      quantityRaw: quantity ?? null,
      unitRaw: unit ?? null,
      unitPriceRaw: unitPrice ?? null,
      totalRaw: total ?? null,
      requestThirdPartyPricingRaw: requestThirdPartyPricing ?? null,
      rawRowJson: record,
      createdAt: now,
      updatedAt: now,
    };
  });

  await prisma.rawComponentRow.createMany({ data: rawRowsData });

  const summariesData = records.map((record) => {
    const code = record["Code"] as string | undefined;
    const description = record["Description"] as string | undefined;
    const taxStatus = record["Tax Status"] as string | undefined;
    const contractorSupplied = record["Contractor Supplied"] as string | undefined;
    const quantity = record["Quantity"] as string | undefined;
    const unit = record["Unit"] as string | undefined;
    const unitPrice = record["Unit Price"] as string | undefined;
    const total = record["Total"] as string | undefined;
    const requestThirdPartyPricing = record["Request third-party pricing"] as
      | string
      | undefined;

    return {
      projectId,
      estimateVersionId,
      code: cleanText(code) ?? "",
      description: cleanText(description),
      taxStatus: cleanText(taxStatus),
      contractorSupplied: toBooleanYesNo(contractorSupplied),
      quantity: toNumber(quantity),
      unit: cleanText(unit),
      unitPrice: moneyToNumber(unitPrice),
      total: moneyToNumber(total),
      requestThirdPartyPricing: toBooleanYesNo(requestThirdPartyPricing),
      createdAt: now,
      updatedAt: now,
    };
  });

  await prisma.componentSummary.createMany({ data: summariesData });

  return {
    estimateVersionId,
    projectId,
    rawCount: rawRowsData.length,
    summaryCount: summariesData.length,
  };
}

export async function importXactComponentsChunkForEstimate(options: {
  estimateVersionId: string;
  projectId: string;
  csvPath: string;
}) {
  const { estimateVersionId, projectId, csvPath } = options;

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Components chunk CSV not found at ${csvPath}`);
  }

  const rawCsv = fs.readFileSync(csvPath, "utf8");
  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
  });

  return importXactComponentsRecordsForEstimate({
    estimateVersionId,
    projectId,
    records,
    skipWipe: true,
  });
}

export async function importXactComponentsCsvForEstimate(options: {
  estimateVersionId: string;
  csvPath: string;
}) {
  const { estimateVersionId, csvPath } = options;

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Components CSV not found at ${csvPath}`);
  }

  const estimateVersion = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true },
  });

  if (!estimateVersion) {
    throw new Error("EstimateVersion not found");
  }

  const projectId = estimateVersion.projectId;

  const rawCsv = fs.readFileSync(csvPath, "utf8");
  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
  });

  const result = await importXactComponentsRecordsForEstimate({
    estimateVersionId,
    projectId,
    records,
    skipWipe: false,
  });

  return {
    ...result,
    csvPath: path.relative(process.cwd(), csvPath),
  };
}
