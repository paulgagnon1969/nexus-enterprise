import fs from "node:fs";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import prisma from "./client";

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
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[$,]/g, "");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function normalizePart(v: string | null): string {
  return (v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function buildCanonicalKeyHash(parts: {
  cat: string | null;
  sel: string | null;
  activity: string | null;
  description: string | null;
}): string {
  const key = [
    normalizePart(parts.cat),
    normalizePart(parts.sel),
    normalizePart(parts.activity),
    normalizePart(parts.description),
  ].join("||");

  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

/**
 * Import Golden price list components for the current active GOLDEN PriceList
 * from a CSV file. The CSV is expected to contain, at minimum, the following
 * columns:
 *
 *   Cat, Sel, Activity, Desc, Component Code, Qty, Material, Labor, Equipment
 *
 * For each row, we compute the canonicalKeyHash from (Cat, Sel, Activity,
 * Desc), resolve the parent PriceListItem in the active GOLDEN list, and then
 * upsert a PriceListComponent record keyed by (priceListItemId, Component Code).
 *
 * Existing components for any PriceListItem touched by this import are
 * deleted first, so the component set for that item is kept in sync with the
 * latest file.
 */
export async function importGoldenComponentsFromFile(csvPath: string) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  const priceList = await prisma.priceList.findFirst({
    where: { kind: "GOLDEN", isActive: true },
    orderBy: { revision: "desc" },
  });

  if (!priceList) {
    throw new Error("No active GOLDEN price list found");
  }

  const rawCsv = fs.readFileSync(csvPath, "utf8");
  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
  });

  if (!records.length) {
    return { priceListId: priceList.id, itemCount: 0, componentCount: 0 };
  }

  type PendingComponent = {
    priceListItemId: string;
    componentCode: string;
    description: string | null;
    quantity: number | null;
    material: number | null;
    labor: number | null;
    equipment: number | null;
  };

  const components: PendingComponent[] = [];
  const touchedItemIds = new Set<string>();

  // Cache lookup of PriceListItem by canonicalKeyHash to avoid repeated queries.
  const itemCache = new Map<string, string>(); // canonicalKeyHash -> PriceListItem.id

  for (const record of records) {
    const cat = cleanText(record["Cat"]);
    const sel = cleanText(record["Sel"]);
    const activity = cleanText(record["Activity"]);
    const description = cleanText(record["Desc"]);

    const canonicalKeyHash = buildCanonicalKeyHash({
      cat,
      sel,
      activity,
      description,
    });

    let priceListItemId = itemCache.get(canonicalKeyHash) ?? null;

    if (!priceListItemId) {
      const item = await prisma.priceListItem.findFirst({
        where: {
          priceListId: priceList.id,
          canonicalKeyHash,
        },
        select: { id: true },
      });

      if (!item) {
        // If there is no matching PriceListItem for this canonical key, skip.
        continue;
      }

      priceListItemId = item.id;
      itemCache.set(canonicalKeyHash, priceListItemId);
    }

    const componentCode = cleanText(record["Component Code"]);
    if (!componentCode) {
      continue;
    }

    const quantity = toNumber(record["Qty"]);
    const material = toNumber(record["Material"]);
    const labor = toNumber(record["Labor"]);
    const equipment = toNumber(record["Equipment"]);

    components.push({
      priceListItemId,
      componentCode,
      description: cleanText(record["Component Desc"]),
      quantity,
      material,
      labor,
      equipment,
    });
    touchedItemIds.add(priceListItemId);
  }

  if (!components.length) {
    return { priceListId: priceList.id, itemCount: 0, componentCount: 0 };
  }

  await prisma.$transaction(async (tx) => {
    // First remove any existing components for the touched items so that the
    // component set for each item exactly matches the latest import.
    await tx.priceListComponent.deleteMany({
      where: {
        priceListItemId: { in: Array.from(touchedItemIds) },
      },
    });

    const chunkSize = 500;
    for (let i = 0; i < components.length; i += chunkSize) {
      const chunk = components.slice(i, i + chunkSize);
      await tx.priceListComponent.createMany({ data: chunk });
    }
  });

  return {
    priceListId: priceList.id,
    itemCount: touchedItemIds.size,
    componentCount: components.length,
  };
}
