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
  type SopType,
  type SopFrontmatter,
} from "@repo/database";

// Paths to document sources relative to repo root
const STAGING_DIR = path.resolve(__dirname, "../../../../../docs/sops-staging");
const POLICIES_DIR = path.resolve(__dirname, "../../../../../docs/policies");
const CAMS_DIR = path.resolve(__dirname, "../../../../../docs/cams");
const TRAINING_DIR = path.resolve(__dirname, "../../../../../docs/training-manuals");
const ELM_CREEK_DIR = path.resolve(__dirname, "../../../../../docs/elm-creek");

// All source directories for SOP documents
const SOURCE_DIRS = [STAGING_DIR, POLICIES_DIR, TRAINING_DIR];

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
   * Derive the SOP type from filename pattern, frontmatter, and source directory.
   */
  private deriveSopType(code: string, fm: SopFrontmatter, sourceDir: string): SopType {
    // CAM: has cam_id or comes from cams directory
    if (fm.cam_id || sourceDir === "cams") return "CAM";

    // Policy: from policies directory
    if (sourceDir === "policies") return "Policy";

    // Training Manual: from training-manuals directory
    if (sourceDir === "training-manuals") return "Training Manual";

    // Session Log: filename starts with session-
    if (code.startsWith("session-")) return "Session Log";

    const mod = (fm.module || "").toLowerCase();

    // Infrastructure: infra / deployment / dev-env / database / redis / cloudflare / shadow / cicd / check-types
    const infraKeywords = [
      "infrastructure", "dev-environment", "dev-infrastructure", "deployment",
      "cicd", "redis", "shadow", "database", "cloudflare", "check-types",
      "ssl", "dns", "docker",
    ];
    if (infraKeywords.some((k) => mod.includes(k))) return "Infrastructure";

    // Admin SOP: admin / system / asset-management / company-management / cam-system / cam-manual
    const adminKeywords = ["admin", "system", "asset-management", "asset-logistics", "company", "cam-system", "cam-manual"];
    if (adminKeywords.some((k) => mod.includes(k))) return "Admin SOP";

    // Feature SOP: recognized feature modules
    const featureKeywords = [
      "description-keeper", "saved-phrases", "document", "daily-log", "invoicing",
      "billing", "timecard", "user", "projects", "project", "petl", "bom",
      "mobile", "estimating", "xactimate", "field", "video", "voice",
      "smart", "supplier", "procurement", "receipt", "tucks", "urgency",
      "unified", "contacts", "client", "cross-tenant", "csv", "purchase",
      "onboarding", "self-registration", "authentication", "file-management",
      "manual", "edoc", "ncc", "geofencing", "scannex", "nexcheck", "osha",
      "nexfind", "local-price", "graceful", "vision", "web-app", "ui-performance",
      "messaging", "schedule", "bcm", "cms", "token", "app-support",
    ];
    if (featureKeywords.some((k) => mod.includes(k))) return "Feature SOP";

    // Fallback
    return "Orphan SOP";
  }

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
      sopType: SopType;
      fileModifiedAt: string;
      frontmatterUpdated: string;
      syncStatus: "new" | "updated" | "synced";
      currentSystemRevision?: string;
      systemDocumentId?: string;
      sourceDir?: string;
    }>
  > {
    // Collect SOPs from all source directories
    const allSops: Array<ParsedSop & { sourceDir: string }> = [];
    for (const dir of SOURCE_DIRS) {
      try {
        const sops = parseAllSops(dir);
        for (const sop of sops) {
          allSops.push({ ...sop, sourceDir: path.basename(dir) });
        }
      } catch {
        // Directory may not exist
      }
    }

    const result = [];

    for (const sop of allSops) {
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
        sopType: this.deriveSopType(sop.code, sop.frontmatter, sop.sourceDir),
        fileModifiedAt: sop.fileModifiedAt,
        frontmatterUpdated: sop.frontmatter.updated,
        syncStatus,
        currentSystemRevision,
        systemDocumentId,
        sourceDir: sop.sourceDir,
      });
    }

    return result;
  }

  /**
   * Get a single staged SOP with preview
   * Searches all source directories
   */
  async getStagedSop(code: string): Promise<ParsedSop | null> {
    for (const dir of SOURCE_DIRS) {
      const filePath = path.join(dir, `${code}.md`);
      try {
        return parseSopFile(filePath);
      } catch {
        // Try next directory
      }
    }
    return null;
  }

  /**
   * Sync all staged SOPs to SystemDocument
   * Syncs from all source directories
   */
  async syncAllSops(actor: AuthenticatedUser): Promise<SopSyncReport> {
    // Collect SOPs from all source directories
    const allSops: ParsedSop[] = [];
    for (const dir of SOURCE_DIRS) {
      try {
        const sops = parseAllSops(dir);
        allSops.push(...sops);
      } catch {
        // Directory may not exist
      }
    }
    const results: SopSyncResult[] = [];

    for (const sop of allSops) {
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

  // ───────────────────────────────────────────────
  // CAM Sync
  // ───────────────────────────────────────────────

  /**
   * Sync all CAM files from docs/cams/ to SystemDocument
   * and link to ModuleCatalog via camDocumentId.
   */
  async syncAllCams(actor: AuthenticatedUser): Promise<SopSyncReport> {
    let allCams: ParsedSop[] = [];
    try {
      allCams = parseAllSops(CAMS_DIR);
    } catch {
      // Directory may not exist
    }

    const results: SopSyncResult[] = [];
    for (const cam of allCams) {
      const result = await this.syncSingleCam(cam, actor);
      results.push(result);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      unchanged: results.filter((r) => r.action === "unchanged").length,
      errors: results.filter((r) => r.action === "error").length,
    };

    this.logger.log(
      `CAM sync complete: ${summary.created} created, ${summary.updated} updated, ${summary.unchanged} unchanged, ${summary.errors} errors`,
    );

    return { timestamp: new Date().toISOString(), results, summary };
  }

  /**
   * Internal: sync a single parsed CAM document
   */
  private async syncSingleCam(cam: ParsedSop, actor: AuthenticatedUser): Promise<SopSyncResult> {
    try {
      const existing = await this.prisma.systemDocument.findUnique({
        where: { code: cam.code },
        include: { currentVersion: true },
      });

      let docId: string;
      let action: SopSyncResult["action"];

      if (!existing) {
        // Create new CAM document
        const result = await this.prisma.$transaction(async (tx) => {
          const doc = await tx.systemDocument.create({
            data: {
              code: cam.code,
              title: cam.frontmatter.title,
              description: `CAM: ${cam.frontmatter.cam_id ?? cam.code}`,
              category: "CAM",
              subcategory: cam.frontmatter.module_code ?? cam.frontmatter.module,
              tags: cam.frontmatter.tags,
              active: true,
              isPublic: false,
              createdByUserId: actor.userId,
            },
          });
          const version = await tx.systemDocumentVersion.create({
            data: {
              systemDocumentId: doc.id,
              versionNo: 1,
              htmlContent: cam.htmlBody,
              contentHash: cam.contentHash,
              notes: `Rev ${cam.frontmatter.revision} - Initial CAM import`,
              createdByUserId: actor.userId,
            },
          });
          await tx.systemDocument.update({
            where: { id: doc.id },
            data: { currentVersionId: version.id },
          });
          return doc;
        });

        docId = result.id;
        action = "created";

        await this.audit.log(actor, "SYSTEM_DOCUMENT_CREATED", {
          metadata: {
            systemDocumentId: docId,
            code: cam.code,
            title: cam.frontmatter.title,
            revision: cam.frontmatter.revision,
            source: "cam-sync",
          },
        });

        this.logger.log(`Created CAM SystemDocument: ${cam.code}`);
      } else if (existing.currentVersion?.contentHash === cam.contentHash) {
        docId = existing.id;
        action = "unchanged";
      } else {
        // Update existing CAM
        await this.prisma.$transaction(async (tx) => {
          const latestVersion = await tx.systemDocumentVersion.findFirst({
            where: { systemDocumentId: existing.id },
            orderBy: { versionNo: "desc" },
          });
          const newVersionNo = (latestVersion?.versionNo ?? 0) + 1;
          const version = await tx.systemDocumentVersion.create({
            data: {
              systemDocumentId: existing.id,
              versionNo: newVersionNo,
              htmlContent: cam.htmlBody,
              contentHash: cam.contentHash,
              notes: `Rev ${cam.frontmatter.revision} - Updated CAM`,
              createdByUserId: actor.userId,
            },
          });
          await tx.systemDocument.update({
            where: { id: existing.id },
            data: {
              currentVersionId: version.id,
              title: cam.frontmatter.title,
              tags: cam.frontmatter.tags,
              subcategory: cam.frontmatter.module_code ?? cam.frontmatter.module,
            },
          });
        });

        docId = existing.id;
        action = "updated";

        this.logger.log(`Updated CAM SystemDocument: ${cam.code}`);
      }

      // Link to ModuleCatalog if module_code present
      if (cam.frontmatter.module_code) {
        const catalog = await this.prisma.moduleCatalog.findUnique({
          where: { code: cam.frontmatter.module_code },
        });
        if (catalog) {
          await this.prisma.moduleCatalog.update({
            where: { code: cam.frontmatter.module_code },
            data: { camDocumentId: docId },
          });
          this.logger.log(`Linked CAM ${cam.code} → ModuleCatalog ${cam.frontmatter.module_code}`);
        }
      }

      return {
        code: cam.code,
        title: cam.frontmatter.title,
        action,
        ...(action === "created" ? { newRevision: cam.frontmatter.revision } : {}),
        systemDocumentId: docId,
      };
    } catch (err: any) {
      this.logger.error(`Failed to sync CAM ${cam.code}: ${err.message}`);
      return {
        code: cam.code,
        title: cam.frontmatter.title,
        action: "error",
        error: err.message,
      };
    }
  }

  // ───────────────────────────────────────────────
  // Single CAM Detail
  // ───────────────────────────────────────────────

  /**
   * Get a single CAM's full HTML content by file code.
   */
  async getCamDetailHtml(code: string): Promise<{
    code: string;
    camId: string;
    title: string;
    synopsis: string;
    tags: string[];
    mode: string;
    category: string;
    scores: { uniqueness: number; value: number; demonstrable: number; defensible: number; total: number };
    status: string;
    revision: string;
    created: string;
    updated: string;
    htmlContent: string;
  } | null> {
    const filePath = path.join(CAMS_DIR, `${code}.md`);
    try {
      const cam = parseSopFile(filePath);
      const fm = cam.frontmatter;
      const scores = fm.scores || {};
      return {
        code: cam.code,
        camId: fm.cam_id || cam.code,
        title: fm.title,
        synopsis: this.extractSynopsis(cam.markdownBody),
        tags: fm.tags || [],
        mode: (fm.mode || "UNKNOWN").toUpperCase(),
        category: (fm.category || "UNKNOWN").toUpperCase(),
        scores: {
          uniqueness: scores.uniqueness ?? 0,
          value: scores.value ?? 0,
          demonstrable: scores.demonstrable ?? 0,
          defensible: scores.defensible ?? 0,
          total: scores.total ?? 0,
        },
        status: fm.status,
        revision: fm.revision,
        created: fm.created,
        updated: fm.updated,
        htmlContent: cam.htmlBody,
      };
    } catch {
      return null;
    }
  }

  // ───────────────────────────────────────────────
  // CAM Manual Data
  // ───────────────────────────────────────────────

  /**
   * Get CAM data grouped by mode for the CAM System Manual.
   * Modules sorted by aggregate score (avg of total scores in group) descending.
   */
  /**
   * Extract a short synopsis from the CAM markdown body.
   * Looks for the "Executive Summary" section; falls back to first paragraph.
   */
  private extractSynopsis(markdownBody: string, maxLen = 200): string {
    // Try to find ## Executive Summary section
    const execMatch = markdownBody.match(/##\s*Executive Summary\s*\n([\s\S]*?)(?=\n##\s|$)/);
    if (execMatch) {
      const text = execMatch[1].replace(/\n+/g, " ").replace(/\*\*/g, "").replace(/\*/g, "").trim();
      return text.length > maxLen ? text.slice(0, maxLen).replace(/\s\S*$/, "...") : text;
    }
    // Fallback: first non-heading, non-empty paragraph
    const lines = markdownBody.split("\n").filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("---"));
    const text = lines.slice(0, 3).join(" ").replace(/\*\*/g, "").replace(/\*/g, "").trim();
    return text.length > maxLen ? text.slice(0, maxLen).replace(/\s\S*$/, "...") : text;
  }

  async getCamManualData(): Promise<{
    modules: Array<{
      mode: string;
      modeLabel: string;
      camCount: number;
      aggregateScore: number; // avg of total scores
      cams: Array<{
        camId: string;
        code: string;
        title: string;
        category: string;
        synopsis: string;
        tags: string[];
        scores: { uniqueness: number; value: number; demonstrable: number; defensible: number; total: number };
        status: string;
        systemDocumentId?: string;
      }>;
    }>;
    totalCams: number;
    overallAvgScore: number;
  }> {
    let allCams: ParsedSop[] = [];
    try {
      allCams = parseAllSops(CAMS_DIR);
    } catch {
      // Directory may not exist
    }

    const MODE_LABELS: Record<string, string> = {
      EST: "Pricing & Estimation",
      FIN: "Financial Operations",
      OPS: "Project Operations",
      HR: "Workforce & Time Management",
      CLT: "Client Collaboration",
      CMP: "Compliance & Documentation",
      TECH: "Technology Infrastructure",
    };

    // Group by mode
    const moduleMap = new Map<string, {
      mode: string;
      cams: Array<{
        camId: string;
        code: string;
        title: string;
        category: string;
        synopsis: string;
        tags: string[];
        scores: { uniqueness: number; value: number; demonstrable: number; defensible: number; total: number };
        status: string;
        systemDocumentId?: string;
      }>;
    }>();

    for (const cam of allCams) {
      const fm = cam.frontmatter;
      const mode = (fm.mode || "UNKNOWN").toUpperCase();
      const scores = fm.scores || {};

      // Look up system document ID
      let systemDocumentId: string | undefined;
      try {
        const existing = await this.prisma.systemDocument.findUnique({
          where: { code: cam.code },
          select: { id: true },
        });
        if (existing) systemDocumentId = existing.id;
      } catch {
        // ignore
      }

      if (!moduleMap.has(mode)) {
        moduleMap.set(mode, { mode, cams: [] });
      }

      moduleMap.get(mode)!.cams.push({
        camId: fm.cam_id || cam.code,
        code: cam.code,
        title: fm.title,
        category: (fm.category || "UNKNOWN").toUpperCase(),
        synopsis: this.extractSynopsis(cam.markdownBody),
        tags: fm.tags || [],
        scores: {
          uniqueness: scores.uniqueness ?? 0,
          value: scores.value ?? 0,
          demonstrable: scores.demonstrable ?? 0,
          defensible: scores.defensible ?? 0,
          total: scores.total ?? 0,
        },
        status: fm.status,
        systemDocumentId,
      });
    }

    // Compute aggregate score per module and sort descending
    const modules = Array.from(moduleMap.values()).map((m) => {
      const totalScoreSum = m.cams.reduce((sum, c) => sum + c.scores.total, 0);
      const aggregateScore = m.cams.length > 0 ? Math.round((totalScoreSum / m.cams.length) * 10) / 10 : 0;

      // Sort CAMs within module by individual total score descending
      m.cams.sort((a, b) => b.scores.total - a.scores.total);

      return {
        mode: m.mode,
        modeLabel: MODE_LABELS[m.mode] || m.mode,
        camCount: m.cams.length,
        aggregateScore,
        cams: m.cams,
      };
    });

    modules.sort((a, b) => b.aggregateScore - a.aggregateScore);

    const totalCams = allCams.length;
    const totalScoreAll = modules.reduce((s, m) => s + m.cams.reduce((ss, c) => ss + c.scores.total, 0), 0);
    const overallAvgScore = totalCams > 0 ? Math.round((totalScoreAll / totalCams) * 10) / 10 : 0;

    return { modules, totalCams, overallAvgScore };
  }

  /**
   * Get full CAM handbook data with HTML content for print/handbook view.
   * Returns the same module grouping as getCamManualData but includes
   * the rendered HTML body of each CAM for inline display.
   */
  async getCamHandbookHtml(): Promise<{
    modules: Array<{
      mode: string;
      modeLabel: string;
      camCount: number;
      aggregateScore: number;
      cams: Array<{
        camId: string;
        code: string;
        title: string;
        category: string;
        scores: { uniqueness: number; value: number; demonstrable: number; defensible: number; total: number };
        status: string;
        htmlContent: string;
        updatedAt: string;
      }>;
    }>;
    totalCams: number;
    overallAvgScore: number;
  }> {
    let allCams: ParsedSop[] = [];
    try {
      allCams = parseAllSops(CAMS_DIR);
    } catch {
      // Directory may not exist
    }

    const MODE_LABELS: Record<string, string> = {
      EST: "Pricing & Estimation",
      FIN: "Financial Operations",
      OPS: "Project Operations",
      HR: "Workforce & Time Management",
      CLT: "Client Collaboration",
      CMP: "Compliance & Documentation",
      TECH: "Technology Infrastructure",
    };

    const moduleMap = new Map<string, {
      mode: string;
      cams: Array<{
        camId: string;
        code: string;
        title: string;
        category: string;
        scores: { uniqueness: number; value: number; demonstrable: number; defensible: number; total: number };
        status: string;
        htmlContent: string;
        updatedAt: string;
      }>;
    }>();

    for (const cam of allCams) {
      const fm = cam.frontmatter;
      const mode = (fm.mode || "UNKNOWN").toUpperCase();
      const scores = fm.scores || {};

      if (!moduleMap.has(mode)) {
        moduleMap.set(mode, { mode, cams: [] });
      }

      moduleMap.get(mode)!.cams.push({
        camId: fm.cam_id || cam.code,
        code: cam.code,
        title: fm.title,
        category: (fm.category || "UNKNOWN").toUpperCase(),
        scores: {
          uniqueness: scores.uniqueness ?? 0,
          value: scores.value ?? 0,
          demonstrable: scores.demonstrable ?? 0,
          defensible: scores.defensible ?? 0,
          total: scores.total ?? 0,
        },
        status: fm.status,
        htmlContent: cam.htmlBody,
        updatedAt: fm.updated || fm.created || "",
      });
    }

    const modules = Array.from(moduleMap.values()).map((m) => {
      const totalScoreSum = m.cams.reduce((sum, c) => sum + c.scores.total, 0);
      const aggregateScore = m.cams.length > 0 ? Math.round((totalScoreSum / m.cams.length) * 10) / 10 : 0;
      m.cams.sort((a, b) => b.scores.total - a.scores.total);

      return {
        mode: m.mode,
        modeLabel: MODE_LABELS[m.mode] || m.mode,
        camCount: m.cams.length,
        aggregateScore,
        cams: m.cams,
      };
    });

    modules.sort((a, b) => b.aggregateScore - a.aggregateScore);

    const totalCams = allCams.length;
    const totalScoreAll = modules.reduce((s, m) => s + m.cams.reduce((ss, c) => ss + c.scores.total, 0), 0);
    const overallAvgScore = totalCams > 0 ? Math.round((totalScoreAll / totalCams) * 10) / 10 : 0;

    return { modules, totalCams, overallAvgScore };
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

  // ───────────────────────────────────────────────
  // Elm Creek Prospectus Manual Data
  // ───────────────────────────────────────────────

  /**
   * Get Elm Creek Prospectus data grouped by chapter group for the document library card.
   * Reads the manual markdown and returns structured chapter data.
   */
  async getElmCreekManualData(): Promise<{
    chapterGroups: Array<{
      group: string;
      icon: string;
      description: string;
      chapters: Array<{
        id: string;
        title: string;
        revision: string;
        summary: string;
        keyMetric?: string;
      }>;
    }>;
    totalChapters: number;
    totalAppendices: number;
    projectSummary: {
      totalAcres: number;
      totalUnits: number;
      totalProjectCost: string;
      equityRaise: string;
      projectedIRR: string;
      timeline: string;
    };
  }> {
    // Static data derived from the Elm Creek prospectus manual
    const chapterGroups = [
      {
        group: "Investment Overview",
        icon: "🏗️",
        description: "The strategic case for Elm Creek — what it is, where it is, and why it matters.",
        chapters: [
          {
            id: "ch1",
            title: "Executive Summary",
            revision: "Rev 8",
            summary: "High-conviction investment in a scalable, mixed-use development on 174.61 acres in New Braunfels, TX ETJ. Phase 1: 128 garden-style multifamily units, 18–24% IRR.",
            keyMetric: "18–24% IRR (base 21%)",
          },
          {
            id: "ch2",
            title: "Project Overview & Opportunity",
            revision: "Rev 9",
            summary: "Two fully owned parcels totaling 174.61 acres with creek frontage, I-35 access, and ag exemptions. 128 units across 5 buildings in high-growth corridor.",
            keyMetric: "174.61 acres, 128 units",
          },
        ],
      },
      {
        group: "Financial & Execution",
        icon: "💰",
        description: "Capital structure, financial projections, build/refi timeline, and risk mitigation strategy.",
        chapters: [
          {
            id: "ch3",
            title: "Financial Projections & Use of Funds",
            revision: "Rev 7",
            summary: "$7.8M total cost under Nexus CMS pricing (~35% savings). Phased build/refi model generates ~$5.52M in cumulative profit over 32 months.",
            keyMetric: "$7.8M total / $4.2M equity",
          },
          {
            id: "ch4",
            title: "Timeline, Risks & Mitigation",
            revision: "Rev 7",
            summary: "32-month phased timeline with NCC real-time transparency. Five key risks mitigated through GMP contracts, PETL tracking, and conservative assumptions.",
            keyMetric: "32-month phased build/refi",
          },
        ],
      },
      {
        group: "Team & Terms",
        icon: "👥",
        description: "The vertically integrated team executing Elm Creek and the investment structure.",
        chapters: [
          {
            id: "ch5",
            title: "Development & Construction Team",
            revision: "Rev 7",
            summary: "Vertically integrated execution under Nexus Fortified Structures, LLC. NASCLA-certified in 18+ states. GC O&P waived. NCC software provides investor dashboards.",
            keyMetric: "250+ yrs experience, NASCLA 18+ states",
          },
          {
            id: "ch6",
            title: "Investment Opportunity & Terms",
            revision: "Rev 2",
            summary: "Seeking $500K–$3M per accredited investor. Mezzanine equity with 8% preferred return, promote after 12% IRR. De-risked via $3.67M land equity swap.",
            keyMetric: "$500K–$3M per investor, 8% pref",
          },
        ],
      },
      {
        group: "Appendices",
        icon: "📎",
        description: "Supporting documentation, market data, legal notes, and reference materials.",
        chapters: [
          {
            id: "appA",
            title: "Project Team & Advisors",
            revision: "Rev 7",
            summary: "Developer, GC, and environmental consultant confirmed. Architect, legal counsel, and financial advisor TBD.",
          },
          {
            id: "appB",
            title: "Market Analysis Summary",
            revision: "Rev 6",
            summary: "Regional population +2.8% annually. Avg rent $1,440/mo. High occupancy in workforce segment. Exit cap rate 6.5–7.2%.",
          },
          {
            id: "appC",
            title: "Legal & Regulatory Notes",
            revision: "Rev 5",
            summary: "Confidential, accredited investors only. Not an offer to sell securities.",
          },
          {
            id: "appD",
            title: "Supporting Documents",
            revision: "Rev 1",
            summary: "Nexus Fortified Structures LOI cover page and Comal AD property details (PID 72563).",
          },
        ],
      },
    ];

    return {
      chapterGroups,
      totalChapters: 6,
      totalAppendices: 4,
      projectSummary: {
        totalAcres: 174.61,
        totalUnits: 128,
        totalProjectCost: "$7.8M",
        equityRaise: "$4.2M",
        projectedIRR: "18–24%",
        timeline: "32 months",
      },
    };
  }
}
