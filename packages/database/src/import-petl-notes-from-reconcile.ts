import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { prisma } from "./index";

function cleanText(value: unknown, max = 5000): string | null {
  if (value == null) return null;
  const s = String(value)
    .replace(/\r?\n/g, " ")
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function parseIntLoose(value: unknown): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const normalized = s.replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

type ReconcileRow = {
  lineNo: number;
  groupCode: string | null;
  cat: string | null;
  sel: string | null;
  desc: string | null;
  reimburishOwnerNote: string | null;
  changeOrderCustomerPayNote: string | null;
  addToPolNote: string | null;
};

function parseReconcileDetailRows(csvText: string): ReconcileRow[] {
  const rows: any[] = parse(csvText, {
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
  });

  const headerIdx = rows.findIndex((r) => {
    const first = String(r?.[0] ?? "").trim();
    if (first !== "ACV Pay") return false;
    return r.some((c: any) => String(c ?? "").includes("Reimburish Owner"));
  });

  if (headerIdx < 0) {
    throw new Error(
      "Could not locate detail table header row (expected first cell 'ACV Pay').",
    );
  }

  const header: string[] = (rows[headerIdx] as any[]).map((c) =>
    String(c ?? "").trim(),
  );

  const out: ReconcileRow[] = [];

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i] as any[];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Build a loose record keyed by the header labels.
    const rec: Record<string, any> = {};
    for (let j = 0; j < header.length; j += 1) {
      rec[header[j] ?? String(j)] = row[j];
    }

    const lineNo = parseIntLoose(rec["#"]);
    if (lineNo == null) {
      continue;
    }

    out.push({
      lineNo,
      groupCode: cleanText(rec["Group Code"], 255),
      cat: cleanText(rec["Cat"], 50),
      sel: cleanText(rec["Sel"], 50),
      desc: cleanText(rec["Desc"], 2000),
      reimburishOwnerNote: cleanText(rec["Reimburish Owner"], 5000),
      changeOrderCustomerPayNote: cleanText(rec["Change Orders - Customer Pay"], 5000),
      addToPolNote: cleanText(rec["Add to POL"], 5000),
    });
  }

  return out;
}

async function getLatestEstimateVersionIdForPetl(projectId: string): Promise<string | null> {
  let latest = await prisma.estimateVersion.findFirst({
    where: {
      projectId,
      sows: {
        some: {
          items: {
            some: {},
          },
        },
      },
    },
    orderBy: [
      { sequenceNo: "desc" },
      { importedAt: "desc" },
      { createdAt: "desc" },
    ],
    select: { id: true },
  });

  if (!latest) {
    latest = await prisma.estimateVersion.findFirst({
      where: { projectId },
      orderBy: [
        { sequenceNo: "desc" },
        { importedAt: "desc" },
        { createdAt: "desc" },
      ],
      select: { id: true },
    });
  }

  return latest?.id ?? null;
}

async function getOrCreateReconCaseForSowItem(args: {
  projectId: string;
  sowItem: {
    id: string;
    estimateVersionId: string;
    logicalItemId: string;
  };
}) {
  const { projectId, sowItem } = args;

  const existing = await prisma.petlReconciliationCase.findFirst({
    where: {
      projectId,
      OR: [{ sowItemId: sowItem.id }, { logicalItemId: sowItem.logicalItemId }],
    },
  });

  if (existing) {
    // Keep sowItemId/estimateVersionId aligned to the current estimate row.
    if (existing.sowItemId !== sowItem.id || existing.estimateVersionId !== sowItem.estimateVersionId) {
      await prisma.petlReconciliationCase.update({
        where: { id: existing.id },
        data: {
          sowItemId: sowItem.id,
          estimateVersionId: sowItem.estimateVersionId,
        },
      });
    }
    return existing;
  }

  return prisma.petlReconciliationCase.create({
    data: {
      projectId,
      estimateVersionId: sowItem.estimateVersionId,
      sowItemId: sowItem.id,
      logicalItemId: sowItem.logicalItemId,
      noteThreadId: null,
      createdByUserId: null,
      status: "OPEN",
      events: {
        create: {
          projectId,
          estimateVersionId: sowItem.estimateVersionId,
          eventType: "CASE_CREATED_IMPORT",
          payloadJson: { sowItemId: sowItem.id, logicalItemId: sowItem.logicalItemId },
          createdByUserId: null,
        },
      },
    },
  });
}

