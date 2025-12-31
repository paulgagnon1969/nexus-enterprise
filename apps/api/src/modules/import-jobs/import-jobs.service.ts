import { BadRequestException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { getImportQueue } from "../../infra/queue/import-queue";
import { ImportJobStatus, ImportJobType } from "@prisma/client";

@Injectable()
export class ImportJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(params: {
    companyId: string;
    projectId: string;
    createdByUserId: string;
    type: ImportJobType;
    csvPath?: string;
    estimateVersionId?: string;
    fileUri?: string;
  }) {
    const { companyId, projectId, createdByUserId, type, csvPath, estimateVersionId, fileUri } = params;

    try {
      // BullMQ: lower numeric priority value means higher priority.
      // We bias allocation jobs slightly higher so they complete and
      // unblock UI/analytics quickly.
      let priority = 5; // default
      if (type === ImportJobType.XACT_COMPONENTS_ALLOCATE) {
        priority = 1;
      } else if (type === ImportJobType.XACT_COMPONENTS) {
        priority = 3;
      }

      const project = await this.prisma.project.findFirst({
        where: { id: projectId, companyId }
      });

      if (!project) {
        throw new NotFoundException("Project not found in this company");
      }

      const normalizedCsvPath = csvPath?.trim();
      const normalizedFileUri = fileUri?.trim();

      const requiresFile = type !== ImportJobType.XACT_COMPONENTS_ALLOCATE;

      if (requiresFile && !normalizedCsvPath && !normalizedFileUri) {
        throw new BadRequestException("csvPath or fileUri is required");
      }

      const job = await this.prisma.importJob.create({
        data: {
          companyId,
          projectId,
          createdByUserId,
          type,
          status: ImportJobStatus.QUEUED,
          progress: 0,
          csvPath: normalizedCsvPath || null,
          fileUri: normalizedFileUri || null,
          estimateVersionId: estimateVersionId?.trim() || null
        }
      });

      const queue = getImportQueue();
      await queue.add(
        "process",
        { importJobId: job.id },
        {
          attempts: 1,
          removeOnComplete: 1000,
          removeOnFail: 1000,
          priority,
        }
      );

      return job;
    } catch (err: any) {
      console.error("Error in ImportJobsService.createJob", {
        companyId,
        projectId,
        createdByUserId,
        type,
        csvPath,
        fileUri,
        estimateVersionId,
        error: err?.message ?? String(err),
      });

      if (err instanceof HttpException) {
        throw err;
      }

      throw new BadRequestException(
        `Import job creation failed: ${err?.message ?? String(err)}`,
      );
    }
  }

  async getJob(jobId: string, companyId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, companyId }
    });
    if (!job) {
      throw new NotFoundException("Import job not found");
    }
    return job;
  }

  async listJobsForProject(projectId: string, companyId: string) {
    return this.prisma.importJob.findMany({
      where: { projectId, companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async summarizePendingForCompany(companyId: string) {
    const pending = await this.prisma.importJob.findMany({
      where: {
        companyId,
        status: { in: [ImportJobStatus.QUEUED, ImportJobStatus.RUNNING] },
        // Only show long-running Xactimate imports in the pending summary. Golden
        // PETL / Components now run synchronously and should not appear here.
        type: {
          in: [
            ImportJobType.XACT_RAW,
            ImportJobType.XACT_COMPONENTS,
            ImportJobType.XACT_COMPONENTS_ALLOCATE,
          ],
        },
      },
      select: {
        type: true,
      },
    });

    const counts: Record<string, number> = {};
    for (const job of pending) {
      const key = job.type;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return counts;
  }

  async getXactComponentsIngestionReport(companyId: string) {
    const jobs = await this.prisma.importJob.findMany({
      where: {
        companyId,
        type: ImportJobType.XACT_COMPONENTS,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return jobs.map((job) => {
      const startedAt = job.startedAt ?? null;
      const finishedAt = job.finishedAt ?? null;
      const durationMs =
        startedAt && finishedAt
          ? finishedAt.getTime() - startedAt.getTime()
          : null;

      return {
        jobId: job.id,
        status: job.status,
        createdAt: job.createdAt,
        startedAt,
        finishedAt,
        durationMs,
        totalChunks: job.totalChunks,
        completedChunks: job.completedChunks,
        meta: job.metaJson as any,
      };
    });
  }
}
