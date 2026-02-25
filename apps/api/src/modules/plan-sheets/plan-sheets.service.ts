import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { GcsService } from "../../infra/storage/gcs.service";
import { getImportQueue, isRedisAvailable } from "../../infra/queue/import-queue";
import {
  ImportJobStatus,
  ImportJobType,
  PlanSheetStatus,
} from "@prisma/client";

type ImageTier = "thumb" | "standard" | "master";

@Injectable()
export class PlanSheetsService {
  private readonly logger = new Logger(PlanSheetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly gcsService: GcsService,
  ) {}

  // ── List plan sets for a project ───────────────────────────────────────

  async listPlanSets(projectId: string, companyId: string) {
    const uploads = await this.prisma.projectDrawingUpload.findMany({
      where: { projectId, companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        pageCount: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            planSheets: true,
          },
        },
        planSheets: {
          where: { status: PlanSheetStatus.READY },
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: {
            thumbPath: true,
          },
        },
      },
    });

    return uploads.map((u) => ({
      id: u.id,
      fileName: u.fileName,
      pageCount: u.pageCount,
      status: u.status,
      createdAt: u.createdAt,
      sheetCount: u._count.planSheets,
      coverThumbPath: u.planSheets[0]?.thumbPath ?? null,
    }));
  }

  // ── Get a single plan set with all sheets ──────────────────────────────

  async getPlanSet(uploadId: string, companyId: string) {
    const upload = await this.prisma.projectDrawingUpload.findFirst({
      where: { id: uploadId, companyId },
      select: {
        id: true,
        projectId: true,
        fileName: true,
        pageCount: true,
        status: true,
        createdAt: true,
        planSheets: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            pageNo: true,
            sheetId: true,
            title: true,
            section: true,
            status: true,
            thumbPath: true,
            standardPath: true,
            masterPath: true,
            thumbBytes: true,
            standardBytes: true,
            masterBytes: true,
            sortOrder: true,
          },
        },
      },
    });

    if (!upload) {
      throw new NotFoundException("Plan set not found");
    }

    return upload;
  }

  // ── Get a signed URL for a specific sheet image tier ────────────────────

  async getSheetImageUrl(
    sheetId: string,
    companyId: string,
    tier: ImageTier = "standard",
  ): Promise<{ url: string; tier: ImageTier }> {
    const sheet = await this.prisma.planSheet.findFirst({
      where: { id: sheetId },
      include: {
        upload: {
          select: { companyId: true },
        },
      },
    });

    if (!sheet || sheet.upload.companyId !== companyId) {
      throw new NotFoundException("Plan sheet not found");
    }

    if (sheet.status !== PlanSheetStatus.READY) {
      throw new BadRequestException(
        `Sheet is not ready (status: ${sheet.status})`,
      );
    }

    const pathMap: Record<ImageTier, string | null> = {
      thumb: sheet.thumbPath,
      standard: sheet.standardPath,
      master: sheet.masterPath,
    };

    const storedPath = pathMap[tier];
    if (!storedPath) {
      throw new NotFoundException(`No ${tier} image available for this sheet`);
    }

    // Check if GCS is configured; if not, serve from local uploads (dev)
    const bucket =
      this.configService.get<string>("GCS_UPLOADS_BUCKET") ??
      this.configService.get<string>("XACT_UPLOADS_BUCKET");

    if (!bucket) {
      // Dev mode: return a local API URL that serves the file
      const apiPort = this.configService.get<string>("API_PORT") ?? "8001";
      const url = `http://localhost:${apiPort}/plan-sheet-images/${storedPath}`;
      return { url, tier };
    }

    const url = await this.gcsService.createSignedReadUrl({
      bucket,
      key: storedPath,
      expiresInSeconds: 15 * 60,
    });

    return { url, tier };
  }

  // ── Trigger plan sheet processing via worker ───────────────────────────

  async enqueueProcessing(
    uploadId: string,
    companyId: string,
    userId: string,
  ) {
    const upload = await this.prisma.projectDrawingUpload.findFirst({
      where: { id: uploadId, companyId },
    });

    if (!upload) {
      throw new NotFoundException("Drawing upload not found");
    }

    // Check if sheets already exist / are being processed
    const existingSheets = await this.prisma.planSheet.count({
      where: {
        uploadId,
        status: { in: [PlanSheetStatus.PROCESSING, PlanSheetStatus.READY] },
      },
    });

    if (existingSheets > 0) {
      throw new BadRequestException(
        "Plan sheets are already processed or processing for this upload",
      );
    }

    // Create placeholder PlanSheet rows (one per page)
    const pageCount = upload.pageCount || 0;
    if (pageCount === 0) {
      throw new BadRequestException(
        "Upload has no pages. Text extraction may still be in progress.",
      );
    }

    // Parse sheet IDs from extractedTextJson if available
    const extractedPages: Array<{
      page: number;
      sheetId?: string;
    }> = Array.isArray(upload.extractedTextJson)
      ? (upload.extractedTextJson as any[])
      : [];

    const sheetData = Array.from({ length: pageCount }, (_, i) => {
      const pageInfo = extractedPages.find((p) => p.page === i + 1);
      return {
        uploadId,
        pageNo: i + 1,
        sheetId: pageInfo?.sheetId ?? null,
        status: PlanSheetStatus.PENDING,
        sortOrder: i,
      };
    });

    // Delete any existing FAILED/PENDING sheets before re-creating
    await this.prisma.planSheet.deleteMany({
      where: {
        uploadId,
        status: { in: [PlanSheetStatus.PENDING, PlanSheetStatus.FAILED] },
      },
    });

    await this.prisma.planSheet.createMany({ data: sheetData });

    // Enqueue a BullMQ job for the worker
    if (!isRedisAvailable()) {
      this.logger.warn(
        "Redis not available — plan sheet processing job NOT enqueued",
      );
      return { queued: false, message: "Redis not available" };
    }

    const job = await this.prisma.importJob.create({
      data: {
        companyId,
        projectId: upload.projectId,
        createdByUserId: userId,
        type: ImportJobType.PLAN_SHEETS,
        status: ImportJobStatus.QUEUED,
        progress: 0,
        fileUri: upload.storedPath,
        metaJson: { uploadId } as any,
      },
    });

    const queue = getImportQueue();
    await queue.add(
      "process",
      { importJobId: job.id },
      {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 1000,
        priority: 7, // Lower priority than data imports
      },
    );

    this.logger.log(
      `Enqueued PLAN_SHEETS job ${job.id} for upload ${uploadId} (${pageCount} pages)`,
    );

    return { queued: true, jobId: job.id, sheetCount: pageCount };
  }
}
