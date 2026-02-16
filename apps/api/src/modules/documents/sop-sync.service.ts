import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import * as path from "path";
import {
  parseAllSops,
  parseSopFile,
  type ParsedSop,
  type SopSyncResult,
  type SopSyncReport,
} from "@repo/database";

// Path to staged SOPs relative to repo root
const STAGING_DIR = path.resolve(__dirname, "../../../../../docs/sops-staging");

// NccPM manual code - all SOPs sync into this manual
const NCCPM_MANUAL_CODE = "nccpm";

@Injectable()
export class SopSyncService {
  private readonly logger = new Logger(SopSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Get all staged SOPs with their sync status
   */
  async listStagedSops(): Promise<
    Array<{
      code: string;
      title: string;
      revision: string;
      status: string;
      module: string;
      fileModifiedAt: string;
      frontmatterUpdated: string;
      syncStatus: "new" | "updated" | "synced";
      currentSystemRevision?: string;
      systemDocumentId?: string;
    }>
  > {
    const stagedSops = parseAllSops(STAGING_DIR);

    const result = [];

    for (const sop of stagedSops) {
      const existing = await this.prisma.systemDocument.findUnique({
        where: { code: sop.code },
        include: {
          currentVersion: true,
        },
      });

      let syncStatus: "new" | "updated" | "synced" = "new";
      let currentSystemRevision: string | undefined;
      let systemDocumentId: string | undefined;

      if (existing) {
        systemDocumentId = existing.id;
        // Check if content has changed by comparing hash
        const currentHash = existing.currentVersion?.contentHash;
        if (currentHash === sop.contentHash) {
          syncStatus = "synced";
        } else {
          syncStatus = "updated";
        }
        // Extract revision from version notes or use version number
        currentSystemRevision = existing.currentVersion?.notes?.match(/Rev (\d+\.\d+)/)?.[1] 
          || `v${existing.currentVersion?.versionNo || 1}`;
      }

      result.push({
        code: sop.code,
        title: sop.frontmatter.title,
        revision: sop.frontmatter.revision,
        status: sop.frontmatter.status,
        module: sop.frontmatter.module,
        fileModifiedAt: sop.fileModifiedAt,
        frontmatterUpdated: sop.frontmatter.updated,
        syncStatus,
        currentSystemRevision,
        systemDocumentId,
      });
    }

    return result;
  }

  /**
   * Get a single staged SOP with preview
   */
  async getStagedSop(code: string): Promise<ParsedSop | null> {
    const filePath = path.join(STAGING_DIR, `${code}.md`);
    try {
      return parseSopFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Sync all staged SOPs to SystemDocument
   */
  async syncAllSops(actor: AuthenticatedUser): Promise<SopSyncReport> {
    const stagedSops = parseAllSops(STAGING_DIR);
    const results: SopSyncResult[] = [];

    for (const sop of stagedSops) {
      const result = await this.syncSingleSop(sop, actor);
      results.push(result);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      unchanged: results.filter((r) => r.action === "unchanged").length,
      errors: results.filter((r) => r.action === "error").length,
    };

    const report: SopSyncReport = {
      timestamp: new Date().toISOString(),
      results,
      summary,
    };

    this.logger.log(
      `SOP sync complete: ${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.errors} errors`,
    );

    return report;
  }

  /**
   * Sync a single SOP by code
   */
  async syncSopByCode(code: string, actor: AuthenticatedUser): Promise<SopSyncResult> {
    const sop = await this.getStagedSop(code);
    if (!sop) {
      return {
        code,
        title: "Unknown",
        action: "error",
        error: `SOP file not found: ${code}.md`,
      };
    }
    return this.syncSingleSop(sop, actor);
  }

  /**
   * Internal: sync a single parsed SOP
   */
  private async syncSingleSop(sop: ParsedSop, actor: AuthenticatedUser): Promise<SopSyncResult> {
    try {
      const existing = await this.prisma.systemDocument.findUnique({
        where: { code: sop.code },
        include: {
          currentVersion: true,
        },
      });

      if (!existing) {
        // Create new document
        return await this.createSystemDocument(sop, actor);
      }

      // Check if content changed
      if (existing.currentVersion?.contentHash === sop.contentHash) {
        return {
          code: sop.code,
          title: sop.frontmatter.title,
          action: "unchanged",
          systemDocumentId: existing.id,
        };
      }

      // Create new version
      return await this.createNewVersion(existing.id, sop, actor);
    } catch (err: any) {
      this.logger.error(`Failed to sync SOP ${sop.code}: ${err.message}`);
      return {
        code: sop.code,
        title: sop.frontmatter.title,
        action: "error",
        error: err.message,
      };
    }
  }

  /**
   * Create a new SystemDocument with initial version
   */
  private async createSystemDocument(
    sop: ParsedSop,
    actor: AuthenticatedUser,
  ): Promise<SopSyncResult> {
    const { code, frontmatter, htmlBody, contentHash } = sop;

    // Create document and first version in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create document without currentVersionId first
      const doc = await tx.systemDocument.create({
        data: {
          code,
          title: frontmatter.title,
          description: `SOP for ${frontmatter.module}`,
          category: "SOP",
          subcategory: frontmatter.module,
          tags: frontmatter.tags,
          active: true,
          isPublic: false,
          createdByUserId: actor.userId,
        },
      });

      // Create version
      const version = await tx.systemDocumentVersion.create({
        data: {
          systemDocumentId: doc.id,
          versionNo: 1,
          htmlContent: htmlBody,
          contentHash,
          notes: `Rev ${frontmatter.revision} - Initial import from docs/sops-staging`,
          createdByUserId: actor.userId,
        },
      });

      // Update document with currentVersionId
      await tx.systemDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });

      // Add to NccPM manual if it exists
      const nccpmManual = await tx.manual.findUnique({
        where: { code: NCCPM_MANUAL_CODE },
      });

      if (nccpmManual) {
        // Find or create the appropriate chapter based on module
        let chapterId: string | null = null;
        const chapterTitle = this.getChapterTitleForModule(frontmatter.module);

        if (chapterTitle) {
          const existingChapter = await tx.manualChapter.findFirst({
            where: {
              manualId: nccpmManual.id,
              title: chapterTitle,
              active: true,
            },
          });

          if (existingChapter) {
            chapterId = existingChapter.id;
          } else {
            // Create new chapter
            const maxOrder = await tx.manualChapter.aggregate({
              where: { manualId: nccpmManual.id },
              _max: { sortOrder: true },
            });
            const newChapter = await tx.manualChapter.create({
              data: {
                manualId: nccpmManual.id,
                title: chapterTitle,
                sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
              },
            });
            chapterId = newChapter.id;
          }
        }

        // Get max sort order for documents in the chapter
        const maxDocOrder = await tx.manualDocument.aggregate({
          where: {
            manualId: nccpmManual.id,
            chapterId,
            active: true,
          },
          _max: { sortOrder: true },
        });

        // Add document to manual
        await tx.manualDocument.create({
          data: {
            manualId: nccpmManual.id,
            chapterId,
            systemDocumentId: doc.id,
            sortOrder: (maxDocOrder._max.sortOrder ?? 0) + 1,
            addedInManualVersion: nccpmManual.currentVersion,
          },
        });

        this.logger.log(`Added SOP ${code} to NccPM manual (chapter: ${chapterTitle ?? "root"})`);
      }

      return { doc, version };
    });

