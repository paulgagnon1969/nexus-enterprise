import fs from "node:fs";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
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

  const debug = process.env.DEBUG_GOLDEN_COMPONENTS === "1";

  // Build an index of Golden price list items keyed by (CAT, SEL) so we can
  // attach components to all matching items, even if Activity / Desc differ.
  const items = await prisma.priceListItem.findMany({
    where: { priceListId: priceList.id },
    select: { id: true, cat: true, sel: true },
  });

  const itemsByCatSel = new Map<string, string[]>(); // key: CAT||SEL -> [PriceListItem.id]
  for (const item of items) {
    const catKey = normalizePart(item.cat ?? null);
    const selKey = normalizePart(item.sel ?? null);
    if (!catKey && !selKey) continue;
    const key = `${catKey}||${selKey}`;
    const list = itemsByCatSel.get(key);
    if (list) list.push(item.id);
    else itemsByCatSel.set(key, [item.id]);
  }

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      "[golden-components] priceListId=%s records=%d items=%d catSelBuckets=%d",
      priceList.id,
      records.length,
      items.length,
      itemsByCatSel.size,
    );
  }

  let debugSampleLogged = false;

  for (const record of records) {
    if (debug && !debugSampleLogged) {
      // eslint-disable-next-line no-console
      console.log(
        "[golden-components] sample raw record: keys=%j Code=%s Quantity=%s",
        Object.keys(record),
        record["Code"],
        record["Quantity"],
      );
    }

    // Prefer explicit Cat/Sel columns if present; otherwise, derive them from
    // the combined Xactimate Code (e.g. ACCANCR -> Cat=ACC, Sel=ANCR).
    let catKey: string | null = null;
    let selKey: string | null = null;

    const catCol = cleanText(record["Cat"]);
    const selCol = cleanText(record["Sel"]);

    if (catCol && selCol) {
      catKey = normalizePart(catCol);
      selKey = normalizePart(selCol);
    } else {
      // Some CSVs include a UTF-8 BOM on the first header, so the key may be "\uFEFFCode".
      const rawCodeField = record["Code"] ?? record["\uFEFFCode"];
      const code = cleanText(rawCodeField as any);
      if (!code || code.length < 4) {
        // Need at least CAT (3 chars) + SEL (1+ char) from Code.
        continue;
      }
      const rawCat = code.slice(0, 3);
      const rawSel = code.slice(3);
      catKey = normalizePart(rawCat);
      selKey = normalizePart(rawSel);
    }

    if (!catKey || !selKey) {
      // Without CAT and SEL we cannot bucket this component.
      continue;
    }

    const key = `${catKey}||${selKey}`;
    const itemIds = itemsByCatSel.get(key);

    if (debug && !debugSampleLogged) {
      // eslint-disable-next-line no-console
      console.log(
        "[golden-components] sample record: rawCode=%s catKey=%s selKey=%s matchedItems=%d",
        cleanText(record["Code"]),
        catKey,
        selKey,
        itemIds?.length ?? 0,
      );
      debugSampleLogged = true;
    }

    if (!itemIds || itemIds.length === 0) {
      // No Golden items for this CAT/SEL bucket; skip.
      continue;
    }

    // Component code: support both legacy "Component Code" and the unified
    // Xactimate "Code" column used in the current Golden components CSV.
    const componentCode = cleanText(
      record["Component Code"] ??
        record["Code"] ??
        record["\uFEFFCode"] ??
        record["Component"] ??
        record["Component code"],
    );
    if (!componentCode) {
      continue;
    }

    // Quantity: support both "Qty" and "Quantity" headers.
    const quantity = toNumber(record["Qty"] ?? record["Quantity"]);

    // Cost breakdown:
    // - Prefer explicit Material/Labor/Equipment columns if present.
    // - Fallback to using Unit Price / Total when only those exist.
    const material =
      toNumber(record["Material"]) ??
      toNumber(record["Unit Price"]) ??
      toNumber(record["Total"]);
    const labor = toNumber(record["Labor"]);
    const equipment = toNumber(record["Equipment"]);

    // Description: support both legacy "Component Desc" and the CSV's
    // "Description" / "Component Description" columns.
    const description = cleanText(
      record["Component Desc"] ??
        record["Description"] ??
        record["Component Description"],
    );

    // Attach this component definition to *all* Golden items that share this
    // CAT/SEL bucket. This allows us to aggregate costing at the CAT/SEL level
    // even if individual line descriptions differ.
    for (const priceListItemId of itemIds) {
      components.push({
        priceListItemId,
        componentCode,
        description,
        quantity,
        material,
        labor,
        equipment,
      });
      touchedItemIds.add(priceListItemId);
    }
  }

  if (!components.length) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log(
        "[golden-components] no components generated from %d records (touchedItems=%d)",
        records.length,
        touchedItemIds.size,
      );
    }
    return { priceListId: priceList.id, itemCount: 0, componentCount: 0 };
  }

  // Aggregate by (priceListItemId, componentCode) to avoid hitting the
  // unique constraint on PriceListComponent and to keep the component set
  // per item consistent with the latest file. If the CSV contains multiple
  // rows that would generate the same (item, code) pair, we SUM their
  // quantities and cost buckets so the persisted component row reflects the
  // total for that CATSEL + component code.
  const aggregatedByKey = new Map<string, PendingComponent>();
  for (const c of components) {
    const key = `${c.priceListItemId}||${c.componentCode}`;
    const existing = aggregatedByKey.get(key);
    if (!existing) {
      aggregatedByKey.set(key, { ...c });
    } else {
      const q1 = existing.quantity ?? 0;
      const q2 = c.quantity ?? 0;
      const m1 = existing.material ?? 0;
      const m2 = c.material ?? 0;
      const l1 = existing.labor ?? 0;
      const l2 = c.labor ?? 0;
      const e1 = existing.equipment ?? 0;
      const e2 = c.equipment ?? 0;
      existing.quantity = q1 + q2;
      existing.material = m1 + m2;
      existing.labor = l1 + l2;
      existing.equipment = e1 + e2;
    }
  }
  const uniqueComponents = Array.from(aggregatedByKey.values());

  if (debug) {
    // eslint-disable-next-line no-console
    console.log(
      "[golden-components] inserting components: touchedItems=%d components=%d (unique=%d)",
      touchedItemIds.size,
      components.length,
      uniqueComponents.length,
    );
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // First remove any existing components for the touched items so that the
    // component set for each item exactly matches the latest import.
    await tx.priceListComponent.deleteMany({
      where: {
        priceListItemId: { in: Array.from(touchedItemIds) },
      },
    });

    const chunkSize = 500;
    for (let i = 0; i < uniqueComponents.length; i += chunkSize) {
      const chunk = uniqueComponents.slice(i, i + chunkSize);
      await tx.priceListComponent.createMany({ data: chunk, skipDuplicates: true });
    }
  });

  return {
    priceListId: priceList.id,
    itemCount: touchedItemIds.size,
    componentCount: uniqueComponents.length,
  };
}
