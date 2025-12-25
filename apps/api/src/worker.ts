import "reflect-metadata";
import fs from "node:fs";
import { NestFactory } from "@nestjs/core";
import { Worker, Job } from "bullmq";
import { AppModule } from "./app.module";
import { PrismaService } from "./infra/prisma/prisma.service";
import { IMPORT_QUEUE_NAME, getBullRedisConnection } from "./infra/queue/import-queue";
import {
  allocateComponentsForEstimate,
  importXactComponentsCsvForEstimate,
  importXactCsvForProject,
  importGoldenComponentsFromFile,
} from "@repo/database";
import { ImportJobStatus, ImportJobType } from "@repo/database";
import { importPriceListFromFile } from "./modules/pricing/pricing.service";

type ImportJobPayload = {
  importJobId: string;
};

function safeError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
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
  if (!csvPath) {
    throw new Error("Import job has no csvPath. (Prod will require object storage URI.)");
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found at ${csvPath}`);
  }

  if (job.type === ImportJobType.XACT_RAW) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { progress: 20, message: "Importing Xact raw line items..." },
    });

    if (!job.projectId) {
      throw new Error("XACT_RAW import job is missing projectId");
    }

    const result = await importXactCsvForProject({
      projectId: job.projectId,
      csvPath,
      importedByUserId: job.createdByUserId,
    });

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

    return;
  }

  if (job.type === ImportJobType.XACT_COMPONENTS) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { progress: 20, message: "Importing Xact components..." },
    });

    let estimateVersionId = job.estimateVersionId ?? null;

    if (!estimateVersionId) {
      const latest = await prisma.estimateVersion.findFirst({
        where: { projectId: job.projectId as string },
        orderBy: [
          { sequenceNo: "desc" },
          { importedAt: "desc" },
          { createdAt: "desc" },
        ],
      });
      if (!latest) {
        throw new Error(
          "No estimate version found. Import Xactimate raw line items first.",
        );
      }
      estimateVersionId = latest.id;
    }

    const componentsResult = await importXactComponentsCsvForEstimate({
      estimateVersionId,
      csvPath,
    });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: { progress: 70, message: "Allocating components..." },
    });

    const allocationResult = await allocateComponentsForEstimate({
      estimateVersionId,
    });

    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: ImportJobStatus.SUCCEEDED,
        finishedAt: new Date(),
        progress: 100,
        message: "Components import complete",
        resultJson: {
          estimateVersionId,
          components: componentsResult,
          allocation: allocationResult,
        } as any,
      },
    });

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

    const result = await importPriceListFromFile(csvPath);

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

    const result = await importGoldenComponentsFromFile(csvPath);

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

export async function startWorker() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const prisma = app.get(PrismaService);

  const worker = new Worker<ImportJobPayload>(
    IMPORT_QUEUE_NAME,
    async (bullJob: Job<ImportJobPayload>) => {
      const importJobId = bullJob.data.importJobId;
      await processImportJob(prisma, importJobId);
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
