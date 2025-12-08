import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import crypto from "node:crypto";
import { prisma, ProjectParticleType } from "./index";

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

  const rawRows = await prisma.$transaction(
    records.map((record) => {
      const rawLineNoValue =
        (record["#"] as string | undefined) ??
        (record["\u001b#"] as string | undefined) ??
        (record["﻿#"] as string | undefined) ??
        (record[Object.keys(record)[0] ?? ""] as string | undefined);

      const parsedLineNo = rawLineNoValue
        ? Number(String(rawLineNoValue).replace(/,/g, "")) || 0
        : 0;

      return prisma.rawXactRow.create({
        data: {
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

          rawRowJson: record
        }
      });
    })
  );

  // Build/lookup units and particles from Group Description
  const particleCache = new Map<string, string>();

  async function getOrCreateParticle(groupDescription: string | null, groupCode: string | null) {
    const desc = (groupDescription || "").trim();
    if (!desc) {
      // fallback: whole project particle could be added later
      throw new Error("Missing Group Description; cannot resolve particle");
    }
    const { unitLabel, roomName } = parseUnitAndRoom(desc);
    const cacheKey = `${unitLabel}::${roomName}`;
    const cached = particleCache.get(cacheKey);
    if (cached) return cached;

    const unit = await prisma.projectUnit.upsert({
      where: {
        // Use the named compound unique constraint from schema.prisma
        ProjectUnit_projectId_label_key: {
          projectId,
          label: unitLabel
        }
      },
      update: {},
      create: {
        projectId,
        // project is guaranteed non-null above
        companyId: project!.companyId,
        label: unitLabel
      }
    } as any);

    const particle = await prisma.projectParticle.create({
      data: {
        projectId,
        companyId: project!.companyId,
        unitId: unit.id,
        type: ProjectParticleType.ROOM,
        name: roomName,
        fullLabel: `${unitLabel} - ${roomName}`,
        externalGroupCode: groupCode,
        externalGroupDescription: groupDescription
      }
    });

    particleCache.set(cacheKey, particle.id);
    return particle.id;
  }

  const sow = await prisma.sow.create({
    data: {
      projectId,
      estimateVersionId: estimateVersion.id,
      sourceType: "xact_raw_carrier",
      totalAmount: null
    }
  });

  const logicalCache = new Map<string, string>();
  const sowItemsData: any[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const raw = rawRows[i];

    const groupDescription = cleanText(record["Group Description"]) || "";
    if (!groupDescription) continue;
    const groupCode = cleanText(record["Group Code"]);

    const projectParticleId = await getOrCreateParticle(groupDescription, groupCode);

    const signature = computeSignature(record);
    const logicalKey = `${projectParticleId}:${signature}`;

    let logicalItemId = logicalCache.get(logicalKey);
    if (!logicalItemId) {
      const logical = await prisma.sowLogicalItem.create({
        data: {
          projectId,
          projectParticleId,
          signatureHash: signature
        }
      });
      logicalItemId = logical.id;
      logicalCache.set(logicalKey, logicalItemId!);
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

  const chunkSize = 100;
  for (let i = 0; i < sowItemsData.length; i += chunkSize) {
    const chunk = sowItemsData.slice(i, i + chunkSize);
    await prisma.sowItem.createMany({ data: chunk });
  }

  const totalAmount = sowItemsData.reduce(
    (sum: number, item: any) => sum + (item.itemAmount ?? 0),
    0
  );

  await prisma.$transaction([
    prisma.estimateVersion.update({
      where: { id: estimateVersion.id },
      data: {
        status: "completed",
        importedAt: new Date()
      }
    }),
    prisma.sow.update({
      where: { id: sow.id },
      data: { totalAmount }
    })
  ]);

  return {
    projectId,
    estimateVersionId: estimateVersion.id,
    sowId: sow.id,
    itemCount: sowItemsData.length,
    totalAmount
  };
}
