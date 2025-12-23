import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type { Prisma } from "@prisma/client";
import { prisma } from "./index";

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

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: ts-node src/run-import-price-list.ts <csvPath> [revision] [label]"
    );
    process.exit(1);
  }

  const csvPathArg = String(args[0] ?? "");
  const revisionArg = args[1] != null ? Number(args[1]) : undefined;
  const labelArg = args[2] != null ? String(args[2]) : undefined;

  const repoRoot = path.resolve(__dirname, "../../..");
  const csvPath = path.isAbsolute(csvPathArg)
    ? csvPathArg
    : path.resolve(repoRoot, csvPathArg);

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  console.log("[price-list-import] Reading CSV from:", csvPath);
  const rawCsv = fs.readFileSync(csvPath, "utf8");

  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true
  });

  if (!records.length) {
    console.error("[price-list-import] CSV has no data rows.");
    process.exit(1);
  }

  // Compute revision: use provided value, or increment from latest GOLDEN.
  let revision: number;
  if (typeof revisionArg === "number" && !Number.isNaN(revisionArg)) {
    revision = revisionArg;
  } else {
    const latest = await prisma.priceList.findFirst({
      where: { kind: "GOLDEN" },
      orderBy: { revision: "desc" }
    });
    revision = latest ? latest.revision + 1 : 1;
  }

  // Derive an effective date from the data (max of Date column).
  let effectiveDate: Date | null = null;
  for (const record of records) {
    const d = toDate(record["Date"] as string | undefined);
    if (d && (!effectiveDate || d > effectiveDate)) {
      effectiveDate = d;
    }
  }

  const label =
    labelArg ||
    (effectiveDate
      ? `Golden Price List (${effectiveDate.toISOString().slice(0, 10)})`
      : "Golden Price List");

  console.log(
    `[price-list-import] Creating GOLDEN price list revision ${revision} with label "${label}"`
  );

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Deactivate any existing GOLDEN price lists so this one becomes the active default.
    await tx.priceList.updateMany({
      where: { kind: "GOLDEN", isActive: true },
      data: { isActive: false }
    });

    const priceList = await tx.priceList.create({
      data: {
        kind: "GOLDEN",
        code: "XACT_ALL",
        label,
        revision,
        effectiveDate: effectiveDate ?? new Date(),
        currency: "USD",
        isActive: true
      }
    });

    console.log(
      "[price-list-import] Created PriceList:",
      priceList.id,
      `kind=${priceList.kind}`,
      `revision=${priceList.revision}`
    );

    const itemsData = records.map((record) => {
      const rawLineNoValue =
        (record["#"] as string | undefined) ??
        (record["\u001b#"] as string | undefined) ??
        (record["﻿#"] as string | undefined) ??
        (record[Object.keys(record)[0] ?? ""] as string | undefined);

      const parsedLineNo = rawLineNoValue
        ? Number(String(rawLineNoValue).replace(/,/g, "")) || 0
        : 0;

      return {
        priceListId: priceList.id,
        lineNo: parsedLineNo,
        groupCode: cleanText(record["Group Code"]),
        groupDescription: cleanText(record["Group Description"]),
        description: cleanText(record["Desc"]),
        cat: cleanText(record["Cat"]),
        sel: cleanText(record["Sel"]),
        unit: cleanText(record["Unit"]),
        unitPrice: toNumber(record["Unit Cost"]),
        coverage: cleanText(record["Coverage"]),
        activity: cleanText(record["Activity"]),
        owner: cleanText(record["Owner"]),
        sourceVendor: cleanText(record["Original Vendor"]),
        sourceDate: toDate(record["Date"] as string | undefined),
        rawJson: record as any
      };
    });

    console.log(
      `[price-list-import] Preparing to insert ${itemsData.length} price list items...`
    );

    const chunkSize = 500;
    for (let i = 0; i < itemsData.length; i += chunkSize) {
      const chunk = itemsData.slice(i, i + chunkSize);
      await tx.priceListItem.createMany({ data: chunk });
      console.log(
        `[price-list-import] Inserted ${Math.min(
          i + chunkSize,
          itemsData.length
        )}/${itemsData.length} items`
      );
    }
  }, { timeout: 600000 });

  console.log("[price-list-import] Done.");
}

main().catch((err) => {
  console.error("[price-list-import] Fatal error:", err);
  process.exit(1);
});
