import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "@repo/database";

function toNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[$,]/g, "");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value)
    .replace(/\r?\n/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

function toDate(value: string | null | undefined): Date | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function importPriceListFromFile(csvPath: string) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  const rawCsv = fs.readFileSync(csvPath, "utf8");

  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
  });

  if (!records.length) {
    throw new Error("Price list CSV has no data rows");
  }

  // Compute revision from latest GOLDEN.
  const latest = await prisma.priceList.findFirst({
    where: { kind: "GOLDEN" },
    orderBy: { revision: "desc" },
  });
  const revision = latest ? latest.revision + 1 : 1;

  // If we have a previous GOLDEN revision, capture its unitPrice values by
  // canonicalKeyHash so we can stamp them into lastKnownUnitPrice for the new
  // revision. This keeps the "Last known price" column meaningful regardless
  // of whether changes came from Xact RAW repricing or a Golden PETL upload.
  const prevPriceByCanonicalHash = new Map<string, number | null>();
  if (latest) {
    const prevItems = await prisma.priceListItem.findMany({
      where: { priceListId: latest.id },
      select: { canonicalKeyHash: true, unitPrice: true },
    });
    for (const it of prevItems) {
      if (!it.canonicalKeyHash) continue;
      if (!prevPriceByCanonicalHash.has(it.canonicalKeyHash)) {
        prevPriceByCanonicalHash.set(it.canonicalKeyHash, it.unitPrice);
      }
    }
  }

  // Derive an effective date from the data (max of Date column).
  let effectiveDate: Date | null = null;
  for (const record of records) {
    const d = toDate(record["Date"] as string | undefined);
    if (d && (!effectiveDate || d > effectiveDate)) {
      effectiveDate = d;
    }
  }

  const label = effectiveDate
    ? `Golden Price List (${effectiveDate.toISOString().slice(0, 10)})`
    : "Golden Price List";

  // Preload Cat -> Division mapping so we can stamp divisionCode onto
  // each Golden price list item at import time.
  const catDivisions = await prisma.catDivision.findMany({});
  const divisionByCat = new Map<string, string>();
  for (const row of catDivisions) {
    const key = row.cat.trim().toUpperCase();
    if (!divisionByCat.has(key)) {
      divisionByCat.set(key, row.divisionCode);
    }
  }

  const { priceListId, itemCount } = await prisma.$transaction(async (tx) => {
    await tx.priceList.updateMany({
      where: { kind: "GOLDEN", isActive: true },
      data: { isActive: false },
    });

    const priceList = await tx.priceList.create({
      data: {
        kind: "GOLDEN",
        code: "XACT_ALL",
        label,
        revision,
        effectiveDate: effectiveDate ?? new Date(),
        currency: "USD",
        isActive: true,
      },
    });

    const itemsData = records.map((record) => {
      const rawLineNoValue =
        (record["#"] as string | undefined) ??
        (record["\u001b#"] as string | undefined) ??
        ("﻿#" in record ? (record["﻿#"] as string | undefined) : undefined) ??
        (record[Object.keys(record)[0] ?? ""] as string | undefined);

      const parsedLineNo = rawLineNoValue
        ? Number(String(rawLineNoValue).replace(/,/g, "")) || 0
        : 0;

      const cat = cleanText(record["Cat"]);
      const sel = cleanText(record["Sel"]);
      const activity = cleanText(record["Activity"]);
      const description = cleanText(record["Desc"]);

      const divisionCode = cat
        ? divisionByCat.get(cat.trim().toUpperCase()) ?? null
        : null;

      const norm = (v: string | null) =>
        (v ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .toUpperCase();

      const canonicalKeyString = [
        norm(cat),
        norm(sel),
        norm(activity),
        norm(description),
      ].join("||");

      const crypto = require("node:crypto");
      const canonicalKeyHash: string = crypto
        .createHash("sha256")
        .update(canonicalKeyString, "utf8")
        .digest("hex");

      const previousUnitPrice = prevPriceByCanonicalHash.get(canonicalKeyHash) ?? null;

      return {
        priceListId: priceList.id,
        lineNo: parsedLineNo,
        groupCode: cleanText(record["Group Code"]),
        groupDescription: cleanText(record["Group Description"]),
        description,
        cat,
        sel,
        unit: cleanText(record["Unit"]),
        unitPrice: toNumber(record["Unit Cost"]),
        lastKnownUnitPrice: previousUnitPrice,
        coverage: cleanText(record["Coverage"]),
        activity,
        owner: cleanText(record["Owner"]),
        sourceVendor: cleanText(record["Original Vendor"]),
        sourceDate: toDate(record["Date"] as string | undefined),
        rawJson: record as any,
        canonicalKeyHash,
        divisionCode,
      };
    });

    const chunkSize = 500;
    for (let i = 0; i < itemsData.length; i += chunkSize) {
      const chunk = itemsData.slice(i, i + chunkSize);
      await tx.priceListItem.createMany({ data: chunk });
    }

    return { priceListId: priceList.id, itemCount: itemsData.length };
  }, { timeout: 600000 });

  return { priceListId, revision, itemCount };
}

