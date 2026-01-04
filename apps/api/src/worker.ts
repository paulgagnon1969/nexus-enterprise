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
import { ImportJobStatus, ImportJobType } from "@prisma/client";
import { importPriceListFromFile } from "./modules/pricing/pricing.service";
import { Storage } from "@google-cloud/storage";
import { parse } from "csv-parse/sync";

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

  if (csvPath && !fs.existsSync(csvPath)) {
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

    const nonNullCsvPath = csvPath as string;

    const startedAt = Date.now();
    const result = await importPriceListFromFile(nonNullCsvPath);
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

    const nonNullCsvPath = csvPath as string;
    const result = await importGoldenComponentsFromFile(nonNullCsvPath);

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
      connection: getBullRedisConnection(),
      concurrency: Number(process.env.IMPORT_WORKER_CONCURRENCY || 1),
    },
  );

  worker.on("completed", (j) => {
    console.log(`[worker] completed bull job ${j.id}`);
  });

  worker.on("failed", async (j, err) => {
    console.error(`[worker] failed bull job ${j?.id}`, err);
    if (j?.data?.importJobId) {
      await prisma.importJob.update({
        where: { id: j.data.importJobId },
        data: {
          status: ImportJobStatus.FAILED,
          finishedAt: new Date(),
          message: "Import failed",
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
