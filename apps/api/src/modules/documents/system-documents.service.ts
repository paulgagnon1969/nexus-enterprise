import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SystemDocumentPublicationTarget } from "@prisma/client";

@Injectable()
export class SystemDocumentsService {
  private readonly logger = new Logger(SystemDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * List all SystemDocuments with publication status
   */
  async listAll() {
    const docs = await this.prisma.systemDocument.findMany({
      where: { active: true },
      include: {
        currentVersion: true,
        publications: {
          where: { retractedAt: null },
          include: {
            targetCompany: { select: { id: true, name: true } },
          },
          orderBy: { publishedAt: "desc" },
        },
        _count: {
          select: {
            versions: true,
            tenantCopies: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return docs.map((doc) => ({
      id: doc.id,
      code: doc.code,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      subcategory: doc.subcategory,
      tags: doc.tags,
      currentVersion: doc.currentVersion
        ? {
            versionNo: doc.currentVersion.versionNo,
            notes: doc.currentVersion.notes,
            createdAt: doc.currentVersion.createdAt,
          }
        : null,
      publicationStatus: this.getPublicationStatus(doc.publications),
      publications: doc.publications.map((p) => ({
        id: p.id,
        targetType: p.targetType,
        targetCompany: p.targetCompany,
        publishedAt: p.publishedAt,
      })),
      versionCount: doc._count.versions,
      tenantCopyCount: doc._count.tenantCopies,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }

  /**
   * Determine publication status
   */
  private getPublicationStatus(
    publications: Array<{ targetType: SystemDocumentPublicationTarget; retractedAt: Date | null }>,
  ): "unpublished" | "published_all" | "published_some" {
    const active = publications.filter((p) => !p.retractedAt);
    if (active.length === 0) return "unpublished";
    if (active.some((p) => p.targetType === "ALL_TENANTS")) return "published_all";
    return "published_some";
  }

  /**
   * Get a single SystemDocument with full details
   */
  async getById(id: string) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id },
      include: {
        currentVersion: true,
        versions: {
          orderBy: { versionNo: "desc" },
          take: 10,
          select: {
            id: true,
            versionNo: true,
            notes: true,
            createdAt: true,
          },
        },
        publications: {
          where: { retractedAt: null },
          include: {
            targetCompany: { select: { id: true, name: true } },
            systemDocumentVersion: { select: { versionNo: true } },
          },
          orderBy: { publishedAt: "desc" },
        },
        tenantCopies: {
          select: {
            id: true,
            companyId: true,
            status: true,
            sourceVersionNo: true,
            hasNewerSystemVersion: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException(`SystemDocument not found: ${id}`);
    }

    return {
      id: doc.id,
      code: doc.code,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      subcategory: doc.subcategory,
      tags: doc.tags,
      isPublic: doc.isPublic,
      publicSlug: doc.publicSlug,
      currentVersion: doc.currentVersion
        ? {
            id: doc.currentVersion.id,
            versionNo: doc.currentVersion.versionNo,
            htmlContent: doc.currentVersion.htmlContent,
            notes: doc.currentVersion.notes,
            createdAt: doc.currentVersion.createdAt,
          }
        : null,
      versions: doc.versions,
      publications: doc.publications.map((p) => ({
        id: p.id,
        targetType: p.targetType,
        targetCompany: p.targetCompany,
        versionNo: p.systemDocumentVersion?.versionNo,
        publishedAt: p.publishedAt,
      })),
      tenantCopies: doc.tenantCopies,
      publicationStatus: this.getPublicationStatus(doc.publications),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  // =========================================================================
  // Global Document Search
  // =========================================================================

  /**
   * Strip HTML tags from content to produce searchable plain text.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Extract contextual snippets around each match occurrence.
   * Returns up to `maxSnippets` results, each with ~`radius` chars of context.
   */
  private extractSnippets(
    plainText: string,
    queryLower: string,
    maxSnippets = 3,
    radius = 120,
  ): Array<{ text: string; matchStart: number; matchEnd: number }> {
    const textLower = plainText.toLowerCase();
    const snippets: Array<{ text: string; matchStart: number; matchEnd: number }> = [];
    let searchFrom = 0;

    while (snippets.length < maxSnippets) {
      const idx = textLower.indexOf(queryLower, searchFrom);
      if (idx === -1) break;

      const start = Math.max(0, idx - radius);
      const end = Math.min(plainText.length, idx + queryLower.length + radius);
      const snippet = plainText.slice(start, end);

      // matchStart/matchEnd are relative to the snippet
      const matchStart = idx - start;
      const matchEnd = matchStart + queryLower.length;

      snippets.push({
        text: (start > 0 ? "…" : "") + snippet + (end < plainText.length ? "…" : ""),
        matchStart: start > 0 ? matchStart + 1 : matchStart, // offset for "…"
        matchEnd: start > 0 ? matchEnd + 1 : matchEnd,
      });

      // Advance past this match to avoid overlapping snippets
      searchFrom = idx + queryLower.length + radius;
    }

    return snippets;
  }

  /**
   * Full-text search across all SystemDocuments.
   * Searches title, description, code, tags, and htmlContent (stripped).
   * Results are grouped by category → document → snippets.
   */
  async searchDocuments(query: string) {
    if (!query || query.trim().length < 2) {
      return { groups: [], totalMatches: 0 };
    }

    const q = query.trim();
    const qLower = q.toLowerCase();

    const docs = await this.prisma.systemDocument.findMany({
      where: { active: true },
      include: {
        currentVersion: { select: { htmlContent: true, versionNo: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    interface DocMatch {
      id: string;
      code: string;
      title: string;
      description: string | null;
      category: string | null;
      snippets: Array<{ text: string; matchStart: number; matchEnd: number }>;
      matchCount: number;
    }

    const matches: DocMatch[] = [];

    for (const doc of docs) {
      const snippets: Array<{ text: string; matchStart: number; matchEnd: number }> = [];
      let matchCount = 0;

      // Check metadata fields
      const metaFields = [
        doc.title,
        doc.description ?? "",
        doc.code,
        ...(doc.tags ?? []),
      ];
      for (const field of metaFields) {
        if (field.toLowerCase().includes(qLower)) {
          matchCount++;
        }
      }

      // Check content
      if (doc.currentVersion?.htmlContent) {
        const plain = this.stripHtml(doc.currentVersion.htmlContent);
        const contentSnippets = this.extractSnippets(plain, qLower);
        snippets.push(...contentSnippets);
        matchCount += contentSnippets.length;
      }

      // Also add title/description as snippets if they match
      if (doc.title.toLowerCase().includes(qLower)) {
        const titleIdx = doc.title.toLowerCase().indexOf(qLower);
        snippets.unshift({
          text: doc.title,
          matchStart: titleIdx,
          matchEnd: titleIdx + qLower.length,
        });
      }

      if (matchCount > 0) {
        matches.push({
          id: doc.id,
          code: doc.code,
          title: doc.title,
          description: doc.description,
          category: doc.category,
          snippets: snippets.slice(0, 3), // max 3 snippets per doc
          matchCount,
        });
      }
    }

    // Group by category
    const groupMap = new Map<string, DocMatch[]>();
    for (const m of matches) {
      const cat = m.category || "Uncategorized";
      if (!groupMap.has(cat)) groupMap.set(cat, []);
      groupMap.get(cat)!.push(m);
    }

    // Sort: groups by total match count desc, docs within group by match count desc
    const groups = Array.from(groupMap.entries())
      .map(([category, documents]) => ({
        category,
        documents: documents.sort((a, b) => b.matchCount - a.matchCount),
        totalInGroup: documents.length,
      }))
      .sort((a, b) => b.totalInGroup - a.totalInGroup);

    return { groups, totalMatches: matches.length };
  }

  /**
   * Full-text search across documents published to a specific tenant.
   * Searches TenantDocumentCopy content and published SystemDocument content.
   */
  async searchTenantDocuments(companyId: string, query: string) {
    if (!query || query.trim().length < 2) {
      return { groups: [], totalMatches: 0 };
    }

    const q = query.trim();
    const qLower = q.toLowerCase();

    // Get tenant's own copies
    const copies = await this.prisma.tenantDocumentCopy.findMany({
      where: { companyId },
      include: {
        currentVersion: { select: { htmlContent: true, versionNo: true } },
        sourceSystemDocument: { select: { code: true, category: true } },
      },
    });

    // Get published system docs for this tenant
    const publications = await this.prisma.systemDocumentPublication.findMany({
      where: {
        retractedAt: null,
        OR: [
          { targetType: "ALL_TENANTS" },
          { targetCompanyId: companyId },
        ],
      },
      include: {
        systemDocument: {
          include: {
            currentVersion: { select: { htmlContent: true, versionNo: true } },
          },
        },
      },
    });

    interface DocMatch {
      id: string;
      code: string;
      title: string;
      source: "copy" | "published";
      category: string | null;
      snippets: Array<{ text: string; matchStart: number; matchEnd: number }>;
      matchCount: number;
    }

    const matches: DocMatch[] = [];
    const seenDocIds = new Set<string>();

    // Search tenant copies
    for (const copy of copies) {
      let matchCount = 0;
      const snippets: Array<{ text: string; matchStart: number; matchEnd: number }> = [];

      if (copy.title.toLowerCase().includes(qLower)) {
        matchCount++;
        const idx = copy.title.toLowerCase().indexOf(qLower);
        snippets.push({ text: copy.title, matchStart: idx, matchEnd: idx + qLower.length });
      }

      if (copy.currentVersion?.htmlContent) {
        const plain = this.stripHtml(copy.currentVersion.htmlContent);
        const contentSnippets = this.extractSnippets(plain, qLower);
        snippets.push(...contentSnippets);
        matchCount += contentSnippets.length;
      }

      if (matchCount > 0) {
        seenDocIds.add(copy.sourceSystemDocumentId);
        matches.push({
          id: copy.id,
          code: copy.sourceSystemDocument.code,
          title: copy.title,
          source: "copy",
          category: copy.sourceSystemDocument.category,
          snippets: snippets.slice(0, 3),
          matchCount,
        });
      }
    }

    // Search published system docs (skip those already found as copies)
    for (const pub of publications) {
      const doc = pub.systemDocument;
      if (seenDocIds.has(doc.id)) continue;

      let matchCount = 0;
      const snippets: Array<{ text: string; matchStart: number; matchEnd: number }> = [];

      if (doc.title.toLowerCase().includes(qLower)) {
        matchCount++;
        const idx = doc.title.toLowerCase().indexOf(qLower);
        snippets.push({ text: doc.title, matchStart: idx, matchEnd: idx + qLower.length });
      }

      if (doc.currentVersion?.htmlContent) {
        const plain = this.stripHtml(doc.currentVersion.htmlContent);
        const contentSnippets = this.extractSnippets(plain, qLower);
        snippets.push(...contentSnippets);
        matchCount += contentSnippets.length;
      }

      if (matchCount > 0) {
        seenDocIds.add(doc.id);
        matches.push({
          id: doc.id,
          code: doc.code,
          title: doc.title,
          source: "published",
          category: doc.category,
          snippets: snippets.slice(0, 3),
          matchCount,
        });
      }
    }

    // Group by category
    const groupMap = new Map<string, DocMatch[]>();
    for (const m of matches) {
      const cat = m.category || "Uncategorized";
      if (!groupMap.has(cat)) groupMap.set(cat, []);
      groupMap.get(cat)!.push(m);
    }

    const groups = Array.from(groupMap.entries())
      .map(([category, documents]) => ({
        category,
        documents: documents.sort((a, b) => b.matchCount - a.matchCount),
        totalInGroup: documents.length,
      }))
      .sort((a, b) => b.totalInGroup - a.totalInGroup);

    return { groups, totalMatches: matches.length };
  }

  /**
   * Update SystemDocument metadata
   */
  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      subcategory?: string;
      tags?: string[];
    },
    actor: AuthenticatedUser,
  ) {
    const doc = await this.prisma.systemDocument.findUnique({ where: { id } });
    if (!doc) {
      throw new NotFoundException(`SystemDocument not found: ${id}`);
    }

    const updated = await this.prisma.systemDocument.update({
      where: { id },
      data: {
        title: data.title ?? undefined,
        description: data.description ?? undefined,
        category: data.category ?? undefined,
        subcategory: data.subcategory ?? undefined,
        tags: data.tags ?? undefined,
      },
    });

    await this.audit.log(actor, "SYSTEM_DOCUMENT_UPDATED", {
      metadata: { systemDocumentId: id, changes: data },
    });

    return updated;
  }

  /**
   * Publish a document to tenants
   */
  async publish(
    systemDocumentId: string,
    targetType: "ALL_TENANTS" | "SINGLE_TENANT",
    targetCompanyId: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: systemDocumentId },
      include: { currentVersion: true },
    });

    if (!doc) {
      throw new NotFoundException(`SystemDocument not found: ${systemDocumentId}`);
    }

    if (!doc.currentVersion) {
      throw new BadRequestException("Document has no current version to publish");
    }

    if (targetType === "SINGLE_TENANT" && !targetCompanyId) {
      throw new BadRequestException("targetCompanyId required for SINGLE_TENANT publication");
    }

    // Check for existing active publication of same type
    const existingPub = await this.prisma.systemDocumentPublication.findFirst({
      where: {
        systemDocumentId,
        targetType,
        targetCompanyId: targetType === "SINGLE_TENANT" ? targetCompanyId : null,
        retractedAt: null,
      },
    });

    if (existingPub) {
      throw new BadRequestException(
        targetType === "ALL_TENANTS"
          ? "Document is already published to all tenants"
          : "Document is already published to this tenant",
      );
    }

    const publication = await this.prisma.systemDocumentPublication.create({
      data: {
        systemDocumentId,
        systemDocumentVersionId: doc.currentVersion.id,
        targetType,
        targetCompanyId: targetType === "SINGLE_TENANT" ? targetCompanyId : null,
        publishedByUserId: actor.userId,
      },
      include: {
        targetCompany: { select: { id: true, name: true } },
      },
    });

    await this.audit.log(actor, "SYSTEM_DOCUMENT_PUBLISHED", {
      metadata: {
        systemDocumentId,
        publicationId: publication.id,
        targetType,
        targetCompanyId,
        versionNo: doc.currentVersion.versionNo,
      },
    });

    this.logger.log(
      `Published SystemDocument ${doc.code} (v${doc.currentVersion.versionNo}) to ${targetType}${targetCompanyId ? ` (${targetCompanyId})` : ""}`,
    );

    return {
      success: true,
      publication: {
        id: publication.id,
        targetType: publication.targetType,
        targetCompany: publication.targetCompany,
        publishedAt: publication.publishedAt,
      },
    };
  }

  /**
   * Retract a publication
   */
  async unpublish(publicationId: string, actor: AuthenticatedUser) {
    const publication = await this.prisma.systemDocumentPublication.findUnique({
      where: { id: publicationId },
      include: { systemDocument: true },
    });

    if (!publication) {
      throw new NotFoundException(`Publication not found: ${publicationId}`);
    }

    if (publication.retractedAt) {
      throw new BadRequestException("Publication is already retracted");
    }

    await this.prisma.systemDocumentPublication.update({
      where: { id: publicationId },
      data: {
        retractedAt: new Date(),
        retractedByUserId: actor.userId,
      },
    });

    await this.audit.log(actor, "SYSTEM_DOCUMENT_UNPUBLISHED", {
      metadata: {
        systemDocumentId: publication.systemDocumentId,
        publicationId,
        documentCode: publication.systemDocument.code,
      },
    });

    this.logger.log(`Retracted publication ${publicationId} for ${publication.systemDocument.code}`);

    return { success: true };
  }
}
