import "reflect-metadata";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NestFactory } from "@nestjs/core";
import { Worker, Job } from "bullmq";
import { AppModule } from "./app.module";
import { PrismaService } from "./infra/prisma/prisma.service";
import { IMPORT_QUEUE_NAME, getBullRedisConnection, getImportQueue } from "./infra/queue/import-queue";
import {
  allocateComponentsForEstimate,
  importXactComponentsChunkForEstimate,
  importXactCsvForProject,
  importGoldenComponentsFromFile,
  importBiaWorkers,
} from "@repo/database";
import { ImportJobStatus, ImportJobType, Role } from "@prisma/client";
import { importPriceListFromFile, importCompanyPriceListFromFile } from "./modules/pricing/pricing.service";
import { Storage } from "@google-cloud/storage";
import { parse } from "csv-parse/sync";
import argon2 from "argon2";
import { decryptPortfolioHrJson, encryptPortfolioHrJson } from "./common/crypto/portfolio-hr.crypto";

const DEFAULT_PASSWORD = "Nexus2026.01";

type ParentJobPayload = {
  kind?: "parent";
  importJobId: string;
};

type ChunkJobPayload = {
  kind: "chunk";
  importJobId: string;
  chunkIndex: number;
  chunkCount: number;
  strategy: string;
  payload: any;
};

type ImportJobPayload = ParentJobPayload | ChunkJobPayload;

// BullMQ: lower numeric priority value means higher priority.
const PRIORITY_DEFAULT = 5;
const PRIORITY_XACT_COMPONENTS = 3;
const PRIORITY_XACT_COMPONENTS_ALLOCATE = 1;

const gcsStorage = new Storage();

function safeError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