export async function importPetlNotesFromReconcileCsv(args: {
  projectId: string;
  csvPath: string;
  dryRun?: boolean;
}) {
  const { projectId, csvPath, dryRun = false } = args;

  if (!projectId) throw new Error("projectId is required");
  if (!csvPath) throw new Error("csvPath is required");

  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV not found at ${resolvedPath}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const estimateVersionId = await getLatestEstimateVersionIdForPetl(projectId);
  if (!estimateVersionId) {
    throw new Error(`No estimateVersion found for project ${projectId}`);
  }

  const sowItems = await prisma.sowItem.findMany({
    where: { estimateVersionId },
    select: {
      id: true,
      lineNo: true,
      description: true,
      categoryCode: true,
      selectionCode: true,
      projectParticleId: true,
      logicalItemId: true,
      estimateVersionId: true,
      rawRow: {
        select: {
          lineNo: true,
        },
      },
    },
  });

  const byPetlLineNo = new Map<number, (typeof sowItems)[number]>();
  const byXactLineNo = new Map<number, (typeof sowItems)[number]>();

  for (const it of sowItems) {
    if (!byPetlLineNo.has(it.lineNo)) byPetlLineNo.set(it.lineNo, it);
    const xactLineNo = it.rawRow?.lineNo;
    if (typeof xactLineNo === "number" && xactLineNo > 0 && !byXactLineNo.has(xactLineNo)) {
      byXactLineNo.set(xactLineNo, it);
    }
  }

  const csvText = fs.readFileSync(resolvedPath, "utf8");
  const detailRows = parseReconcileDetailRows(csvText);

  const maxCsvLineNo = detailRows.reduce((m, r) => (r.lineNo > m ? r.lineNo : m), 0);
  const preferXactLineNo = maxCsvLineNo > sowItems.length;

  let matched = 0;
  let missing = 0;
  let mismatchMeta = 0;

  let createdCases = 0;
  let createdEntries = 0;
  let skippedExisting = 0;

  for (const row of detailRows) {
    const sowItem = (
      preferXactLineNo
        ? byXactLineNo.get(row.lineNo) ?? byPetlLineNo.get(row.lineNo)
        : byPetlLineNo.get(row.lineNo) ?? byXactLineNo.get(row.lineNo)
    ) ?? null;
    if (!sowItem) {
      missing += 1;
      continue;
    }

    matched += 1;

    // Optional sanity check. (Do not block import.)
    const csvCat = (row.cat ?? "").trim();
    const csvSel = (row.sel ?? "").trim();
    const csvDesc = (row.desc ?? "").trim();
    const dbCat = (sowItem.categoryCode ?? "").trim();
    const dbSel = (sowItem.selectionCode ?? "").trim();
    const dbDesc = (sowItem.description ?? "").trim();

    if (
      (csvCat && dbCat && csvCat.toLowerCase() !== dbCat.toLowerCase()) ||
      (csvSel && dbSel && csvSel.toLowerCase() !== dbSel.toLowerCase()) ||
      (csvDesc && dbDesc && csvDesc.toLowerCase() !== dbDesc.toLowerCase())
    ) {
      mismatchMeta += 1;
    }

    const notesToCreate: { kind: string; note: string; column: string }[] = [];

    if (row.reimburishOwnerNote) {
      notesToCreate.push({
        kind: "REIMBURSE_OWNER",
        note: row.reimburishOwnerNote,
        column: "Reimburish Owner",
      });
    }

    if (row.changeOrderCustomerPayNote) {
      notesToCreate.push({
        kind: "CHANGE_ORDER_CLIENT_PAY",
        note: row.changeOrderCustomerPayNote,
        column: "Change Orders - Customer Pay",
      });
    }

    if (row.addToPolNote) {
      notesToCreate.push({
        kind: "NOTE_ONLY",
        note: `Add to POL: ${row.addToPolNote}`,
        column: "Add to POL",
      });
    }

    if (notesToCreate.length === 0) {
      continue;
    }

    const existingCase = await prisma.petlReconciliationCase.findFirst({
      where: {
        projectId,
        OR: [{ sowItemId: sowItem.id }, { logicalItemId: sowItem.logicalItemId }],
      },
    });

    const theCase = existingCase
      ? existingCase
      : dryRun
        ? null
        : await getOrCreateReconCaseForSowItem({
            projectId,
            sowItem: {
              id: sowItem.id,
              estimateVersionId: sowItem.estimateVersionId,
              logicalItemId: sowItem.logicalItemId,
            },
          });

    if (!existingCase && !dryRun) {
      createdCases += 1;
    }

    for (const n of notesToCreate) {
      if (dryRun) {
        createdEntries += 1;
        continue;
      }

      const already = await prisma.petlReconciliationEntry.findFirst({
        where: {
          projectId,
          caseId: theCase!.id,
          parentSowItemId: sowItem.id,
          kind: n.kind,
          note: n.note,
          rcvAmount: null,
        },
        select: { id: true },
      });

      if (already) {
        skippedExisting += 1;
        continue;
      }

      await prisma.petlReconciliationEntry.create({
        data: {
          projectId,
          estimateVersionId: sowItem.estimateVersionId,
          caseId: theCase!.id,
          parentSowItemId: sowItem.id,
          projectParticleId: sowItem.projectParticleId,
          kind: n.kind,
          note: n.note,
          rcvAmount: null,
          percentComplete: 0,
          isPercentCompleteLocked: true,
          createdByUserId: null,
          sourceSnapshotJson: {
            source: "PWC Reconcile2 - Xactimate POL - Summary Detail",
            csvPath: resolvedPath,
            lineNo: row.lineNo,
            column: n.column,
          },
          events: {
            create: {
              projectId,
              estimateVersionId: sowItem.estimateVersionId,
              caseId: theCase!.id,
              eventType: "ENTRY_CREATED_IMPORT",
              payloadJson: {
                kind: n.kind,
                note: n.note,
                column: n.column,
                lineNo: row.lineNo,
              },
              createdByUserId: null,
            },
          },
        },
      });

      createdEntries += 1;
    }
  }

  return {
    projectId,
    estimateVersionId,
    csvPath: resolvedPath,
    totalCsvDetailRows: detailRows.length,
    matched,
    missing,
    mismatchMeta,
    createdCases,
    createdEntries,
    skippedExisting,
    dryRun,
  };
}
