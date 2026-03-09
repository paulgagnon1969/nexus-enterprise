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
  importComparatorCsvForProject,
  importGoldenComponentsFromFile,
  importBiaWorkers,
} from "@repo/database";
import { ImportJobStatus, ImportJobType, EmailReceiptStatus, Role as DbRole } from "@prisma/client";
import type { AuthenticatedUser } from "./modules/auth/jwt.strategy";
import { GlobalRole as AuthGlobalRole, Role as AuthRole } from "./modules/auth/auth.guards";
import { ProjectService } from "./modules/project/project.service";
import { importPriceListFromFile, importCompanyPriceListFromFile, importMasterCostbookFromFile, type PriceListImportMode } from "./modules/pricing/pricing.service";
import { RedisService, CACHE_KEY } from "./infra/redis/redis.service";
import { parse } from "csv-parse/sync";
import argon2 from "argon2";
import { decryptPortfolioHrJson, encryptPortfolioHrJson } from "./common/crypto/portfolio-hr.crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PlanSheetStatus } from "@prisma/client";
import { ObjectStorageService } from "./infra/storage/object-storage.service";

const execFileAsync = promisify(execFile);

const DEFAULT_PASSWORD = "Nexus2026.01";

// Resolved from NestJS DI container in startWorker(). Module-level ref so all
// helper functions can access it without threading the param everywhere.
let storageService: ObjectStorageService;

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

type ReceiptEmailOcrPayload = {
  kind?: "receipt-email-ocr";
  emailReceiptId: string;
  companyId: string;
  attachmentUrls: string[];
};

type ImportJobPayload = ParentJobPayload | ChunkJobPayload | ReceiptEmailOcrPayload;

// BullMQ: lower numeric priority value means higher priority.
const PRIORITY_DEFAULT = 5;
const PRIORITY_XACT_COMPONENTS = 3;
const PRIORITY_XACT_COMPONENTS_ALLOCATE = 1;

function safeError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

async function buildActorForImportJob(prisma: PrismaService, params: {
  companyId: string;
  createdByUserId: string | null;
}): Promise<AuthenticatedUser | null> {
  const { companyId, createdByUserId } = params;
  if (!companyId || !createdByUserId) return null;

  const [user, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: createdByUserId },
      select: {
        id: true,
        email: true,
        globalRole: true,
        userType: true,
      },
    }),
    prisma.companyMembership.findUnique({
      where: {
        userId_companyId: {
          userId: createdByUserId,
          companyId,
        },
      },
      select: {
        role: true,
        profile: { select: { code: true } },
      },
    }),
  ]);

  if (!user?.email) return null;

  const role = (membership?.role as any) ?? AuthRole.MEMBER;
  const globalRole = (user.globalRole as any) ?? AuthGlobalRole.NONE;
  const profileCode = (membership as any)?.profile?.code ?? null;

  return {
    userId: user.id,
    companyId,
    role,
    email: user.email,
    globalRole,
    userType: user.userType ?? null,
    profileCode,
  };
}

