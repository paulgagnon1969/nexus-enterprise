import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { StagedDocumentStatus, DocumentScanJobStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Supported document extensions
const DOCUMENT_EXTENSIONS = new Set([
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf", "txt", "csv",
  // Images (often used as documents)
  "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg",
  // Markdown & text
  "md", "markdown", "json", "xml", "yaml", "yml",
  // Other
  "html", "htm", "eml", "msg"
]);

// MIME type mappings
const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
};

@Injectable()
export class DocumentImportService {
  private readonly logger = new Logger(DocumentImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // --- Scan Jobs ---

  async createScanJob(actor: AuthenticatedUser, scanPath: string) {
    // Validate the path exists and is accessible
    try {
      const stats = await stat(scanPath);
      if (!stats.isDirectory()) {
        throw new Error("Path must be a directory");
      }
    } catch (err) {
      throw new Error(`Cannot access path: ${scanPath}`);
    }

    const job = await this.prisma.documentScanJob.create({
      data: {
        companyId: actor.companyId,
        scanPath,
        status: DocumentScanJobStatus.PENDING,
        createdByUserId: actor.userId,
      },
    });

    // Start scanning in background (non-blocking)
    this.runScanJob(job.id, actor).catch((err) => {
      this.logger.error(`Scan job ${job.id} failed: ${err.message}`);
    });

    return job;
  }

  async listScanJobs(
    actor: AuthenticatedUser,
    opts: { status?: DocumentScanJobStatus; page?: number; pageSize?: number }
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const where = {
      companyId: actor.companyId,
      ...(opts.status && { status: opts.status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.documentScanJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.documentScanJob.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getScanJob(actor: AuthenticatedUser, jobId: string) {
    const job = await this.prisma.documentScanJob.findFirst({
      where: { id: jobId, companyId: actor.companyId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { stagedDocuments: true } },
      },
    });

    if (!job) throw new NotFoundException("Scan job not found");

    return job;
  }

  // --- Staged Documents ---

  async listStagedDocuments(
    actor: AuthenticatedUser,
    opts: {
      scanJobId?: string;
      status?: StagedDocumentStatus | "ALL";
      fileType?: string;
      search?: string;
      page?: number;
      pageSize?: number;
    }
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const where: any = {
      companyId: actor.companyId,
      ...(opts.scanJobId && { scanJobId: opts.scanJobId }),
      ...(opts.status && opts.status !== "ALL" && { status: opts.status }),
      ...(opts.fileType && { fileType: opts.fileType }),
      ...(opts.search && {
        OR: [
          { fileName: { contains: opts.search, mode: "insensitive" } },
          { filePath: { contains: opts.search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.stagedDocument.findMany({
        where,
        orderBy: [{ status: "asc" }, { fileName: "asc" }],
        skip,
        take: pageSize,
        include: {
          scanJob: { select: { id: true, scanPath: true } },
        },
      }),
      this.prisma.stagedDocument.count({ where }),
    ]);

    // Convert BigInt to string for JSON serialization
    const serializedItems = items.map((item) => ({
      ...item,
      fileSize: item.fileSize.toString(),
    }));

    return {
      items: serializedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getStagedDocument(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
      include: {
        scanJob: { select: { id: true, scanPath: true } },
        scannedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!doc) throw new NotFoundException("Document not found");

    return {
      ...doc,
      fileSize: doc.fileSize.toString(),
    };
  }

  async updateStagedDocument(
    actor: AuthenticatedUser,
    documentId: string,
    update: { status?: StagedDocumentStatus }
  ) {
    const existing = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!existing) throw new NotFoundException("Document not found");

    const data: any = {};

    if (update.status) {
      data.status = update.status;

      if (update.status === StagedDocumentStatus.ARCHIVED) {
        data.archivedAt = new Date();
        data.archivedByUserId = actor.userId;
      } else if (update.status === StagedDocumentStatus.ACTIVE) {
        // Un-archive: clear archived fields
        data.archivedAt = null;
        data.archivedByUserId = null;
      }
    }

    const updated = await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data,
    });

    return { ...updated, fileSize: updated.fileSize.toString() };
  }

  async bulkUpdateStagedDocuments(
    actor: AuthenticatedUser,
    documentIds: string[],
    status: StagedDocumentStatus
  ) {
    // Verify all documents belong to this company
    const docs = await this.prisma.stagedDocument.findMany({
      where: { id: { in: documentIds }, companyId: actor.companyId },
      select: { id: true },
    });

    const validIds = docs.map((d) => d.id);

    const data: any = { status };

    if (status === StagedDocumentStatus.ARCHIVED) {
      data.archivedAt = new Date();
      data.archivedByUserId = actor.userId;
    } else if (status === StagedDocumentStatus.ACTIVE) {
      data.archivedAt = null;
      data.archivedByUserId = null;
    }

    await this.prisma.stagedDocument.updateMany({
      where: { id: { in: validIds } },
      data,
    });

    return { updated: validIds.length };
  }

  // --- File Preview ---

  async getDocumentPreview(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");

    // Check if file still exists
    try {
      await stat(doc.filePath);
    } catch {
      throw new NotFoundException("File no longer exists at the original path");
    }

    return {
      filePath: doc.filePath,
      mimeType: doc.mimeType || "application/octet-stream",
      fileName: doc.fileName,
    };
  }

  // --- Internal: Scan Execution ---

  private async runScanJob(jobId: string, actor: AuthenticatedUser) {
    await this.prisma.documentScanJob.update({
      where: { id: jobId },
      data: { status: DocumentScanJobStatus.RUNNING, startedAt: new Date() },
    });

    try {
      const job = await this.prisma.documentScanJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error("Job not found");

      const documents: Array<{
        fileName: string;
        filePath: string;
        breadcrumb: string[];
        fileType: string;
        fileSize: bigint;
        mimeType: string | null;
      }> = [];

      await this.scanDirectory(job.scanPath, job.scanPath, documents);

      // Batch insert documents
      const batchSize = 500;
      let processed = 0;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        
        await this.prisma.stagedDocument.createMany({
          data: batch.map((doc) => ({
            companyId: job.companyId,
            scanJobId: jobId,
            fileName: doc.fileName,
            filePath: doc.filePath,
            breadcrumb: doc.breadcrumb,
            fileType: doc.fileType,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            status: StagedDocumentStatus.ACTIVE,
            scannedByUserId: actor.userId,
          })),
          skipDuplicates: true,
        });

        processed += batch.length;

        // Update progress
        await this.prisma.documentScanJob.update({
          where: { id: jobId },
          data: { documentsProcessed: processed },
        });
      }

      await this.prisma.documentScanJob.update({
        where: { id: jobId },
        data: {
          status: DocumentScanJobStatus.COMPLETED,
          documentsFound: documents.length,
          documentsProcessed: documents.length,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Scan job ${jobId} completed: ${documents.length} documents found`);
    } catch (err) {
      this.logger.error(`Scan job ${jobId} failed: ${err}`);

      await this.prisma.documentScanJob.update({
        where: { id: jobId },
        data: {
          status: DocumentScanJobStatus.FAILED,
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
    }
  }

  private async scanDirectory(
    rootPath: string,
    currentPath: string,
    results: Array<{
      fileName: string;
      filePath: string;
      breadcrumb: string[];
      fileType: string;
      fileSize: bigint;
      mimeType: string | null;
    }>
  ): Promise<void> {
    try {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files/directories
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          await this.scanDirectory(rootPath, fullPath, results);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase().slice(1);

          if (DOCUMENT_EXTENSIONS.has(ext)) {
            try {
              const fileStat = await stat(fullPath);
              const relativePath = path.relative(rootPath, fullPath);
              const breadcrumb = relativePath.split(path.sep);

              results.push({
                fileName: entry.name,
                filePath: fullPath,
                breadcrumb,
                fileType: ext,
                fileSize: BigInt(fileStat.size),
                mimeType: MIME_TYPES[ext] || null,
              });
            } catch {
              // Skip files we can't stat (permission issues, etc.)
            }
          }
        }
      }
    } catch (err) {
      // Log but continue scanning other directories
      this.logger.warn(`Error scanning ${currentPath}: ${err}`);
    }
  }

  // --- Statistics ---

  async getDocumentStats(actor: AuthenticatedUser, scanJobId?: string) {
    const where: any = {
      companyId: actor.companyId,
      ...(scanJobId && { scanJobId }),
    };

    const [byStatus, byType, total] = await Promise.all([
      this.prisma.stagedDocument.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
      this.prisma.stagedDocument.groupBy({
        by: ["fileType"],
        where,
        _count: true,
        orderBy: { _count: { fileType: "desc" } },
        take: 10,
      }),
      this.prisma.stagedDocument.count({ where }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byType: byType.map((item) => ({
        fileType: item.fileType,
        count: item._count,
      })),
    };
  }
}
