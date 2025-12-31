import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
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

function cleanNote(value: string | null | undefined, max = 5000): string | null {
  const t = cleanText(value);
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
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

function computeSignature(record: any): string {
  const fields = [
    record["Group Description"] ?? "",
    record["Desc"] ?? "",
    record["Qty"] ?? "",
    record["Item Amount"] ?? "",
    record["Unit Cost"] ?? "",
    record["Unit"] ?? "",
    record["Activity"] ?? "",
    record["Sales Tax"] ?? "",
    record["RCV"] ?? "",
    record["ACV"] ?? "",
    record["Cat"] ?? "",
    record["Sel"] ?? ""
  ];
  const base = fields.join("|");
  // Single SHA-256 hex digest is sufficient to identify a logical item.
  return crypto.createHash("sha256").update(base).digest("hex");
}

function parseUnitAndRoom(groupDescription: string): { unitLabel: string; roomName: string } {
  const raw = groupDescription.trim();
  const parts = raw.split(/-+/);
  if (parts.length < 2) {
    return { unitLabel: "Unit 1", roomName: raw || "Whole Unit" };
  }
  const left = parts[0]!.trim() || "Unit 1";
  const right = parts.slice(1).join("-").trim() || "Whole Unit";
  return { unitLabel: left, roomName: right };
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

  // Load raw rows for this estimate with Cat/Sel and Unit Cost.
  const rawRows = await prisma.rawXactRow.findMany({
    where: { estimateVersionId },
    select: {
      cat: true,
      sel: true,
      unitCost: true,
    },
  });

  type Agg = {
    cat: string;
    sel: string | null;
    totalUnitCost: number;
    count: number;
  };

  const byKey = new Map<string, Agg>();

  for (const row of rawRows) {
    if (!row.cat || row.unitCost == null) continue;
    const cat = row.cat.trim().toUpperCase();
    if (!cat) continue;
    const sel = row.sel ? row.sel.trim().toUpperCase() : null;
    const key = `${cat}::${sel ?? ""}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.totalUnitCost += row.unitCost ?? 0;
      existing.count += 1;
    } else {
      byKey.set(key, {
        cat,
        sel,
        totalUnitCost: row.unitCost ?? 0,
        count: 1,
      });
    }
  }

  if (byKey.size === 0) {
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

  const cats = Array.from(new Set(Array.from(byKey.values()).map((a) => a.cat)));

  // Load Golden items for these Cats.
  const goldenItems = await prisma.priceListItem.findMany({
    where: {
      priceListId: priceList.id,
      cat: { in: cats },
    },
    select: {
      id: true,
      cat: true,
      sel: true,
      unitPrice: true,
      lastKnownUnitPrice: true,
    },
  });

  const itemByKey = new Map<
    string,
    { id: string; unitPrice: number | null; lastKnownUnitPrice: number | null }
  >();

  for (const item of goldenItems) {
    const cat = (item.cat ?? "").trim().toUpperCase();
    if (!cat) continue;
    const sel = item.sel ? item.sel.trim().toUpperCase() : null;
    const key = `${cat}::${sel ?? ""}`;
    if (!itemByKey.has(key)) {
      itemByKey.set(key, {
        id: item.id,
        unitPrice: item.unitPrice,
        lastKnownUnitPrice: item.lastKnownUnitPrice,
      });
    }
  }

  const updates: { id: string; oldPrice: number; newPrice: number }[] = [];

  for (const [key, agg] of byKey.entries()) {
    const avgUnitCost = agg.totalUnitCost / (agg.count || 1);
    if (!Number.isFinite(avgUnitCost)) continue;

    const item = itemByKey.get(key);
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
      importedByUserId
    }
  });

  const rawCsv = fs.readFileSync(csvPath, "utf8");
  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true
  });

  // Bulk-insert raw rows to avoid thousands of individual INSERT statements
  // against a remote Cloud SQL database. We then read them back ordered by
  // lineNo so we can attach SowItems to the correct RawXactRow ids.
  const rawRowsData = records.map((record) => {
    const rawLineNoValue =
      (record["#"] as string | undefined) ??
      (record["\u001b#"] as string | undefined) ??
      (record["﻿#"] as string | undefined) ??
      (record[Object.keys(record)[0] ?? ""] as string | undefined);

    const parsedLineNo = rawLineNoValue
      ? Number(String(rawLineNoValue).replace(/,/g, "")) || 0
      : 0;

    return {
      estimateVersionId: estimateVersion.id,
      lineNo: parsedLineNo,

      groupCode: cleanText(record["Group Code"]),
      groupDescription: cleanText(record["Group Description"]),
      desc: cleanText(record["Desc"]),
      age: toNumber(record["Age"]),
      condition: cleanText(record["Condition"]),
      qty: toNumber(record["Qty"]),
      itemAmount: toNumber(record["Item Amount"]),
      reportedCost: toNumber(record["Reported Cost"]),
      unitCost: toNumber(record["Unit Cost"]),
      unit: cleanText(record["Unit"]),
      coverage: cleanText(record["Coverage"]),
      activity: cleanText(record["Activity"]),
      workersWage: toNumber(record["Worker's Wage"]),
      laborBurden: toNumber(record["Labor burden"]),
      laborOverhead: toNumber(record["Labor Overhead"]),
      material: toNumber(record["Material"]),
      equipment: toNumber(record["Equipment"]),
      marketConditions: toNumber(record["Market Conditions"]),
      laborMinimum: toNumber(record["Labor Minimum"]),
      salesTax: toNumber(record["Sales Tax"]),
      rcv: toNumber(record["RCV"]),
      life: record["Life"] ? Number(record["Life"]) : null,
      depreciationType: record["Depreciation Type"] || null,
      depreciationAmount: toNumber(record["Depreciation Amount"]),
      recoverable: toBooleanYesNo(record["Recoverable"]),
      acv: toNumber(record["ACV"]),
      tax: toNumber(record["Tax"]),
      replaceFlag: toBooleanYesNo(record["Replace"]),
      cat: cleanText(record["Cat"]),
      sel: cleanText(record["Sel"]),
      owner: cleanText(record["Owner"]),
      originalVendor: cleanText(record["Original Vendor"]),
      sourceName: cleanText(record["Source Name"]),
      sourceDate: toDate(record["Date"]),
      note1: cleanNote(record["Note 1"]),
      adjSource: record["ADJ_SOURCE"] || null,

      rawRowJson: record as any,
    };
  });

  if (rawRowsData.length > 0) {
    await prisma.rawXactRow.createMany({ data: rawRowsData });
  }

  const rawRows = await prisma.rawXactRow.findMany({
    where: { estimateVersionId: estimateVersion.id },
    orderBy: { lineNo: "asc" },
  });

  // --- Phase 1: precompute all unit / particle keys so we can batch DB work ---
  type ParticleKeyInfo = {
    unitLabel: string;
    roomName: string;
    groupCode: string | null;
    groupDescription: string;
  };

  const particleKeyToInfo = new Map<string, ParticleKeyInfo>();
  const unitLabels = new Set<string>();

  for (const record of records) {
    const groupDescription = cleanText(record["Group Description"]);
    if (!groupDescription) continue;
    const groupCode = cleanText(record["Group Code"]);
    const { unitLabel, roomName } = parseUnitAndRoom(groupDescription);

    unitLabels.add(unitLabel);

    const particleKey = `${unitLabel}::${roomName}`;
    if (!particleKeyToInfo.has(particleKey)) {
      particleKeyToInfo.set(particleKey, {
        unitLabel,
        roomName,
        groupCode,
        groupDescription
      });
    }
  }

  // --- Phase 2: ensure all units exist (reusing existing ones when present) ---
  const existingUnits = await prisma.projectUnit.findMany({
    where: { projectId }
  });

  const existingUnitLabels = new Set(existingUnits.map((u: any) => u.label));
  const unitsToCreate = Array.from(unitLabels)
    .filter((label) => !existingUnitLabels.has(label))
    .map((label) => ({
      projectId,
      companyId: project!.companyId,
      label
    }));

  if (unitsToCreate.length > 0) {
    await prisma.projectUnit.createMany({ data: unitsToCreate });
  }

  const allUnits = await prisma.projectUnit.findMany({ where: { projectId } });
  const unitById = new Map(allUnits.map((u: any) => [u.id, u]));
  const unitByLabel = new Map(allUnits.map((u: any) => [u.label, u]));

  // --- Phase 3: ensure all particles exist and build a key -> id map ---
  const existingParticles = await prisma.projectParticle.findMany({
    where: { projectId }
  });

  const particleIdByKey = new Map<string, string>();
  for (const p of existingParticles) {
    const unitId = p.unitId;
    if (!unitId) continue;
    const unit = unitById.get(unitId) as any;
    if (!unit) continue;
    const key = `${unit.label}::${p.name}`;
    if (!particleIdByKey.has(key)) {
      particleIdByKey.set(key, p.id);
    }
  }

  const particlesToCreate: any[] = [];
  for (const [key, info] of particleKeyToInfo.entries()) {
    if (particleIdByKey.has(key)) continue;
    const unit = unitByLabel.get(info.unitLabel) as any;
    if (!unit) continue;
    particlesToCreate.push({
      projectId,
      companyId: project!.companyId,
      unitId: unit.id,
      type: "ROOM",
      name: info.roomName,
      fullLabel: `${info.unitLabel} - ${info.roomName}`,
      externalGroupCode: info.groupCode,
      externalGroupDescription: info.groupDescription
    });
  }

  if (particlesToCreate.length > 0) {
    await prisma.projectParticle.createMany({ data: particlesToCreate });
  }

  const allParticles = await prisma.projectParticle.findMany({
    where: { projectId }
  });
  particleIdByKey.clear();
  for (const p of allParticles) {
    const unitId = p.unitId;
    if (!unitId) continue;
    const unit = unitById.get(unitId) as any;
    if (!unit) continue;
    const key = `${unit.label}::${p.name}`;
    if (!particleIdByKey.has(key)) {
      particleIdByKey.set(key, p.id);
    }
  }

  // --- Phase 4: pre-create logical items for each distinct (particle, signature) ---
  const logicalKeyToData = new Map<string, { projectParticleId: string; signature: string }>();

  for (const record of records) {
    const groupDescription = cleanText(record["Group Description"]);
    if (!groupDescription) continue;
    const { unitLabel, roomName } = parseUnitAndRoom(groupDescription);
    const particleKey = `${unitLabel}::${roomName}`;
    const projectParticleId = particleIdByKey.get(particleKey);
    if (!projectParticleId) continue;

    const signature = computeSignature(record);
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

  if (logicalItemsToCreate.length > 0) {
    await prisma.sowLogicalItem.createMany({ data: logicalItemsToCreate });
  }

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

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const raw = rawRows[i];

    if (!raw) continue;

    const groupDescription = cleanText(record["Group Description"]) || "";
    if (!groupDescription) continue;

    const { unitLabel, roomName } = parseUnitAndRoom(groupDescription);
    const particleKey = `${unitLabel}::${roomName}`;
    const projectParticleId = particleIdByKey.get(particleKey);
    if (!projectParticleId) continue;

    const signature = computeSignature(record);
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
      lineNo: raw.lineNo,
      description: cleanText(record["Desc"]) || "",
      qty: toNumber(record["Qty"]),
      unit: record["Unit"] || null,
      unitCost: toNumber(record["Unit Cost"]),
      itemAmount: toNumber(record["Item Amount"]),
      rcvAmount: toNumber(record["RCV"]),
      acvAmount: toNumber(record["ACV"]),
      depreciationAmount: toNumber(record["Depreciation Amount"]),
      salesTaxAmount: toNumber(record["Sales Tax"]),
      categoryCode: record["Cat"] || null,
      selectionCode: record["Sel"] || null,
      activity: record["Activity"] || null,
      materialAmount: toNumber(record["Material"]),
      equipmentAmount: toNumber(record["Equipment"]),
      payerType: estimateVersion.defaultPayerType,
      performed: false,
      eligibleForAcvRefund: false,
      acvRefundAmount: null,
      percentComplete: 0
    });
  }

  // Larger batch size reduces DB round-trips during SOW item insert.
  // On a strong local/Postgres setup, 1000 is a safe, pragmatic default.
  const chunkSize = 1000;
  for (let i = 0; i < sowItemsData.length; i += chunkSize) {
    const chunk = sowItemsData.slice(i, i + chunkSize);
    await prisma.sowItem.createMany({ data: chunk });
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

  const goldenUpdate = await updateGoldenFromEstimate(estimateVersion.id);

  return {
    projectId,
    estimateVersionId: estimateVersion.id,
    sowId: sow.id,
    itemCount: sowItemsData.length,
    totalAmount,
    goldenUpdate,
  };
}