async function autoCreateOrSyncDraftInvoiceFromPetl(params: {
  prisma: PrismaService;
  projectService: ProjectService;
  importJobId: string;
  companyId: string;
  projectId: string | null;
  createdByUserId: string | null;
  reason: string;
}) {
  const { prisma, projectService, importJobId, companyId, projectId, createdByUserId, reason } = params;
  if (!projectId) return;

  try {
    const actor = await buildActorForImportJob(prisma, { companyId, createdByUserId });
    if (!actor) {
      console.warn("[worker] auto invoice sync skipped: cannot resolve actor", {
        importJobId,
        projectId,
        reason,
      });
      return;
    }

    await projectService.createOrGetDraftInvoice(projectId, {}, actor);

    console.log("[worker] auto-synced living draft invoice from PETL", {
      importJobId,
      projectId,
      reason,
    });
  } catch (err: any) {
    console.error("[worker] failed to auto-sync living draft invoice from PETL", {
      importJobId,
      projectId,
      reason,
      error: err?.message ?? String(err),
    });
  }
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
  return storageService.downloadToTmp(fileUri);
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

async function processImportJob(
  prisma: PrismaService,
  projectService: ProjectService,
  redis: RedisService,
  importJobId: string,
) {
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

    await autoCreateOrSyncDraftInvoiceFromPetl({
      prisma,
      projectService,
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
      createdByUserId: job.createdByUserId,
      reason: "XACT_RAW",
    });

    const csvCount = (result as any)?.trace?.csv?.recordCount ?? null;
    const rawInserted = (result as any)?.trace?.phases?.rawRows?.inserted ?? null;
    const sowBuilt = (result as any)?.trace?.phases?.sowItems?.built ?? null;
    const sowInserted = (result as any)?.trace?.phases?.sowItems?.inserted ?? null;

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message:
          csvCount != null && sowInserted != null
            ? `Import complete (${sowInserted}/${csvCount} line items)`
            : "Import complete",
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
        csvRecordCount: csvCount,
        rawInserted,
        sowBuilt,
        sowInserted,
        totalAmount: (result as any)?.totalAmount,
      },
    });

    return;
  }

  if (job.type === ImportJobType.XACT_COMPARATOR) {
    console.log("[worker] XACT_COMPARATOR start", {
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
      fileUri: job.fileUri,
      csvPath,
    });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { progress: 20, message: "Importing comparator estimate..." },
    });

    if (!job.projectId) {
      throw new Error("XACT_COMPARATOR import job is missing projectId");
    }

    let effectiveCsvPath = csvPath;

    if ((!effectiveCsvPath || !effectiveCsvPath.trim()) && job.fileUri) {
      effectiveCsvPath = await downloadGcsToTmp(job.fileUri);
    }

    if (!effectiveCsvPath || !effectiveCsvPath.trim()) {
      throw new Error("XACT_COMPARATOR import job has no csvPath or fileUri to read from");
    }

    const result = await importComparatorCsvForProject({
      projectId: job.projectId,
      csvPath: effectiveCsvPath,
      importedByUserId: job.createdByUserId,
    });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: `Comparator import complete (${(result as any)?.rowCount ?? 0} rows, activity: ${(result as any)?.detectedActivity ?? "unknown"})`,
        resultJson: result as any,
      },
    });

    console.log("[worker] XACT_COMPARATOR complete", {
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
      result,
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

    // Read import mode from metaJson if present, default to 'merge'
    const metaJson = job.metaJson as Record<string, any> | null;
    const importMode: PriceListImportMode = metaJson?.mode === "replace" ? "replace" : "merge";

    const startedAt = Date.now();
    const result = await importPriceListFromFile(effectiveCsvPath, { mode: importMode });
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

    // Invalidate Golden cache after successful import
    try {
      await redis.invalidateGoldenCache();
      console.log("[worker] PRICE_LIST cache invalidated");
    } catch (cacheErr) {
      console.warn("[worker] PRICE_LIST cache invalidation failed", cacheErr);
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

    // Invalidate company cache after successful import
    try {
      await redis.invalidateCompanyCache(job.companyId);
      console.log("[worker] COMPANY_PRICE_LIST cache invalidated for company=%s", job.companyId);
    } catch (cacheErr) {
      console.warn("[worker] COMPANY_PRICE_LIST cache invalidation failed", cacheErr);
    }

    return;
  }

  if (job.type === ImportJobType.MASTER_COSTBOOK) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.RUNNING,
        startedAt: new Date(),
        progress: 10,
        message: "Importing Master Costbook...",
      },
    });

    let effectiveCsvPath = csvPath;
    if ((!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) && fileUri) {
      console.log("[worker] MASTER_COSTBOOK using fileUri, downloading from GCS", { importJobId, fileUri });
      effectiveCsvPath = await downloadGcsToTmp(fileUri);
    }

    if (!effectiveCsvPath || !fs.existsSync(effectiveCsvPath)) {
      throw new Error("MASTER_COSTBOOK import job has no usable csvPath or fileUri to read from.");
    }

    const metaJson = job.metaJson as Record<string, any> | null;
    const importMode: PriceListImportMode = metaJson?.mode === "replace" ? "replace" : "merge";
    const sourceCategory = typeof metaJson?.sourceCategory === "string" ? metaJson.sourceCategory : undefined;

    const startedAtMaster = Date.now();
    const masterResult = await importMasterCostbookFromFile(effectiveCsvPath, {
      mode: importMode,
      sourceCategory,
    });
    const masterDurationMs = Date.now() - startedAtMaster;

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Master Costbook import complete",
        resultJson: masterResult as any,
      },
    });

    console.log("[worker] MASTER_COSTBOOK complete", {
      importJobId,
      durationMs: masterDurationMs,
      resultSummary: masterResult,
    });

    // Record revision event.
    if (job.companyId && job.createdByUserId) {
      await prisma.goldenPriceUpdateLog.create({
        data: {
          companyId: job.companyId,
          projectId: null,
          estimateVersionId: null,
          userId: job.createdByUserId,
          updatedCount: masterResult.itemCount ?? 0,
          avgDelta: 0,
          avgPercentDelta: 0,
          source: "MASTER_COSTBOOK",
        },
      });
    }

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

    await autoCreateOrSyncDraftInvoiceFromPetl({
      prisma,
      projectService,
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
      createdByUserId: job.createdByUserId,
      reason: "PROJECT_PETL_PERCENT",
    });

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
        select: { userId: true },
      });

      if (!membership) {
        await prisma.companyMembership.create({
          data: {
            userId: user.id,
            companyId: targetCompanyId,
            role: DbRole.MEMBER,
          },
          select: { userId: true },
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

  if (job.type === ImportJobType.PLAN_SHEETS) {
    console.log("[worker] PLAN_SHEETS start", {
      importJobId,
      companyId: job.companyId,
      projectId: job.projectId,
    });

    const meta = job.metaJson as Record<string, any> | null;
    const uploadId = meta?.uploadId as string;
    if (!uploadId) {
      throw new Error("PLAN_SHEETS job is missing uploadId in metaJson");
    }

    await processPlanSheetsJob(prisma, importJobId, uploadId, job.fileUri ?? null);
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

// ---------------------------------------------------------------------------
// Plan Sheet Processing (PDF → multi-resolution WebP images → GCS)
// ---------------------------------------------------------------------------

interface TierConfig {
  name: string;
  dpi: number;
  quality: number;
}

const PLAN_SHEET_TIERS: TierConfig[] = [
  { name: "thumb", dpi: 72, quality: 60 },
  { name: "standard", dpi: 150, quality: 85 },
  { name: "master", dpi: 400, quality: 92 },
];

async function processPlanSheetsJob(
  prisma: PrismaService,
  importJobId: string,
  uploadId: string,
  fileUri: string | null,
) {
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { progress: 5, message: "Downloading PDF..." },
  });

  // Mark all PENDING sheets as PROCESSING
  await prisma.planSheet.updateMany({
    where: { uploadId, status: PlanSheetStatus.PENDING },
    data: { status: PlanSheetStatus.PROCESSING },
  });

  // Download the PDF from GCS (or use local path for dev)
  let pdfPath: string;
  if (fileUri && fileUri.startsWith("gs://")) {
    pdfPath = await downloadGcsToTmp(fileUri);
  } else if (fileUri && fs.existsSync(fileUri)) {
    pdfPath = fileUri;
  } else {
    throw new Error(`PLAN_SHEETS: cannot resolve PDF path (fileUri=${fileUri})`);
  }

  // Create a working directory for image output
  const baseTmpDir = process.env.NCC_UPLOAD_TMP_DIR || os.tmpdir();
  const workDir = path.join(baseTmpDir, "ncc_uploads", "plan_sheets", uploadId);
  await fs.promises.mkdir(workDir, { recursive: true });

  // Get the page count from the upload record
  const upload = await prisma.projectDrawingUpload.findUnique({
    where: { id: uploadId },
    select: { pageCount: true },
  });
  const pageCount = upload?.pageCount ?? 0;
  if (pageCount === 0) {
    throw new Error("PLAN_SHEETS: upload has 0 pages");
  }

  const storageBucket = process.env.GCS_UPLOADS_BUCKET || process.env.XACT_UPLOADS_BUCKET || process.env.MINIO_BUCKET;
  // In local dev (no object storage), store WebP files under uploads/plan-sheets/
  // and save the relative path in the DB. The API serves them via a static route.
  const useLocalStorage = !storageBucket;
  const localUploadsDir = path.resolve(__dirname, "..", "uploads", "plan-sheets");

  const sheets = await prisma.planSheet.findMany({
    where: { uploadId, status: PlanSheetStatus.PROCESSING },
    orderBy: { sortOrder: "asc" },
  });

  const totalSteps = sheets.length * PLAN_SHEET_TIERS.length;
  let completedSteps = 0;

  for (const sheet of sheets) {
    const pageNo = sheet.pageNo;
    const tierPaths: Record<string, { gcsKey: string; localPath: string }> = {};

    try {
      for (const tier of PLAN_SHEET_TIERS) {
        const tierDir = path.join(workDir, tier.name);
        await fs.promises.mkdir(tierDir, { recursive: true });

        const ppmPrefix = path.join(tierDir, `page-${pageNo}`);
        const ppmOutput = `${ppmPrefix}-${String(pageNo).padStart(6, "0")}.ppm`;

        // pdftoppm: extract single page as PPM at the target DPI
        // -f and -l specify first/last page (1-indexed)
        await execFileAsync("pdftoppm", [
          "-r", String(tier.dpi),
          "-f", String(pageNo),
          "-l", String(pageNo),
          pdfPath,
          ppmPrefix,
        ]);

        // Find the actual output file (pdftoppm appends page number)
        const tierFiles = await fs.promises.readdir(tierDir);
        const ppmFile = tierFiles.find(
          (f) => f.startsWith(`page-${pageNo}`) && f.endsWith(".ppm"),
        );
        if (!ppmFile) {
          throw new Error(
            `pdftoppm produced no output for page ${pageNo} tier ${tier.name}`,
          );
        }
        const ppmPath = path.join(tierDir, ppmFile);

        // cwebp: convert PPM to WebP
        const webpPath = path.join(tierDir, `${pageNo}.webp`);
        await execFileAsync("cwebp", [
          "-q", String(tier.quality),
          ppmPath,
          "-o", webpPath,
        ]);

        // Clean up PPM (save disk)
        await fs.promises.unlink(ppmPath).catch(() => {});

        const gcsKey = `plan-sheets/${uploadId}/${tier.name}/${pageNo}.webp`;
        tierPaths[tier.name] = { gcsKey, localPath: webpPath };

        completedSteps++;
        const progress = Math.min(
          95,
          5 + Math.floor(90 * (completedSteps / totalSteps)),
        );
        await prisma.importJob.update({
          where: { id: importJobId },
          data: {
            progress,
            message: `Processing page ${pageNo}/${pageCount} (${tier.name})`,
          },
        });
      }

      // Upload all tiers for this page to GCS (or store locally in dev)
      const sizes: Record<string, number> = {};
      for (const [tierName, { gcsKey, localPath }] of Object.entries(tierPaths)) {
        const buffer = await fs.promises.readFile(localPath);
        sizes[tierName] = buffer.length;

        if (useLocalStorage) {
          // Dev: copy to uploads/plan-sheets/{uploadId}/{tier}/{pageNo}.webp
          const destDir = path.join(localUploadsDir, uploadId, tierName);
          await fs.promises.mkdir(destDir, { recursive: true });
          const destPath = path.join(destDir, `${pageNo}.webp`);
          await fs.promises.copyFile(localPath, destPath);
        } else {
          await storageService.uploadBuffer({
            bucket: storageBucket!,
            key: gcsKey,
            buffer,
            contentType: "image/webp",
          });
        }

        // Clean up working copy
        await fs.promises.unlink(localPath).catch(() => {});
      }

      // Update PlanSheet record with GCS paths + sizes
      await prisma.planSheet.update({
        where: { id: sheet.id },
        data: {
          status: PlanSheetStatus.READY,
          thumbPath: tierPaths.thumb?.gcsKey ?? null,
          standardPath: tierPaths.standard?.gcsKey ?? null,
          masterPath: tierPaths.master?.gcsKey ?? null,
          thumbBytes: sizes.thumb ?? 0,
          standardBytes: sizes.standard ?? 0,
          masterBytes: sizes.master ?? 0,
        },
      });

      console.log(
        "[worker] PLAN_SHEETS page %d/%d done (thumb=%sKB standard=%sKB master=%sKB)",
        pageNo,
        pageCount,
        Math.round((sizes.thumb ?? 0) / 1024),
        Math.round((sizes.standard ?? 0) / 1024),
        Math.round((sizes.master ?? 0) / 1024),
      );
    } catch (pageErr: any) {
      console.error(
        "[worker] PLAN_SHEETS page %d failed: %s",
        pageNo,
        pageErr?.message ?? String(pageErr),
      );
      await prisma.planSheet.update({
        where: { id: sheet.id },
        data: { status: PlanSheetStatus.FAILED },
      });
    }
  }

  // Clean up working directory
  await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  // Clean up downloaded PDF (if it was a temp file)
  if (fileUri && fileUri.startsWith("gs://")) {
    await fs.promises.unlink(pdfPath).catch(() => {});
  }

  // Summarize results
  const readyCount = await prisma.planSheet.count({
    where: { uploadId, status: PlanSheetStatus.READY },
  });
  const failedCount = await prisma.planSheet.count({
    where: { uploadId, status: PlanSheetStatus.FAILED },
  });

  const allSucceeded = failedCount === 0 && readyCount === pageCount;

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: allSucceeded
        ? ImportJobStatus.SUCCEEDED
        : failedCount === pageCount
          ? ImportJobStatus.FAILED
          : ImportJobStatus.SUCCEEDED,
      finishedAt: new Date(),
      progress: 100,
      message: allSucceeded
        ? `Plan sheets processed: ${readyCount}/${pageCount} pages`
        : `Plan sheets: ${readyCount} ready, ${failedCount} failed out of ${pageCount}`,
      resultJson: {
        uploadId,
        pageCount,
        readyCount,
        failedCount,
      } as any,
    },
  });

  console.log("[worker] PLAN_SHEETS complete", {
    importJobId,
    uploadId,
    pageCount,
    readyCount,
    failedCount,
  });
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

      // IMPORTANT: use an atomic increment to avoid races when multiple chunks
      // finish concurrently.
      const updated = await tx.importJob.update({
        where: { id: importJobId },
        data: {
          completedChunks: { increment: 1 },
        },
        select: {
          completedChunks: true,
          totalChunks: true,
        },
      });

      const total = updated.totalChunks ?? chunkCount ?? 1;
      const completed = updated.completedChunks ?? 0;

      // Keep progress below 100 until allocation completes.
      const progress = Math.min(90, 10 + Math.floor(80 * (completed / total)));

      // Update progress/message every chunk so the UI can poll for status.
      await tx.importJob.update({
        where: { id: importJobId },
        data: {
          progress,
          message: `Ingested ${completed}/${total} component chunk(s)`,
        },
      });

      if (completed >= total) {
        isLastChunk = true;
        // Do NOT mark the job SUCCEEDED yet; allocation still needs to run.
        await tx.importJob.update({
          where: { id: importJobId },
          data: {
            progress: 90,
            message: "All component chunks ingested; allocating components…",
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

      // Mark allocation as RUNNING so the UI doesn't think the job is "done".
      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          status: ImportJobStatus.RUNNING,
          progress: 92,
          message: "Allocating components to PETL…",
        },
      });

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

// ── Receipt Email OCR + Auto-Match ───────────────────────────────────

/**
 * Haversine distance in km between two lat/lng points.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function processReceiptEmailOcr(
  prisma: PrismaService,
  payload: ReceiptEmailOcrPayload,
) {
  const { emailReceiptId, companyId, attachmentUrls } = payload;

  const receipt = await prisma.emailReceipt.findUnique({
    where: { id: emailReceiptId },
  });
  if (!receipt) {
    console.error("[worker] EmailReceipt not found:", emailReceiptId);
    return;
  }

  console.log("[worker] RECEIPT_EMAIL_OCR start", {
    emailReceiptId,
    companyId,
    attachments: attachmentUrls.length,
  });

  // ── 1. Run OCR on the first image attachment ─────────────────────────
  // For MVP, we OCR the first image. Future: merge results from multiple.
  let ocrData: any = null;
  let ocrResultId: string | null = null;

  for (const url of attachmentUrls) {
    try {
      // Create a lightweight ProjectFile record for the OCR pipeline
      const pf = await prisma.projectFile.create({
        data: {
          companyId,
          projectId: companyId, // Placeholder — will be updated if matched
          storageUrl: url,
          fileName: url.split("/").pop() || "receipt",
          mimeType: url.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        },
      });

      // Create ReceiptOcrResult record
      const ocrResult = await prisma.receiptOcrResult.create({
        data: {
          projectFileId: pf.id,
          status: "PROCESSING",
          provider: "openai",
        },
      });

      ocrResultId = ocrResult.id;

      // We call the OpenAI OCR provider directly to avoid circular DI
      // In the worker context, we use the same extraction logic.
      const OpenAI = (await import("openai")).default;
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn("[worker] OPENAI_API_KEY not set; skipping OCR");
        await prisma.receiptOcrResult.update({
          where: { id: ocrResult.id },
          data: { status: "FAILED", errorMessage: "OPENAI_API_KEY not configured" },
        });
        break;
      }

      const openai = new OpenAI({ apiKey });

      // Prepare image URL — convert gs:// to public URL
      let imageUrl = url;
      if (url.startsWith("gs://")) {
        const match = url.match(/^gs:\/\/([^/]+)\/(.+)$/);
        if (match) {
          // Download from GCS to tmp and base64 encode
          const localPath = await downloadGcsToTmp(url);
          const buffer = await fs.promises.readFile(localPath);
          const base64 = buffer.toString("base64");
          const ext = path.extname(localPath).toLowerCase();
          const mime =
            ext === ".png" ? "image/png" : ext === ".pdf" ? "application/pdf" : "image/jpeg";
          imageUrl = `data:${mime};base64,${base64}`;
          await fs.promises.unlink(localPath).catch(() => {});
        }
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract receipt data as JSON: {vendor_name, vendor_address, vendor_phone, vendor_store_number, vendor_city, vendor_state, vendor_zip, receipt_date (YYYY-MM-DD), receipt_time (HH:mm), subtotal, tax_amount, total_amount, currency, payment_method, line_items: [{description, sku, quantity, unit_price, amount, category}], confidence}. Return ONLY valid JSON.`,
              },
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            ocrData = JSON.parse(jsonMatch[0]);
          } catch {
            console.warn("[worker] Failed to parse OCR JSON response");
          }
        }
      }

      // Update the OCR result record
      if (ocrData) {
        await prisma.receiptOcrResult.update({
          where: { id: ocrResult.id },
          data: {
            status: "COMPLETED",
            vendorName: ocrData.vendor_name ?? null,
            vendorAddress: ocrData.vendor_address ?? null,
            vendorPhone: ocrData.vendor_phone ?? null,
            vendorStoreNumber: ocrData.vendor_store_number ?? null,
            vendorCity: ocrData.vendor_city ?? null,
            vendorState: ocrData.vendor_state ?? null,
            vendorZip: ocrData.vendor_zip ?? null,
            receiptDate: ocrData.receipt_date ? new Date(ocrData.receipt_date) : null,
            receiptTime: ocrData.receipt_time ?? null,
            subtotal: ocrData.subtotal ?? null,
            taxAmount: ocrData.tax_amount ?? null,
            totalAmount: ocrData.total_amount ?? null,
            currency: ocrData.currency ?? "USD",
            paymentMethod: ocrData.payment_method ?? null,
            lineItemsJson: ocrData.line_items ? JSON.stringify(ocrData.line_items) : null,
            rawResponseJson: content ?? null,
            confidence: ocrData.confidence ?? null,
            processedAt: new Date(),
          },
        });

        // Link OCR result to the EmailReceipt
        await prisma.emailReceipt.update({
          where: { id: emailReceiptId },
          data: { ocrResultId: ocrResult.id },
        });
      } else {
        await prisma.receiptOcrResult.update({
          where: { id: ocrResult.id },
          data: { status: "FAILED", errorMessage: "No parseable OCR data" },
        });
      }

      break; // Only process first attachment for now
    } catch (err: any) {
      console.error("[worker] Receipt email OCR failed:", err?.message ?? err);
    }
  }

  // ── 2. Auto-match heuristic ──────────────────────────────────────────
  let matchedProjectId: string | null = null;
  let matchConfidence = 0;
  let matchReason = "";

  if (ocrData) {
    // Fetch active projects for this company with geocoded addresses
    const projects = await prisma.project.findMany({
      where: {
        companyId,
        status: { in: ["active", "Active", "ACTIVE"] },
      },
      select: {
        id: true,
        name: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        latitude: true,
        longitude: true,
        teamTreeJson: true,
      },
    });

    // Strategy A: Match by vendor store location proximity to project address
    if (ocrData.vendor_city && ocrData.vendor_state) {
      for (const proj of projects) {
        if (!proj.latitude || !proj.longitude) continue;

        // Simple city/state match first
        const cityMatch =
          proj.city?.toLowerCase() === ocrData.vendor_city?.toLowerCase() &&
          proj.state?.toLowerCase() === ocrData.vendor_state?.toLowerCase();

        if (cityMatch) {
          const confidence = 0.6;
          if (confidence > matchConfidence) {
            matchedProjectId = proj.id;
            matchConfidence = confidence;
            matchReason = `Vendor in ${ocrData.vendor_city}, ${ocrData.vendor_state} matches project "${proj.name}" location`;
          }
        }

        // If we have vendor zip and project zip, tighter match
        if (ocrData.vendor_zip && proj.postalCode) {
          const zipMatch = ocrData.vendor_zip?.slice(0, 5) === proj.postalCode?.slice(0, 5);
          if (zipMatch) {
            const confidence = 0.75;
            if (confidence > matchConfidence) {
              matchedProjectId = proj.id;
              matchConfidence = confidence;
              matchReason = `Vendor ZIP ${ocrData.vendor_zip} matches project "${proj.name}" ZIP ${proj.postalCode}`;
            }
          }
        }
      }
    }

    // Strategy B: Match by sender email against project team members
    if (receipt.senderEmail && !matchedProjectId) {
      const senderLower = receipt.senderEmail.toLowerCase();
      const user = await prisma.user.findFirst({
        where: { email: senderLower },
        select: { id: true },
      });

      if (user) {
        // Find projects this user is a member of
        const memberships = await prisma.projectMembership.findMany({
          where: {
            userId: user.id,
            companyId,
            project: { status: { in: ["active", "Active", "ACTIVE"] } },
          },
          select: { projectId: true, project: { select: { name: true } } },
          take: 1,
          orderBy: { createdAt: "desc" },
        });

        if (memberships.length === 1) {
          matchedProjectId = memberships[0].projectId;
          matchConfidence = 0.7;
          matchReason = `Sender ${receipt.senderEmail} is a member of project "${memberships[0].project.name}"`;
        }
      }
    }

    // Strategy C: Match by vendor store number against known vendor locations
    if (ocrData.vendor_store_number && ocrData.vendor_name && !matchedProjectId) {
      // Look up the vendor location in our system
      const vendorLoc = await prisma.location.findFirst({
        where: {
          companyId,
          name: { contains: ocrData.vendor_name, mode: "insensitive" },
          code: { contains: ocrData.vendor_store_number },
        },
        select: { id: true, latitude: true, longitude: true },
      });

      if (vendorLoc?.latitude && vendorLoc?.longitude) {
        // Find closest project
        let closestDist = Infinity;
        for (const proj of projects) {
          if (!proj.latitude || !proj.longitude) continue;
          const dist = haversineKm(vendorLoc.latitude, vendorLoc.longitude, proj.latitude, proj.longitude);
          if (dist < closestDist && dist < 50) {
            closestDist = dist;
            matchedProjectId = proj.id;
            matchConfidence = Math.min(0.9, 1 - dist / 100);
            matchReason = `${ocrData.vendor_name} #${ocrData.vendor_store_number} is ${dist.toFixed(1)}km from project "${proj.name}"`;
          }
        }
      }
    }
  }

  // ── 3. Update EmailReceipt status ────────────────────────────────────
  const newStatus = matchedProjectId
    ? EmailReceiptStatus.MATCHED
    : ocrData
      ? EmailReceiptStatus.PENDING_MATCH
      : EmailReceiptStatus.PENDING_MATCH;

  await prisma.emailReceipt.update({
    where: { id: emailReceiptId },
    data: {
      status: newStatus,
      projectId: matchedProjectId,
      matchConfidence: matchConfidence || null,
      matchReason: matchReason || null,
    },
  });

  // ── 4. If matched → create group Task for project team ──────────────
  if (matchedProjectId) {
    const project = await prisma.project.findUnique({
      where: { id: matchedProjectId },
      select: { name: true, teamTreeJson: true },
    });

    const vendorName = ocrData?.vendor_name || "Unknown vendor";
    const totalAmount = ocrData?.total_amount
      ? `$${Number(ocrData.total_amount).toFixed(2)}`
      : "";
    const dateStr = ocrData?.receipt_date || receipt.receivedAt.toISOString().slice(0, 10);

    // Create a task for the project team
    await prisma.task.create({
      data: {
        companyId,
        projectId: matchedProjectId,
        title: `Review receipt: ${vendorName} ${totalAmount} (${dateStr})`,
        description: `An email receipt from ${vendorName} was auto-matched to this project (${matchReason}). Please review and confirm or reassign.\n\nReceipt ID: ${emailReceiptId}`,
        status: "TODO",
        priority: "MEDIUM",
        relatedEntityType: "EMAIL_RECEIPT",
        relatedEntityId: emailReceiptId,
      },
    });

    // Send notifications to all project team members
    const teamTree = (project?.teamTreeJson as Record<string, string[]>) ?? {};
    const teamUserIds = new Set<string>();
    for (const userIds of Object.values(teamTree)) {
      if (Array.isArray(userIds)) {
        for (const uid of userIds) teamUserIds.add(uid);
      }
    }

    for (const userId of teamUserIds) {
      await prisma.notification.create({
        data: {
          userId,
          companyId,
          projectId: matchedProjectId,
          kind: "GENERIC",
          channel: "IN_APP",
          title: `Receipt matched: ${vendorName} ${totalAmount}`,
          body: `A receipt from ${receipt.senderEmail} was matched to "${project?.name}". Review and confirm assignment.`,
          metadata: { emailReceiptId, matchReason },
        },
      });
    }

    console.log("[worker] RECEIPT_EMAIL_OCR matched", {
      emailReceiptId,
      projectId: matchedProjectId,
      matchConfidence,
      matchReason,
      notifiedUsers: teamUserIds.size,
    });
  } else {
    console.log("[worker] RECEIPT_EMAIL_OCR no match found", {
      emailReceiptId,
      vendor: ocrData?.vendor_name,
      city: ocrData?.vendor_city,
      state: ocrData?.vendor_state,
    });
  }
}

export async function startWorker() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const prisma = app.get(PrismaService);
  const projectService = app.get(ProjectService);
  const redis = app.get(RedisService);
  storageService = app.get(ObjectStorageService);

  const worker = new Worker<ImportJobPayload>(
    IMPORT_QUEUE_NAME,
    async (bullJob: Job<ImportJobPayload>) => {
      const data = bullJob.data;

      // Receipt email OCR jobs use a different payload shape
      if (bullJob.name === "receipt-email-ocr" || (data as ReceiptEmailOcrPayload).emailReceiptId) {
        await processReceiptEmailOcr(prisma, data as ReceiptEmailOcrPayload);
        return;
      }

      if ((data as ChunkJobPayload).kind === "chunk") {
        await processImportChunk(prisma, data as ChunkJobPayload);
      } else {
        await processImportJob(prisma, projectService, redis, (data as ParentJobPayload).importJobId);
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
    const jobData = j?.data as any;
    if (jobData?.importJobId) {
      const detail = err instanceof Error ? err.message : String(err);
      const message = detail && detail.trim() ? `Import failed: ${detail}` : "Import failed";

      await prisma.importJob.update({
        where: { id: jobData.importJobId },
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