    await this.audit.log(actor, "SYSTEM_DOCUMENT_CREATED", {
      metadata: {
        systemDocumentId: result.doc.id,
        code,
        title: frontmatter.title,
        revision: frontmatter.revision,
        source: "sop-sync",
      },
    });

    this.logger.log(`Created SystemDocument: ${code} (${frontmatter.title})`);

    return {
      code,
      title: frontmatter.title,
      action: "created",
      newRevision: frontmatter.revision,
      systemDocumentId: result.doc.id,
    };
  }

  /**
   * Create a new version of an existing SystemDocument
   */
  private async createNewVersion(
    systemDocumentId: string,
    sop: ParsedSop,
    actor: AuthenticatedUser,
  ): Promise<SopSyncResult> {
    const { code, frontmatter, htmlBody, contentHash } = sop;

    const result = await this.prisma.$transaction(async (tx) => {
      // Get current max version number
      const latestVersion = await tx.systemDocumentVersion.findFirst({
        where: { systemDocumentId },
        orderBy: { versionNo: "desc" },
      });

      const newVersionNo = (latestVersion?.versionNo ?? 0) + 1;
      const previousRevision = latestVersion?.notes?.match(/Rev (\d+\.\d+)/)?.[1] || `v${latestVersion?.versionNo || 0}`;

      // Create new version
      const version = await tx.systemDocumentVersion.create({
        data: {
          systemDocumentId,
          versionNo: newVersionNo,
          htmlContent: htmlBody,
          contentHash,
          notes: `Rev ${frontmatter.revision} - Updated from docs/sops-staging`,
          createdByUserId: actor.userId,
        },
      });

      // Update document's currentVersionId and metadata
      await tx.systemDocument.update({
        where: { id: systemDocumentId },
        data: {
          currentVersionId: version.id,
          title: frontmatter.title,
          tags: frontmatter.tags,
          subcategory: frontmatter.module,
        },
      });

      // NOTE: New version is NOT auto-published. Admin must manually publish.

      // Flag existing tenant copies that a newer version exists
      await tx.tenantDocumentCopy.updateMany({
        where: { sourceSystemDocumentId: systemDocumentId },
        data: { hasNewerSystemVersion: true },
      });

      return { version, previousRevision };
    });

    await this.audit.log(actor, "SYSTEM_DOCUMENT_VERSION_CREATED", {
      metadata: {
        systemDocumentId,
        code,
        title: frontmatter.title,
        newRevision: frontmatter.revision,
        versionNo: result.version.versionNo,
        source: "sop-sync",
      },
    });

    this.logger.log(
      `Updated SystemDocument: ${code} v${result.version.versionNo} (${frontmatter.revision})`,
    );

    return {
      code,
      title: frontmatter.title,
      action: "updated",
      previousRevision: result.previousRevision,
      newRevision: frontmatter.revision,
      systemDocumentId,
    };
  }

  /**
   * Map SOP module name to NccPM chapter title.
   * Returns null if the SOP should go to root level.
   */
  private getChapterTitleForModule(module: string): string | null {
    const moduleChapterMap: Record<string, string | null> = {
      // Feature SOPs
      "description-keeper": "Feature SOPs",
      "saved-phrases": "Feature SOPs",
      "document-import": "Feature SOPs",
      "daily-logs": "Feature SOPs",
      "invoicing": "Feature SOPs",
      "billing": "Feature SOPs",
      "timecard": "Feature SOPs",
      "user-management": "Feature SOPs",
      
      // Admin SOPs
      "admin": "Admin SOPs",
      "admin-only": "Admin SOPs",
      "system": "Admin SOPs",
      
      // Session Logs (development logs)
      "session-log": "Session Logs",
      "development": "Session Logs",
      
      // General goes to root
      "general": null,
    };

    const lowerModule = module.toLowerCase();
    
    // Check exact match first
    if (lowerModule in moduleChapterMap) {
      return moduleChapterMap[lowerModule];
    }

    // Check if module contains any known keywords
    for (const [key, chapter] of Object.entries(moduleChapterMap)) {
      if (lowerModule.includes(key) || key.includes(lowerModule)) {
        return chapter;
      }
    }

    // Default: Feature SOPs for any unknown module
    return "Feature SOPs";
  }
}
