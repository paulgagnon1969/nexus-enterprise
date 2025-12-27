import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    csvPath: string;
    estimateVersionId?: string;
  }) {
    const { companyId, projectId, createdByUserId, type, csvPath, estimateVersionId } = params;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId }
    });

    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    if (!csvPath || !csvPath.trim()) {
      throw new BadRequestException("csvPath is required");
    }

    const job = await this.prisma.importJob.create({
      data: {
        companyId,
        projectId,
        createdByUserId,
        type,
        status: ImportJobStatus.QUEUED,
        progress: 0,
        csvPath: csvPath.trim(),
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
        removeOnFail: 1000
      }
    );

    return job;
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
        type: { in: [ImportJobType.XACT_RAW, ImportJobType.XACT_COMPONENTS] },
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
}