export async function getCurrentGoldenPriceList() {
  const priceList = await prisma.priceList.findFirst({
    where: { kind: "GOLDEN", isActive: true },
    orderBy: { revision: "desc" },
  });

  if (!priceList) {
    return null;
  }

  const itemCount = await prisma.priceListItem.count({
    where: { priceListId: priceList.id },
  });

  return {
    id: priceList.id,
    kind: priceList.kind,
    code: priceList.code,
    label: priceList.label,
    revision: priceList.revision,
    effectiveDate: priceList.effectiveDate,
    currency: priceList.currency,
    isActive: priceList.isActive,
    itemCount,
    // When the Golden was imported into Nexus (upload timestamp),
    // distinct from the effective date embedded in the Xactimate data.
    createdAt: priceList.createdAt,
  };
}

// List recent Golden price list uploads (by PriceList.createdAt),
// so the UI can show an "N latest uploads" panel.
export async function getGoldenPriceListUploads(limit: number) {
  const lists = await prisma.priceList.findMany({
    where: { kind: "GOLDEN" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (!lists.length) return [];

  const counts: Record<string, number> = {};
  for (const pl of lists) {
    // Small N (e.g. 10), so individual counts are acceptable.
    // If this ever becomes a bottleneck, we can switch to groupBy.
    // eslint-disable-next-line no-await-in-loop
    const count = await prisma.priceListItem.count({
      where: { priceListId: pl.id },
    });
    counts[pl.id] = count;
  }

  return lists.map(pl => ({
    id: pl.id,
    label: pl.label,
    revision: pl.revision,
    effectiveDate: pl.effectiveDate,
    uploadedAt: pl.createdAt,
    itemCount: counts[pl.id] ?? 0,
  }));
}

// Return a raw table view of the active Golden price list, with
// division codes attached where Cat -> Division mappings exist.
export async function getCurrentGoldenPriceListTable() {
  const priceList = await prisma.priceList.findFirst({
    where: { kind: "GOLDEN", isActive: true },
    orderBy: { revision: "desc" },
  });

  if (!priceList) {
    return null;
  }

  const [items, catMappings] = await Promise.all([
    prisma.priceListItem.findMany({
      where: { priceListId: priceList.id },
      orderBy: { lineNo: "asc" },
      select: {
        lineNo: true,
        cat: true,
        sel: true,
        description: true,
        unit: true,
        unitPrice: true,
        lastKnownUnitPrice: true,
        coverage: true,
        activity: true,
      },
    }),
    prisma.catDivision.findMany({
      include: { division: true },
    }),
  ]);

  const byCat = new Map<string, { divisionCode: string; divisionName: string | null }>();
  for (const row of catMappings) {
    const key = row.cat.trim().toUpperCase();
    byCat.set(key, {
      divisionCode: row.divisionCode,
      divisionName: row.division?.name ?? null,
    });
  }

  const rows = items.map((item) => {
    const catKey = (item.cat ?? "").trim().toUpperCase();
    const mapping = catKey ? byCat.get(catKey) ?? null : null;
    return {
      lineNo: item.lineNo,
      cat: item.cat,
      sel: item.sel,
      description: item.description,
      unit: item.unit,
      unitPrice: item.unitPrice,
      lastKnownUnitPrice: item.lastKnownUnitPrice,
      coverage: item.coverage,
      activity: item.activity,
      divisionCode: mapping?.divisionCode ?? null,
      divisionName: mapping?.divisionName ?? null,
    };
  });

  return {
    priceList: {
      id: priceList.id,
      label: priceList.label,
      revision: priceList.revision,
      effectiveDate: priceList.effectiveDate,
      itemCount: rows.length,
    },
    rows,
  };
}
