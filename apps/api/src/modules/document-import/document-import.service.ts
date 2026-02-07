import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { StagedDocumentStatus, DocumentScanJobStatus, HtmlConversionStatus } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Base uploads directory for documents
const UPLOADS_DIR = path.join(__dirname, "../../../uploads/documents");

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

  // --- Browser-Based Upload ---

  /**
   * Upload a document file from the browser (File System Access API).
   * Creates a scan job if needed and saves the file to local storage.
   */
  async uploadDocument(
    actor: AuthenticatedUser,
    data: {
      fileName: string;
      fileBuffer: Buffer;
      mimeType: string;
      breadcrumb: string[];
      fileType: string;
      folderName: string;
      scanJobId?: string;
    }
  ) {
    // Get or create scan job for this upload session
    let scanJob;

    if (data.scanJobId) {
      scanJob = await this.prisma.documentScanJob.findFirst({
        where: { id: data.scanJobId, companyId: actor.companyId },
      });
    }

    if (!scanJob) {
      // Create a new scan job for browser uploads
      scanJob = await this.prisma.documentScanJob.create({
        data: {
          companyId: actor.companyId,
          scanPath: `Browser Upload: ${data.folderName}`,
          status: DocumentScanJobStatus.COMPLETED,
          createdByUserId: actor.userId,
          startedAt: new Date(),
          completedAt: new Date(),
          documentsFound: 0,
          documentsProcessed: 0,
        },
      });
    }

    // Create company-specific upload directory
    const companyDir = path.join(UPLOADS_DIR, actor.companyId);
    const jobDir = path.join(companyDir, scanJob.id);
    await mkdir(jobDir, { recursive: true });

    // Generate unique filename to avoid collisions
    const timestamp = Date.now();
    const safeFileName = data.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storedFileName = `${timestamp}_${safeFileName}`;
    const filePath = path.join(jobDir, storedFileName);

    // Write file to disk
    await writeFile(filePath, data.fileBuffer);

    // Get MIME type from extension if not provided
    const ext = data.fileType.toLowerCase();
    const mimeType = data.mimeType || MIME_TYPES[ext] || "application/octet-stream";

    // Create staged document record
    const doc = await this.prisma.stagedDocument.create({
      data: {
        companyId: actor.companyId,
        scanJobId: scanJob.id,
        fileName: data.fileName,
        filePath,
        breadcrumb: data.breadcrumb,
        fileType: ext,
        fileSize: BigInt(data.fileBuffer.length),
        mimeType,
        status: StagedDocumentStatus.ACTIVE,
        scannedByUserId: actor.userId,
      },
    });

    // Update scan job counts
    await this.prisma.documentScanJob.update({
      where: { id: scanJob.id },
      data: {
        documentsFound: { increment: 1 },
        documentsProcessed: { increment: 1 },
      },
    });

    this.logger.log(`Uploaded document: ${data.fileName} to ${filePath}`);

    return {
      ...doc,
      fileSize: doc.fileSize.toString(),
      scanJobId: scanJob.id,
    };
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

  // --- HTML Conversion ---

  /**
   * Convert a document to HTML for fast rendering.
   * Supports: .docx (via mammoth), .pdf (via pdf-parse), .txt/.md (direct)
   */
  async convertToHtml(documentId: string): Promise<{ success: boolean; error?: string }> {
    const doc = await this.prisma.stagedDocument.findUnique({ where: { id: documentId } });
    if (!doc) return { success: false, error: "Document not found" };

    // Mark as converting
    await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data: { conversionStatus: HtmlConversionStatus.CONVERTING },
    });

    try {
      // Check file exists
      await stat(doc.filePath);

      let html: string;
      const ext = doc.fileType.toLowerCase();

      if (ext === "docx") {
        // Word documents - excellent conversion
        const result = await mammoth.convertToHtml({ path: doc.filePath }, {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Title'] => h1.doc-title:fresh",
          ],
        });
        html = this.wrapHtmlContent(result.value, doc.displayTitle || doc.fileName);
        if (result.messages.length > 0) {
          this.logger.warn(`Conversion warnings for ${doc.fileName}: ${result.messages.map(m => m.message).join(", ")}`);
        }
      } else if (ext === "pdf") {
        // PDF - text extraction, wrap in HTML
        const pdfParser = new PDFParse({ url: doc.filePath });
        const textResult = await pdfParser.getText();
        const pdfText = textResult.text || "";
        html = this.convertPdfTextToHtml(pdfText, doc.displayTitle || doc.fileName);
      } else if (ext === "txt" || ext === "md" || ext === "markdown") {
        // Plain text - wrap directly
        const content = await readFile(doc.filePath, "utf-8");
        html = this.wrapTextContent(content, doc.displayTitle || doc.fileName, ext === "md" || ext === "markdown");
      } else if (ext === "doc") {
        // Old .doc format - not supported by mammoth, skip
        await this.prisma.stagedDocument.update({
          where: { id: documentId },
          data: {
            conversionStatus: HtmlConversionStatus.SKIPPED,
            conversionError: "Legacy .doc format not supported. Please convert to .docx",
          },
        });
        return { success: false, error: "Legacy .doc format not supported" };
      } else {
        // Unsupported format
        await this.prisma.stagedDocument.update({
          where: { id: documentId },
          data: {
            conversionStatus: HtmlConversionStatus.SKIPPED,
            conversionError: `File type .${ext} not supported for HTML conversion`,
          },
        });
        return { success: false, error: `Unsupported file type: ${ext}` };
      }

      // Save HTML content
      await this.prisma.stagedDocument.update({
        where: { id: documentId },
        data: {
          htmlContent: html,
          conversionStatus: HtmlConversionStatus.COMPLETED,
          conversionError: null,
          convertedAt: new Date(),
        },
      });

      this.logger.log(`Successfully converted ${doc.fileName} to HTML`);
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`HTML conversion failed for ${doc.fileName}: ${errorMsg}`);

      await this.prisma.stagedDocument.update({
        where: { id: documentId },
        data: {
          conversionStatus: HtmlConversionStatus.FAILED,
          conversionError: errorMsg,
        },
      });

      return { success: false, error: errorMsg };
    }
  }

  private wrapHtmlContent(bodyHtml: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${this.escapeHtml(title)}</title>
  <style>
    body { font-family: 'Georgia', 'Times New Roman', serif; line-height: 1.6; color: #1a1a1a; max-width: 8.5in; margin: 0 auto; padding: 1in; }
    h1 { font-size: 24px; margin-top: 0; border-bottom: 2px solid #dc2626; padding-bottom: 8px; }
    h2 { font-size: 20px; margin-top: 24px; color: #374151; }
    h3 { font-size: 16px; margin-top: 20px; color: #4b5563; }
    p { margin: 12px 0; text-align: justify; }
    ul, ol { margin: 12px 0; padding-left: 24px; }
    li { margin: 6px 0; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    strong, b { font-weight: 600; }
    .doc-title { font-size: 28px; text-align: center; border-bottom: none; }
    @media print { body { padding: 0.5in; } }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  private convertPdfTextToHtml(text: string, title: string): string {
    // Split by double newlines to find paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    
    const bodyHtml = paragraphs.map(p => {
      const trimmed = p.trim();
      // Simple heuristic: ALL CAPS lines might be headings
      if (trimmed === trimmed.toUpperCase() && trimmed.length < 100 && !trimmed.includes(".")) {
        return `<h2>${this.escapeHtml(trimmed)}</h2>`;
      }
      // Preserve line breaks within paragraphs for lists/structured content
      const withBreaks = trimmed.replace(/\n/g, "<br>");
      return `<p>${this.escapeHtml(withBreaks).replace(/&lt;br&gt;/g, "<br>")}</p>`;
    }).join("\n");

    return this.wrapHtmlContent(`<h1>${this.escapeHtml(title)}</h1>\n${bodyHtml}`, title);
  }

  private wrapTextContent(text: string, title: string, isMarkdown: boolean): string {
    // For now, treat markdown as plain text with preserved whitespace
    // Could integrate a markdown parser later
    const escaped = this.escapeHtml(text);
    const formatted = isMarkdown 
      ? `<pre style="font-family: inherit; white-space: pre-wrap;">${escaped}</pre>`
      : `<pre style="font-family: inherit; white-space: pre-wrap;">${escaped}</pre>`;
    
    return this.wrapHtmlContent(`<h1>${this.escapeHtml(title)}</h1>\n${formatted}`, title);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Get HTML content for a document. Returns null if not converted.
   */
  async getDocumentHtml(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
      select: {
        id: true,
        fileName: true,
        displayTitle: true,
        htmlContent: true,
        conversionStatus: true,
        conversionError: true,
        filePath: true,
      },
    });

    if (!doc) throw new NotFoundException("Document not found");

    return {
      id: doc.id,
      title: doc.displayTitle || doc.fileName,
      htmlContent: doc.htmlContent,
      conversionStatus: doc.conversionStatus,
      conversionError: doc.conversionError,
      hasOriginal: true, // Can always fall back to original file
      originalPath: doc.filePath,
    };
  }

  /**
   * Re-convert a document (e.g., if source changed or conversion improved)
   */
  async reconvertDocument(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");

    return this.convertToHtml(documentId);
  }

  // --- Tagging & Document Details ---

  /**
   * Update document details including tags, category, title, description
   */
  async updateDocumentDetails(
    actor: AuthenticatedUser,
    documentId: string,
    data: {
      displayTitle?: string;
      displayDescription?: string;
      tags?: string[];
      category?: string;
      subcategory?: string;
      revisionNotes?: string;
    }
  ) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");

    const updateData: any = {};

    if (data.displayTitle !== undefined) {
      updateData.displayTitle = data.displayTitle?.trim() || null;
    }
    if (data.displayDescription !== undefined) {
      updateData.displayDescription = data.displayDescription?.trim() || null;
    }
    if (data.tags !== undefined) {
      updateData.tags = data.tags.map(t => t.trim().toLowerCase()).filter(Boolean);
    }
    if (data.category !== undefined) {
      updateData.category = data.category?.trim() || null;
    }
    if (data.subcategory !== undefined) {
      updateData.subcategory = data.subcategory?.trim() || null;
    }
    if (data.revisionNotes !== undefined) {
      // When revision notes are updated, increment revision number
      updateData.revisionNotes = data.revisionNotes?.trim() || null;
      updateData.revisionNumber = { increment: 1 };
      updateData.revisionDate = new Date();
      
      // Store previous revision in history
      const history = (doc.revisionHistory as any[]) || [];
      history.push({
        revisionNumber: doc.revisionNumber,
        revisionNotes: doc.revisionNotes,
        revisionDate: doc.revisionDate,
        updatedBy: actor.userId,
        updatedAt: new Date().toISOString(),
      });
      updateData.revisionHistory = history;
    }

    const updated = await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    return { ...updated, fileSize: updated.fileSize.toString() };
  }

  /**
   * Publish a document (make it visible to all users)
   */
  async publishDocument(
    actor: AuthenticatedUser,
    documentId: string,
    publishData?: {
      displayTitle?: string;
      displayDescription?: string;
      category?: string;
      subcategory?: string;
      tags?: string[];
    }
  ) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status === StagedDocumentStatus.PUBLISHED) {
      throw new Error("Document is already published");
    }

    const updateData: any = {
      status: StagedDocumentStatus.PUBLISHED,
      publishedAt: new Date(),
      publishedByUserId: actor.userId,
      conversionStatus: HtmlConversionStatus.PENDING,
    };

    // Apply optional publish-time metadata
    if (publishData?.displayTitle) {
      updateData.displayTitle = publishData.displayTitle.trim();
    }
    if (publishData?.displayDescription) {
      updateData.displayDescription = publishData.displayDescription.trim();
    }
    if (publishData?.category) {
      updateData.category = publishData.category.trim();
    }
    if (publishData?.subcategory) {
      updateData.subcategory = publishData.subcategory.trim();
    }
    if (publishData?.tags) {
      updateData.tags = publishData.tags.map(t => t.trim().toLowerCase()).filter(Boolean);
    }

    const updated = await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    // Trigger HTML conversion in background
    this.convertToHtml(documentId).catch((err) => {
      this.logger.error(`Background conversion failed for ${documentId}: ${err.message}`);
    });

    return { ...updated, fileSize: updated.fileSize.toString() };
  }

  /**
   * Unpublish a document (return to ACTIVE/unpublished status)
   */
  async unpublishDocument(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status !== StagedDocumentStatus.PUBLISHED) {
      throw new Error("Document is not published");
    }

    const updated = await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data: {
        status: StagedDocumentStatus.ACTIVE,
        publishedAt: null,
        publishedByUserId: null,
      },
    });

    return { ...updated, fileSize: updated.fileSize.toString() };
  }

  /**
   * Bulk publish multiple documents
   */
  async bulkPublishDocuments(
    actor: AuthenticatedUser,
    documentIds: string[],
    publishData?: {
      category?: string;
      tags?: string[];
    }
  ) {
    // Verify all documents belong to this company and are not already published
    const docs = await this.prisma.stagedDocument.findMany({
      where: {
        id: { in: documentIds },
        companyId: actor.companyId,
        status: StagedDocumentStatus.ACTIVE,
      },
      select: { id: true },
    });

    const validIds = docs.map((d) => d.id);

    const updateData: any = {
      status: StagedDocumentStatus.PUBLISHED,
      publishedAt: new Date(),
      publishedByUserId: actor.userId,
      conversionStatus: HtmlConversionStatus.PENDING,
    };

    if (publishData?.category) {
      updateData.category = publishData.category.trim();
    }
    if (publishData?.tags) {
      updateData.tags = publishData.tags.map(t => t.trim().toLowerCase()).filter(Boolean);
    }

    await this.prisma.stagedDocument.updateMany({
      where: { id: { in: validIds } },
      data: updateData,
    });

    // Trigger HTML conversion for each document in background
    for (const id of validIds) {
      this.convertToHtml(id).catch((err) => {
        this.logger.error(`Background conversion failed for ${id}: ${err.message}`);
      });
    }

    return { published: validIds.length, skipped: documentIds.length - validIds.length };
  }

  // --- Published Documents (for all users) ---

  /**
   * Get published documents with optional filtering
   */
  async getPublishedDocuments(
    actor: AuthenticatedUser,
    opts: {
      category?: string;
      subcategory?: string;
      tags?: string[];
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
      status: StagedDocumentStatus.PUBLISHED,
      ...(opts.category && { category: opts.category }),
      ...(opts.subcategory && { subcategory: opts.subcategory }),
      ...(opts.tags && opts.tags.length > 0 && { tags: { hasSome: opts.tags } }),
      ...(opts.search && {
        OR: [
          { displayTitle: { contains: opts.search, mode: "insensitive" } },
          { fileName: { contains: opts.search, mode: "insensitive" } },
          { displayDescription: { contains: opts.search, mode: "insensitive" } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.stagedDocument.findMany({
        where,
        orderBy: [
          { category: "asc" },
          { sortOrder: { sort: "asc", nulls: "last" } },
          { displayTitle: "asc" },
          { fileName: "asc" },
        ],
        skip,
        take: pageSize,
        include: {
          publishedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.stagedDocument.count({ where }),
    ]);

    return {
      items: items.map((doc) => ({
        ...doc,
        fileSize: doc.fileSize.toString(),
        title: doc.displayTitle || doc.fileName.replace(/\.[^/.]+$/, ""),
        description: doc.displayDescription || null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get available categories for published documents
   */
  async getPublishedCategories(actor: AuthenticatedUser) {
    const categories = await this.prisma.stagedDocument.groupBy({
      by: ["category"],
      where: {
        companyId: actor.companyId,
        status: StagedDocumentStatus.PUBLISHED,
        category: { not: null },
      },
      _count: true,
    });

    return categories.map((c) => ({
      category: c.category,
      count: c._count,
    }));
  }

  /**
   * Get all unique tags used in published documents
   */
  async getPublishedTags(actor: AuthenticatedUser) {
    const docs = await this.prisma.stagedDocument.findMany({
      where: {
        companyId: actor.companyId,
        status: StagedDocumentStatus.PUBLISHED,
        tags: { isEmpty: false },
      },
      select: { tags: true },
    });

    // Flatten and deduplicate tags
    const allTags = new Set<string>();
    for (const doc of docs) {
      for (const tag of doc.tags) {
        allTags.add(tag);
      }
    }

    return Array.from(allTags).sort();
  }

  // --- Import Workflow (Legacy - maps to publish for backward compatibility) ---

  async importDocument(
    actor: AuthenticatedUser,
    documentId: string,
    importData: {
      importToType: string; // "safety" | "bkm"
      importToCategory: string; // e.g., "ppe", "general-safety"
      displayTitle?: string;
      displayDescription?: string;
      oshaReference?: string;
      sortOrder?: number;
    }
  ) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status === StagedDocumentStatus.PUBLISHED) {
      throw new Error("Document is already published");
    }

    const updated = await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data: {
        status: StagedDocumentStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: actor.userId,
        importedToType: importData.importToType,
        importedToCategory: importData.importToCategory,
        category: importData.importToCategory, // Also set new category field
        displayTitle: importData.displayTitle?.trim() || null,
        displayDescription: importData.displayDescription?.trim() || null,
        oshaReference: importData.oshaReference?.trim() || null,
        sortOrder: importData.sortOrder ?? null,
        conversionStatus: HtmlConversionStatus.PENDING,
      },
    });

    // Trigger HTML conversion in background
    this.convertToHtml(documentId).catch((err) => {
      this.logger.error(`Background conversion failed for ${documentId}: ${err.message}`);
    });

    return { ...updated, fileSize: updated.fileSize.toString() };
  }

  async bulkImportDocuments(
    actor: AuthenticatedUser,
    documentIds: string[],
    importData: {
      importToType: string;
      importToCategory: string;
    }
  ) {
    // Verify all documents belong to this company and are not already published
    const docs = await this.prisma.stagedDocument.findMany({
      where: {
        id: { in: documentIds },
        companyId: actor.companyId,
        status: { not: StagedDocumentStatus.PUBLISHED },
      },
      select: { id: true },
    });

    const validIds = docs.map((d) => d.id);

    await this.prisma.stagedDocument.updateMany({
      where: { id: { in: validIds } },
      data: {
        status: StagedDocumentStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: actor.userId,
        importedToType: importData.importToType,
        importedToCategory: importData.importToCategory,
        category: importData.importToCategory, // Also set new category field
        conversionStatus: HtmlConversionStatus.PENDING,
      },
    });

    // Trigger HTML conversion for each document in background
    for (const id of validIds) {
      this.convertToHtml(id).catch((err) => {
        this.logger.error(`Background conversion failed for ${id}: ${err.message}`);
      });
    }

    return { imported: validIds.length, skipped: documentIds.length - validIds.length };
  }

  async unimportDocument(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.stagedDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new NotFoundException("Document not found");
    if (doc.status !== StagedDocumentStatus.PUBLISHED) {
      throw new Error("Document is not published");
    }

    const updated = await this.prisma.stagedDocument.update({
      where: { id: documentId },
      data: {
        status: StagedDocumentStatus.ACTIVE,
        publishedAt: null,
        publishedByUserId: null,
        importedToType: null,
        importedToCategory: null,
        displayTitle: null,
        displayDescription: null,
        oshaReference: null,
        sortOrder: null,
      },
    });

    return { ...updated, fileSize: updated.fileSize.toString() };
  }

  // --- Imported/Published Documents Query (for Safety Manual, BKMs, etc.) ---

  async getImportedDocuments(
    actor: AuthenticatedUser,
    opts: {
      importToType: string;
      importToCategory?: string;
    }
  ) {
    const where: any = {
      companyId: actor.companyId,
      status: StagedDocumentStatus.PUBLISHED,
      importedToType: opts.importToType,
      ...(opts.importToCategory && { importedToCategory: opts.importToCategory }),
    };

    const docs = await this.prisma.stagedDocument.findMany({
      where,
      orderBy: [
        { sortOrder: { sort: "asc", nulls: "last" } },
        { displayTitle: "asc" },
        { fileName: "asc" },
      ],
      include: {
        publishedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return docs.map((doc) => ({
      ...doc,
      fileSize: doc.fileSize.toString(),
      // Provide display-friendly values
      title: doc.displayTitle || doc.fileName.replace(/\.[^/.]+$/, ""),
      description: doc.displayDescription || `Published from ${doc.breadcrumb.join(" / ")}`,
    }));
  }

  async getImportedCategories(actor: AuthenticatedUser, importToType: string) {
    const categories = await this.prisma.stagedDocument.groupBy({
      by: ["importedToCategory"],
      where: {
        companyId: actor.companyId,
        status: StagedDocumentStatus.PUBLISHED,
        importedToType: importToType,
        importedToCategory: { not: null },
      },
      _count: true,
    });

    return categories.map((c) => ({
      category: c.importedToCategory,
      count: c._count,
    }));
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