async function getLatestEstimateVersionId(prisma: PrismaService, projectId: string) {
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

function normalizeEmail(email: string | undefined | null): string | null {
  const e = (email ?? "").trim();
  if (!e) return null;
  return e.toLowerCase();
}

function parseCurrency(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function last4(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

async function upsertHrPortfolio(prisma: PrismaService, params: {
  companyId: string;
  userId: string;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankRoutingNumber?: string | null;
}) {
  const { companyId, userId, bankName, bankAccountNumber, bankRoutingNumber } = params;

  const portfolio = await prisma.userPortfolio.upsert({
    where: {
      UserPortfolio_company_user_key: {
        companyId,
        userId,
      },
    },
    update: {},
    create: {
      companyId,
      userId,
    },
    select: { id: true },
  });

  const existing = await prisma.userPortfolioHr.findUnique({
    where: { portfolioId: portfolio.id },
    select: { encryptedJson: true },
  });

  const currentPayload = existing
    ? (decryptPortfolioHrJson(Buffer.from(existing.encryptedJson)) as any)
    : {};

  const nextPayload = {
    ...currentPayload,
    ...(bankName !== undefined ? { bankName } : {}),
    ...(bankAccountNumber !== undefined ? { bankAccountNumber } : {}),
    ...(bankRoutingNumber !== undefined ? { bankRoutingNumber } : {}),
  };

  const encryptedJson = encryptPortfolioHrJson(nextPayload);
  const encryptedBytes = Uint8Array.from(encryptedJson);

  await prisma.userPortfolioHr.upsert({
    where: { portfolioId: portfolio.id },
    update: {
      encryptedJson: encryptedBytes,
      bankAccountLast4: last4(nextPayload.bankAccountNumber ?? null),
      bankRoutingLast4: last4(nextPayload.bankRoutingNumber ?? null),
    },
    create: {
      portfolioId: portfolio.id,
      encryptedJson: encryptedBytes,
      bankAccountLast4: last4(nextPayload.bankAccountNumber ?? null),
      bankRoutingLast4: last4(nextPayload.bankRoutingNumber ?? null),
    },
  });
}

async function downloadGcsToTmp(fileUri: string): Promise<string> {
  const match = fileUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid fileUri for GCS download: ${fileUri}`);
  }
  const [, bucketName, objectName] = match;
  const bucket = gcsStorage.bucket(bucketName!);
  const file = bucket.file(objectName!);

  const baseTmpDir = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
  const uploadDir = path.join(baseTmpDir, "ncc_uploads");
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const safeName = path.basename(objectName!).replace(/[^a-zA-Z0-9_.-]/g, "_");
  const localPath = path.join(uploadDir, `${Date.now()}-${safeName}`);

  await file.download({ destination: localPath });
  return localPath;
}

async function runXactComponentsIngestionJob(prisma: PrismaService, job: any) {
  const importJobId = job.id;
  let csvPath = job.csvPath?.trim();

  // Allow either a local csvPath (dev/legacy) or a fileUri (prod GCS uploads).
  if ((!csvPath || !fs.existsSync(csvPath)) && job.fileUri) {
    console.log("[worker] XACT_COMPONENTS using fileUri, downloading from GCS", {
      importJobId,
      fileUri: job.fileUri,
    });
    csvPath = await downloadGcsToTmp(job.fileUri);
    console.log("[worker] XACT_COMPONENTS downloaded GCS file", {
      importJobId,
      fileUri: job.fileUri,
      csvPath,
    });
  }

  if (!csvPath) {
    throw new Error("XACT_COMPONENTS ingestion job has no csvPath or fileUri to read from.");
  }
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Components CSV not found at ${csvPath}`);
  }

  let estimateVersionId = job.estimateVersionId ?? null;

  if (!estimateVersionId) {
    const projectId = job.projectId as string;

    // Prefer the latest estimate version that actually has SOW/PETL rows so
    // components attach to the same version that backs the PETL view and
    // estimate/financial summaries. This avoids mismatches where components
    // are imported against a placeholder or failed estimate version.
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
    });

    if (!latest) {
      latest = await prisma.estimateVersion.findFirst({
        where: { projectId },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
    }

    if (!latest) {
      throw new Error(
        "No estimate version found. Import Xactimate raw line items first.",
      );
    }

    estimateVersionId = latest.id;
  }

  const estimate = await prisma.estimateVersion.findUnique({
    where: { id: estimateVersionId },
    include: { project: true },
  });

  if (!estimate || !estimate.project) {
    throw new Error("EstimateVersion or project not found for XACT_COMPONENTS job");
  }

  const projectId = estimate.projectId;

  console.log(
    "[worker] XACT_COMPONENTS ingestion (chunked) start estimateVersionId=%s projectId=%s",
    estimateVersionId,
    projectId,
  );

  // Wipe any prior import for this estimate so we can safely re-import
  await prisma.$transaction([
    prisma.rawComponentRow.deleteMany({ where: { estimateVersionId } }),
    prisma.componentSummary.deleteMany({ where: { estimateVersionId } }),
  ]);

  const rawCsv = fs.readFileSync(csvPath, "utf8");
  const records: any[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
  });

  const totalRecords = records.length;

  if (totalRecords === 0) {
    // Nothing to ingest; run allocation inline on the same ImportJob so we
    // avoid creating a separate XACT_COMPONENTS_ALLOCATE job (which would
    // require an extra enum value in the database).
    const allocationResult = await allocateComponentsForEstimate({
      estimateVersionId,
    });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "No Xact components found; allocation complete",
        estimateVersionId,
        resultJson: {
          phase: "ingestion+allocation",
          estimateVersionId,
          components: {
            estimateVersionId,
            projectId,
            rawCount: 0,
            summaryCount: 0,
          },
          allocation: allocationResult,
        } as any,
      },
    });

    return;
  }

  // Decide chunking strategy using heuristics based on components vs RAW rows.
  const rawCount = await prisma.rawXactRow.count({ where: { estimateVersionId } });
  const ratio = totalRecords / (rawCount || 1);

  // Baseline target records per chunk; adjust based on size and ratio.
  let maxRecordsPerChunk = 8000;
  if (totalRecords > 20000 || ratio > 1.5) maxRecordsPerChunk = 4000;
  if (totalRecords > 50000 || ratio > 3) maxRecordsPerChunk = 2500;

  // Optional override via env for hard tuning if needed.
  const overrideChunkEnv = process.env.XACT_COMPONENTS_RECORDS_PER_CHUNK;
  if (overrideChunkEnv) {
    const n = Number(overrideChunkEnv);
    if (Number.isFinite(n) && n > 0) {
      maxRecordsPerChunk = n;
    }
  }

  const maxChunksEnv = process.env.XACT_COMPONENTS_MAX_CHUNKS;
  let maxChunks = maxChunksEnv ? Number(maxChunksEnv) : 16;
  if (!Number.isFinite(maxChunks) || maxChunks <= 0) {
    maxChunks = 16;
  }

  let chunkCount = Math.ceil(totalRecords / maxRecordsPerChunk);
  if (!Number.isFinite(chunkCount) || chunkCount <= 0) {
    chunkCount = 1;
  }
  if (chunkCount > maxChunks) {
    chunkCount = maxChunks;
  }

  const chunkSize = Math.ceil(totalRecords / chunkCount);

  const baseTmpDir = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
  const chunkDir = path.join(
    baseTmpDir,
    "ncc_uploads",
    "xact_components_chunks",
    String(importJobId),
  );
  await fs.promises.mkdir(chunkDir, { recursive: true });

  // Helper to serialize records back to a CSV string with a stable header.
  const header = Object.keys(records[0] ?? {});

  function serializeCsv(subset: any[]): string {
    const lines: string[] = [];
    lines.push(header.join(","));

    for (const record of subset) {
      const row = header
        .map((col) => {
          const raw = record[col] ?? "";
          const value = String(raw);
          if (/[",\n\r]/.test(value)) {
            return '"' + value.replace(/"/g, '""') + '"';
          }
          return value;
        })
        .join(",");
      lines.push(row);
    }

    return lines.join("\n");
  }

  const queue = getImportQueue();

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, totalRecords);
    const subset = records.slice(start, end);
    if (subset.length === 0) {
      continue;
    }

    const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}.csv`);
    const csvContent = serializeCsv(subset);
    await fs.promises.writeFile(chunkPath, csvContent, "utf8");

    await queue.add(
      "process",
      {
        kind: "chunk",
        importJobId,
        chunkIndex,
        chunkCount,
        strategy: "XACT_COMPONENTS:line-range",
        payload: {
          estimateVersionId,
          projectId,
          csvPath: chunkPath,
        },
      },
      {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
        priority: PRIORITY_XACT_COMPONENTS,
      },
    );
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      estimateVersionId,
      totalChunks: chunkCount,
      completedChunks: 0,
      progress: 10,
      message: `Planned ${chunkCount} Xact components chunks (${totalRecords} records)`,
      metaJson: {
        ...(job.metaJson as any),
        strategy: "XACT_COMPONENTS:line-range",
        chunkCount,
        totalRecords,
        estimateVersionId,
        rawCount,
        ratio,
        maxRecordsPerChunk,
        maxChunks,
        chunkSize,
      } as any,
    },
  });
}

async function runXactComponentsAllocationJob(prisma: PrismaService, job: any) {
  const importJobId = job.id;
  const estimateVersionId = job.estimateVersionId?.trim();

  if (!estimateVersionId) {
    throw new Error("XACT_COMPONENTS_ALLOCATE job is missing estimateVersionId");
  }

  console.log(
    "[worker] XACT_COMPONENTS_ALLOCATE allocateComponentsForEstimate start estimateVersionId=%s",
    estimateVersionId,
  );

  const allocationResult = await allocateComponentsForEstimate({
    estimateVersionId,
  });

  console.log(
    "[worker] XACT_COMPONENTS_ALLOCATE allocateComponentsForEstimate done components=%s sowItems=%s allocationsCreated=%s",
    allocationResult.components,
    allocationResult.sowItems,
    allocationResult.allocationsCreated,
  );

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: ImportJobStatus.SUCCEEDED,
      finishedAt: new Date(),
      progress: 100,
      message: "Components allocation complete",
      resultJson: {
        phase: "allocation",
        allocation: allocationResult,
      } as any,
    },
  });
}

async function processImportJob(prisma: PrismaService, importJobId: string) {
  const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!job) {
    throw new Error(`ImportJob not found: ${importJobId}`);
  }

  if (
    job.status === ImportJobStatus.SUCCEEDED ||
    job.status === ImportJobStatus.FAILED
  ) {
    return;
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: ImportJobStatus.RUNNING,
      startedAt: new Date(),
      progress: 5,
      message: "Starting import...",
    },
  });

  const csvPath = job.csvPath?.trim();
  const fileUri = job.fileUri?.trim();

  // For most import types we require either a local csvPath (dev/legacy) or a
  // fileUri (prod GCS uploads). XACT_COMPONENTS_ALLOCATE is the only type that
  // does not need an input file at all.
  if (
    job.type !== ImportJobType.XACT_COMPONENTS_ALLOCATE &&
    !csvPath &&
    !fileUri
  ) {
    throw new Error("Import job has no csvPath or fileUri to read from");
  }

  // For legacy/local csvPath-based jobs, fail fast if the file truly does not
  // exist and there is no fileUri fallback. When a fileUri is present, the
  // type-specific handler (e.g. XACT_RAW, PRICE_LIST) is responsible for
  // downloading the object from GCS into a local tmp path.
  if (csvPath && !fs.existsSync(csvPath) && !fileUri) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  if (job.type === ImportJobType.XACT_RAW) {
    console.log("[worker] XACT_RAW start", {
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
      fileUri: job.fileUri,
      csvPath,
    });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { progress: 20, message: "Importing Xact raw line items..." },
    });

    if (!job.projectId) {
      throw new Error("XACT_RAW import job is missing projectId");
    }

    let effectiveCsvPath = csvPath;

    // If csvPath is not set but fileUri is, fetch the CSV from GCS to a local tmp path.
    if ((!effectiveCsvPath || !effectiveCsvPath.trim()) && job.fileUri) {
      console.log("[worker] XACT_RAW using fileUri, downloading from GCS", {
        importJobId,
        fileUri: job.fileUri,
      });
      effectiveCsvPath = await downloadGcsToTmp(job.fileUri);
      console.log("[worker] XACT_RAW downloaded GCS file", {
        importJobId,
        fileUri: job.fileUri,
        effectiveCsvPath,
      });
    }

    if (!effectiveCsvPath || !effectiveCsvPath.trim()) {
      throw new Error("XACT_RAW import job has no csvPath or fileUri to read from");
    }

    const startedAt = Date.now();

    const result = await importXactCsvForProject({
      projectId: job.projectId,
      csvPath: effectiveCsvPath,
      importedByUserId: job.createdByUserId,
    });

    const durationMs = Date.now() - startedAt;

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Import complete",
        resultJson: result as any,
      },
    });

    console.log("[worker] XACT_RAW complete", {
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
      durationMs,
      resultSummary: {
        estimateVersionId: (result as any)?.estimateVersionId,
        itemCount: (result as any)?.itemCount,
        totalAmount: (result as any)?.totalAmount,
      },
    });

    return;
  }

  if (job.type === ImportJobType.XACT_COMPONENTS) {
    console.log(
      "[worker] XACT_COMPONENTS ingestion (chunked) job start importJobId=%s csvPath=%s",
      importJobId,
      csvPath,
    );

    await runXactComponentsIngestionJob(prisma, job);

    return;
  }

  // NOTE: we no longer enqueue separate XACT_COMPONENTS_ALLOCATE jobs. Allocation
  // is now run inline as part of the XACT_COMPONENTS ingestion job once all
  // chunks complete. This branch is kept only for backwards compatibility if any
  // legacy jobs remain in the queue.
  if (job.type === ImportJobType.XACT_COMPONENTS_ALLOCATE) {
    console.log(
      "[worker] XACT_COMPONENTS_ALLOCATE legacy job start importJobId=%s estimateVersionId=%s",
      importJobId,
      job.estimateVersionId,
    );

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { progress: 20, message: "Allocating components (legacy job)..." },
    });

    await runXactComponentsAllocationJob(prisma, job);

    return;
  }

  if (job.type === ImportJobType.PRICE_LIST) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
        progress: 10,
        message: "Importing Golden price list...",
      },
    });

    let effectiveCsvPath = csvPath;

    // If we do not have a usable local csvPath but a fileUri is present, fetch
    // the Golden PETL CSV from GCS into a local tmp path. This mirrors the
    // XACT_RAW pattern so Golden imports work reliably in multi-pod/remote
    // deployments where API and worker do not share a filesystem.
    if ((!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) && fileUri) {
      console.log("[worker] PRICE_LIST using fileUri, downloading from GCS", {
        importJobId,
        fileUri,
      });
      effectiveCsvPath = await downloadGcsToTmp(fileUri);
      console.log("[worker] PRICE_LIST downloaded GCS file", {
        importJobId,
        fileUri,
        effectiveCsvPath,
      });
    }

    if (!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) {
      throw new Error(
        "PRICE_LIST import job has no usable csvPath or fileUri to read from.",
      );
    }

    const startedAt = Date.now();
    const result = await importPriceListFromFile(effectiveCsvPath);
    const durationMs = Date.now() - startedAt;

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Golden price list import complete",
        resultJson: result as any,
      },
    });

    console.log("[worker] PRICE_LIST complete", {
      importJobId,
      companyId: job.companyId,
      durationMs,
      resultSummary: result,
    });

    // Record a Golden price list revision event so the Revision Log can
    // differentiate PETL uploads vs Xact CSV-based repricing. This mirrors the
    // behavior that previously lived in the controller.
    if (job.companyId && job.createdByUserId) {
      await prisma.goldenPriceUpdateLog.create({
        data: {
          companyId: job.companyId,
          projectId: null,
          estimateVersionId: null,
          userId: job.createdByUserId,
          updatedCount: result.itemCount ?? 0,
          avgDelta: 0,
          avgPercentDelta: 0,
          source: "GOLDEN_PETL",
        },
      });
    }

    return;
  }

  if (job.type === ImportJobType.COMPANY_PRICE_LIST) {
    if (!job.companyId) {
      throw new Error("COMPANY_PRICE_LIST import job is missing companyId");
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
        progress: 10,
        message: "Importing tenant cost book...",
      },
    });

    const nonNullCsvPath = csvPath as string;

    const startedAtTenant = Date.now();
    const tenantResult = await importCompanyPriceListFromFile(job.companyId, nonNullCsvPath);
    const tenantDurationMs = Date.now() - startedAtTenant;

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Tenant cost book import complete",
        resultJson: tenantResult as any,
      },
    });

    console.log("[worker] COMPANY_PRICE_LIST complete", {
      importJobId,
      companyId: job.companyId,
      durationMs: tenantDurationMs,
      resultSummary: tenantResult,
    });

    return;
  }

  if (job.type === ImportJobType.PROJECT_PETL_PERCENT) {
    console.log("[worker] PROJECT_PETL_PERCENT start", {
      importJobId,
      projectId: job.projectId,
      csvPath,
    });

    if (!job.projectId) {
      throw new Error("PROJECT_PETL_PERCENT import job is missing projectId");
    }

    let effectiveCsvPath = csvPath;
    if ((!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) && fileUri) {
      console.log("[worker] PROJECT_PETL_PERCENT using fileUri, downloading from GCS", {
        importJobId,
        fileUri,
      });
      effectiveCsvPath = await downloadGcsToTmp(fileUri);
      console.log("[worker] PROJECT_PETL_PERCENT downloaded GCS file", {
        importJobId,
        fileUri,
        effectiveCsvPath,
      });
    }

    if (!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) {
      throw new Error(
        "PROJECT_PETL_PERCENT import job has no usable csvPath or fileUri to read from.",
      );
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
        progress: 10,
        message: "Importing PETL percent complete updates...",
      },
    });

    const rawContent = fs.readFileSync(effectiveCsvPath, "utf8");
    const lines = rawContent.replace(/^\uFEFF/, "").split(/\r?\n/);

    // Some exports have a few non-data lines before the header.
    // Prefer a header row that contains "% Complete" when available.
    const headerIndex = lines.findIndex(
      (line) =>
        /%\s*complete/i.test(line) && (line.includes("\t") || line.includes(",") || line.includes(";")),
    );

    const startIndex =
      headerIndex >= 0
        ? headerIndex
        : lines.findIndex((line) => line.replace(/[\s,]+/g, "").trim());

    const normalizedContent =
      startIndex >= 0 ? lines.slice(startIndex).join("\n") : rawContent;

    const headerLine = (normalizedContent.split(/\r?\n/)[0] ?? "").trim();
    const commaCount = (headerLine.match(/,/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    const semiCount = (headerLine.match(/;/g) || []).length;

    // Many NCC exports are TSV but saved with a .csv extension.
    const delimiter = tabCount > commaCount && tabCount > semiCount ? "\t" : semiCount > commaCount ? ";" : ",";

    const rows = parse(normalizedContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
    }) as Array<Record<string, string>>;

    const parsedRowCount = rows.length;
    const estimateVersionId = await getLatestEstimateVersionId(prisma, job.projectId);

    if (!estimateVersionId) {
      throw new Error("No estimate version found for project PETL percent import.");
    }

    const lineNoToPercent = new Map<number, number>();
    let rowsWithPercent = 0;

    // Header names in the incoming CSVs can vary wildly (spaces, casing, punctuation,
    // different labels). Build a normalized header map once so per-row parsing is cheap.
    const normalizeHeader = (s: string) =>
      String(s ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9%#]+/g, "");

    const headerKeys = rows[0] ? Object.keys(rows[0]) : [];
    const headerMap = new Map<string, string>();
    for (const k of headerKeys) {
      headerMap.set(normalizeHeader(k), k);
    }

    const findHeaderKey = (candidates: string[]) => {
      for (const cand of candidates) {
        const normalized = normalizeHeader(cand);
        const exact = headerMap.get(normalized);
        if (exact) return exact;

        // Fallback: substring match (e.g. "Percent Complete (RCV)")
        for (const [norm, original] of headerMap.entries()) {
          if (norm.includes(normalized)) return original;
        }
      }
      return null;
    };

    const parseLineNo = (raw: any) => {
      const s = String(raw ?? "").trim();
      if (!s) return null;
      // Avoid accidentally treating currency as a line number.
      if (s.includes("$") || /\d+\.\d+/.test(s)) return null;
      const digits = s.replace(/[^0-9]/g, "");
      if (!digits) return null;
      const n = Number(digits);
      if (!n || Number.isNaN(n)) return null;
      // Guardrail: typical Xactimate line numbers are relatively small.
      if (n < 1 || n > 20000) return null;
      return n;
    };

    const parsePercent = (raw: any) => {
      if (raw == null) return null;
      const s = String(raw).trim();
      if (!s) return null;
      const cleaned = s.replace(/[^0-9.]/g, "");
      if (!cleaned) return null;
      let pct = Number(cleaned);
      if (Number.isNaN(pct)) return null;

      // Handle fractional inputs like 0.25 meaning 25%.
      if (!s.includes("%") && cleaned.includes(".") && pct > 0 && pct <= 1) {
        pct = pct * 100;
      }

      pct = Math.max(0, Math.min(100, pct));
      return pct;
    };

    let lineKey =
      findHeaderKey([
        "#",
        "line",
        "line#",
        "lineno",
        "line no",
        "line number",
        "lineitem",
        "line item",
        "line item#",
        "line item number",
      ]) ?? null;

    let percentKey =
      findHeaderKey([
        "% complete",
        "%complete",
        "percent complete",
        "percentcomplete",
        "pct complete",
        "pctcomplete",
        "percent",
        "pct",
        "progress",
      ]) ?? null;

    // Fallbacks for non-standard headers.
    // 1) Common layout for reconcile/POL exports: Column B = percent, Column D = line number.
    // 2) If that doesn't work, score ALL columns and pick the best candidates.
    const sample = rows.slice(0, Math.min(rows.length, 200));
    const scoreColumn = (key: string, kind: "line" | "percent") => {
      let count = 0;
      for (const r of sample) {
        const v = r[key];
        if (kind === "line") {
          if (parseLineNo(v) != null) count += 1;
        } else {
          if (parsePercent(v) != null) count += 1;
        }
      }
      return count;
    };

    const bestKeyFor = (kind: "line" | "percent", excludeKey?: string | null) => {
      let best: { key: string; score: number } | null = null;
      for (const k of headerKeys) {
        if (!k) continue;
        if (excludeKey && k === excludeKey) continue;
        const score = scoreColumn(k, kind);
        if (!best || score > best.score) {
          best = { key: k, score };
        }
      }
      return best;
    };

    let fallbackUsed: string | null = null;

    // Fallback (B=% , D=line) with validation.
    if ((!percentKey || !lineKey) && headerKeys.length >= 4) {
      const bKey = headerKeys[1];
      const dKey = headerKeys[3];
      const bPct = bKey ? scoreColumn(bKey, "percent") : 0;
      const dLine = dKey ? scoreColumn(dKey, "line") : 0;

      if (!percentKey && bKey && bPct > 0) {
        percentKey = bKey;
        fallbackUsed = "column_B";
      }
      if (!lineKey && dKey && dLine > 0) {
        lineKey = dKey;
        fallbackUsed = fallbackUsed ? `${fallbackUsed}+column_D` : "column_D";
      }

      if (!fallbackUsed && bKey && dKey && bPct > 0 && dLine > 0) {
        fallbackUsed = "column_B_and_D";
      }
    }

    // If we still couldn't find usable keys, infer from values.
    // Require at least a few hits in the sample so we don't pick random columns.
    const minHits = Math.max(3, Math.floor(sample.length * 0.02));

    if (!percentKey) {
      const bestPct = bestKeyFor("percent");
      if (bestPct && bestPct.score >= minHits) {
        percentKey = bestPct.key;
        fallbackUsed = fallbackUsed ? `${fallbackUsed}+best_percent` : "best_percent";
      }
    }

    if (!lineKey) {
      const bestLine = bestKeyFor("line", percentKey);
      if (bestLine && bestLine.score >= minHits) {
        lineKey = bestLine.key;
        fallbackUsed = fallbackUsed ? `${fallbackUsed}+best_line` : "best_line";
      }
    }

    for (const row of rows) {
      const lineRaw =
        (lineKey ? row[lineKey] : undefined) ??
        row["#"] ??
        row["Line"] ??
        row["Line No"] ??
        row["LineNo"];

      const pctRaw =
        (percentKey ? row[percentKey] : undefined) ??
        row["% Complete"] ??
        row["Percent Complete"] ??
        row["Percent"];

      const lineNo = parseLineNo(lineRaw);
      if (!lineNo) continue;

      const pct = parsePercent(pctRaw);
      if (pct == null) continue;

      lineNoToPercent.set(lineNo, pct);
      rowsWithPercent += 1;
    }

    const targetLineNos = [...lineNoToPercent.keys()];
    const items = await prisma.sowItem.findMany({
      where: {
        estimateVersionId,
        lineNo: { in: targetLineNos },
      },
      select: {
        id: true,
        lineNo: true,
        percentComplete: true,
      },
    });

    const matchedCount = items.length;
    const matchedIds = new Map<number, (typeof items)[number]>(
      items.map(i => [i.lineNo, i]),
    );

    let updatedCount = 0;
    let skippedNoMatch = 0;
    let skippedNoChange = 0;

    const startedAt = new Date();
    const endedAt = new Date();

    // NOTE: Avoid Prisma interactive transactions for large loops (default timeout ~5s).
    // Instead, create the session once, then batch log inserts + updates.
    const session = await prisma.petlEditSession.create({
      data: {
        projectId: job.projectId!,
        userId: job.createdByUserId ?? null,
        source: "petl-percent-csv",
        startedAt,
        endedAt,
      },
    });

    const changesToCreate: Array<{
      sessionId: string;
      sowItemId: string;
      field: string;
      oldValue: number;
      newValue: number;
      effectiveAt: Date;
    }> = [];

    const updatesToApply: Array<{ id: string; percentComplete: number }> = [];

    for (const [lineNo, pct] of lineNoToPercent.entries()) {
      const item = matchedIds.get(lineNo);
      if (!item) {
        skippedNoMatch += 1;
        continue;
      }

      const oldPercent = item.percentComplete ?? 0;
      const next = pct;

      // Skip no-op updates (saves time + avoids unnecessary audit rows)
      if (Math.abs(oldPercent - next) < 0.0001) {
        skippedNoChange += 1;
        continue;
      }

      changesToCreate.push({
        sessionId: session.id,
        sowItemId: item.id,
        field: "percent_complete",
        oldValue: oldPercent,
        newValue: next,
        effectiveAt: endedAt,
      });

      updatesToApply.push({ id: item.id, percentComplete: next });
      updatedCount += 1;
    }

    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
      }
      return out;
    };

    // Insert audit rows in bulk.
    for (const part of chunk(changesToCreate, 1000)) {
      if (part.length === 0) continue;
      await prisma.petlEditChange.createMany({ data: part as any });
    }

    // Apply updates in manageable transactions.
    for (const part of chunk(updatesToApply, 200)) {
      if (part.length === 0) continue;
      await prisma.$transaction(
        part.map((u) =>
          prisma.sowItem.update({
            where: { id: u.id },
            data: {
              percentComplete: u.percentComplete,
              isAcvOnly: false,
            },
          })
        )
      );
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "PETL percent import complete",
        estimateVersionId,
        resultJson: {
          parsedRowCount,
          rowsWithPercent,
          matchedCount,
          updatedCount,
          skippedNoMatch,
          skippedNoChange,
          detectedHeaders: {
            lineKey,
            percentKey,
            fallbackUsed,
            delimiter,
            headerIndex: startIndex,
            sampleHeaders: headerKeys.slice(0, 30),
          },
        } as any,
      },
    });

    return;
  }
  if (job.type === ("FORTIFIED_PAYROLL_ADMIN" as ImportJobType)) {
    console.log("[worker] FORTIFIED_PAYROLL_ADMIN start", {
      importJobId,
      companyId: job.companyId,
      csvPath,
    });

    let effectiveCsvPath = csvPath;
    if ((!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) && fileUri) {
      console.log("[worker] FORTIFIED_PAYROLL_ADMIN using fileUri, downloading from GCS", {
        importJobId,
        fileUri,
      });
      effectiveCsvPath = await downloadGcsToTmp(fileUri);
      console.log("[worker] FORTIFIED_PAYROLL_ADMIN downloaded GCS file", {
        importJobId,
        fileUri,
        effectiveCsvPath,
      });
    }

    if (!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) {
      throw new Error(
        "FORTIFIED_PAYROLL_ADMIN import job has no usable csvPath or fileUri to read from.",
      );
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
        progress: 10,
        message: "Importing Fortified payroll admin users...",
      },
    });

    const rawContent = fs.readFileSync(effectiveCsvPath, "utf8");
    const lines = rawContent.replace(/^\uFEFF/, "").split(/\r?\n/);
    const startIndex = lines.findIndex(line => line.replace(/[\s,]+/g, "").trim());
    const normalizedContent =
      startIndex >= 0 ? lines.slice(startIndex).join("\n") : rawContent;

    const rows = parse(normalizedContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Array<Record<string, string>>;

    const passwordHash = await argon2.hash(DEFAULT_PASSWORD);
    const targetCompanyId = job.companyId;

    const parsedRowCount = rows.length;
    let processed = 0;
    let workersCreated = 0;
    let workersUpdated = 0;
    let usersCreated = 0;
    let membershipsCreated = 0;
    let hrUpdated = 0;
    let skippedNoUserMatch = 0;

    for (const row of rows) {
      const firstNameRaw = (row["1099 First Name"] ?? "").trim();
      const lastNameRaw = (row["1099 Last Name"] ?? "").trim();
      const combinedRaw = (row["Combined Name LN / FN"] ?? "").trim();

      let firstName = firstNameRaw;
      let lastName = lastNameRaw;

      if ((!firstName || !lastName) && combinedRaw) {
        const [lastPart, firstPart] = combinedRaw.split(",").map(s => s.trim());
        if (!firstName && firstPart) firstName = firstPart.split(/\s+/)[0] ?? firstPart;
        if (!lastName && lastPart) lastName = lastPart;
      }

      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) {
        continue;
      }

      processed += 1;

      const email = normalizeEmail(row.email);
      const phone = (row["Phone Number"] ?? "").trim() || null;
      const defaultPayRate = parseCurrency(row["Pay Rate / HR"]);

      const activeRaw = (row.Active ?? "").trim().toUpperCase();
      const status = activeRaw === "YES" ? "ACTIVE" : activeRaw === "NO" ? "INACTIVE" : null;

      const bankName = (row["Bank Name"] ?? "").trim() || null;
      const bankRoutingNumber = (row["Bank Routing"] ?? "").trim() || null;
      const bankAccountNumber = (row["Bank Acct"] ?? "").trim() || null;

      const existingWorker = await prisma.worker.findFirst({
        where: { fullName },
      });

      if (!existingWorker) {
        await prisma.worker.create({
          data: {
            firstName: firstName || fullName.split(" ")[0] || "",
            lastName:
              lastName ||
              fullName.split(" ").slice(1).join(" ") ||
              firstName ||
              "",
            fullName,
            email,
            phone,
            defaultPayRate: defaultPayRate ?? null,
            status,
          },
        });
        workersCreated += 1;
      } else {
        await prisma.worker.update({
          where: { id: existingWorker.id },
          data: {
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            ...(defaultPayRate != null ? { defaultPayRate } : {}),
            ...(status ? { status } : {}),
          },
        });
        workersUpdated += 1;
      }

      let user: any = null;
      if (email) {
        user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
        });
      }

      if (!user && !email) {
        user = await prisma.user.findFirst({
          where: {
            firstName: { equals: firstName, mode: "insensitive" } as any,
            lastName: { equals: lastName, mode: "insensitive" } as any,
          },
        });
      }

      if (!user && email) {
        user = await prisma.user.create({
          data: {
            email,
            passwordHash,
            firstName: firstName || null,
            lastName: lastName || null,
          },
        });
        usersCreated += 1;
      }

      if (!user) {
        skippedNoUserMatch += 1;
        continue;
      }

      if (!user.firstName && firstName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { firstName },
        });
      }
      if (!user.lastName && lastName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastName },
        });
      }

      const membership = await prisma.companyMembership.findUnique({
        where: {
          userId_companyId: {
            userId: user.id,
            companyId: targetCompanyId,
          },
        },
      });

      if (!membership) {
        await prisma.companyMembership.create({
          data: {
            userId: user.id,
            companyId: targetCompanyId,
            role: Role.MEMBER,
          },
        });
        membershipsCreated += 1;
      }

      await upsertHrPortfolio(prisma, {
        companyId: targetCompanyId,
        userId: user.id,
        bankName,
        bankAccountNumber,
        bankRoutingNumber,
      });
      hrUpdated += 1;
    }

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Fortified payroll admin import complete",
        resultJson: {
          parsedRowCount,
          processed,
          workersCreated,
          workersUpdated,
          usersCreated,
          membershipsCreated,
          hrUpdated,
          skippedNoUserMatch,
        } as any,
      },
    });

    return;
  }

  if (job.type === ImportJobType.BIA_LCP) {
    console.log("[worker] BIA_LCP start", {
      importJobId,
      companyId: job.companyId,
      csvPath,
    });

    try {
      await importBiaWorkers();

      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportJobStatus.SUCCEEDED,
          finishedAt: new Date(),
          progress: 100,
          message: "BIA LCP import complete",
        },
      });
    } catch (err: any) {
      console.error("[worker] BIA_LCP failed", {
        importJobId,
        error: err?.message ?? String(err),
      });
      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportJobStatus.FAILED,
          finishedAt: new Date(),
          message: "BIA LCP import failed",
          errorJson: safeError(err) as any,
        },
      });
    }

    return;
  }

  if (job.type === ImportJobType.PRICE_LIST_COMPONENTS) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
        progress: 10,
        message: "Importing Golden components...",
      },
    });

    let effectiveCsvPath = csvPath;

    // If we do not have a usable local csvPath but a fileUri is present, fetch
    // the Golden components CSV from GCS into a local tmp path. This mirrors
    // the PRICE_LIST pattern so components imports work reliably in
    // multi-pod/remote deployments where API and worker do not share a
    // filesystem.
    if ((!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) && fileUri) {
      console.log("[worker] PRICE_LIST_COMPONENTS using fileUri, downloading from GCS", {
        importJobId,
        fileUri,
      });
      effectiveCsvPath = await downloadGcsToTmp(fileUri);
      console.log("[worker] PRICE_LIST_COMPONENTS downloaded GCS file", {
        importJobId,
        fileUri,
        effectiveCsvPath,
      });
    }

    if (!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) {
      throw new Error(
        "PRICE_LIST_COMPONENTS import job has no usable csvPath or fileUri to read from.",
      );
    }

    const result = await importGoldenComponentsFromFile(effectiveCsvPath);

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Golden components import complete",
        resultJson: result as any,
      },
    });

    return;
  }

throw new Error(`Unhandled ImportJobType: ${job.type}`);
}

async function processImportChunk(prisma: PrismaService, payload: ChunkJobPayload) {
  const { importJobId, chunkIndex, chunkCount, strategy, payload: chunkPayload } = payload;

  const parentJob = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!parentJob) {
    throw new Error(`Parent ImportJob not found for chunk: ${importJobId}`);
  }

  if (parentJob.status !== ImportJobStatus.RUNNING) {
    // Ignore chunks for non-running parents to avoid resurrecting failed/completed jobs.
    console.warn(
      "[worker] Skipping chunk because parent job is not RUNNING",
      importJobId,
      parentJob.status,
    );
    return;
  }

  if (strategy === "XACT_COMPONENTS:line-range") {
    const { estimateVersionId, projectId, csvPath } = chunkPayload as {
      estimateVersionId: string;
      projectId: string;
      csvPath: string;
    };

    console.log(
      "[worker] XACT_COMPONENTS chunk start importJobId=%s chunkIndex=%s/%s csvPath=%s",
      importJobId,
      chunkIndex,
      chunkCount,
      csvPath,
    );

    const startedAt = Date.now();

    const chunkResult = await importXactComponentsChunkForEstimate({
      estimateVersionId,
      projectId,
      csvPath,
    });

    const durationMs = Date.now() - startedAt;

    console.log(
      "[worker] XACT_COMPONENTS chunk done importJobId=%s chunkIndex=%s durationMs=%s rawCount=%s summaryCount=%s",
      importJobId,
      chunkIndex,
      durationMs,
      (chunkResult as any)?.rawCount,
      (chunkResult as any)?.summaryCount,
    );

    let isLastChunk = false;

    await prisma.$transaction(async (tx) => {
      const latest = await tx.importJob.findUnique({ where: { id: importJobId } });
      if (!latest || latest.status !== ImportJobStatus.RUNNING) {
        return;
      }

      const total = latest.totalChunks ?? chunkCount ?? 1;
      const completed = (latest.completedChunks ?? 0) + 1;
      const progress = 10 + Math.floor(80 * (completed / total));

      await tx.importJob.update({
        where: { id: importJobId },
        data: {
          completedChunks: completed,
          progress,
        },
      });

      if (completed >= total) {
        isLastChunk = true;
        await tx.importJob.update({
          where: { id: importJobId },
          data: {
            status: ImportJobStatus.SUCCEEDED,
            finishedAt: new Date(),
            message: "Xact components ingestion (chunked) complete; allocation job will be queued",
          },
        });
      }
    });

    if (isLastChunk) {
      console.log(
        "[worker] XACT_COMPONENTS all chunks complete, running allocation inline for importJobId=%s",
        importJobId,
      );

      const parent = await prisma.importJob.findUnique({ where: { id: importJobId } });
      if (!parent) {
        throw new Error(`Parent ImportJob not found when finalizing chunks: ${importJobId}`);
      }

      if (!parent.estimateVersionId) {
        throw new Error(
          `Parent ImportJob ${importJobId} is missing estimateVersionId for allocation`,
        );
      }

      const allocationResult = await allocateComponentsForEstimate({
        estimateVersionId: parent.estimateVersionId,
      });

      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportJobStatus.SUCCEEDED,
          finishedAt: new Date(),
          progress: 100,
          message: "Xact components ingestion and allocation complete",
          resultJson: {
            phase: "ingestion+allocation",
            allocation: allocationResult,
          } as any,
        },
      });
    }

    return;
  }

  throw new Error(`Unsupported chunk strategy: ${strategy}`);
}

export async function startWorker() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const prisma = app.get(PrismaService);

  const worker = new Worker<ImportJobPayload>(
    IMPORT_QUEUE_NAME,
    async (bullJob: Job<ImportJobPayload>) => {
      const data = bullJob.data;
      if ((data as ChunkJobPayload).kind === "chunk") {
        await processImportChunk(prisma, data as ChunkJobPayload);
      } else {
        await processImportJob(prisma, (data as ParentJobPayload).importJobId);
      }
    },
    {
      // Cast to any to avoid BullMQ/ioredis multi-version type incompatibility.
      connection: getBullRedisConnection() as any,
      concurrency: Number(process.env.IMPORT_WORKER_CONCURRENCY || 1),
    },
  );

  worker.on("completed", (j) => {
    console.log(`[worker] completed bull job ${j.id}`);
  });

  worker.on("failed", async (j, err) => {
    console.error(`[worker] failed bull job ${j?.id}`, err);
    if (j?.data?.importJobId) {
      const detail = err instanceof Error ? err.message : String(err);
      const message = detail && detail.trim() ? `Import failed: ${detail}` : "Import failed";

      await prisma.importJob.update({
        where: { id: j.data.importJobId },
        data: {
          status: ImportJobStatus.FAILED,
          finishedAt: new Date(),
          message,
          errorJson: safeError(err) as any,
        },
      });
    }
  });

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    await worker.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`[worker] started (queue=${IMPORT_QUEUE_NAME})`);
}

// When this file is executed directly (e.g. npm run worker), start the worker.
// When imported (e.g. by worker-http.ts), callers can invoke startWorker() without
// creating multiple worker instances.
if (require.main === module) {
  startWorker().catch((err) => {
    console.error("[worker] fatal", err);
    process.exit(1);
  });
}
