import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { PnpCategory, PnpReviewStatus, Role } from "@prisma/client";
import { createHash } from "crypto";
import { generateDisclaimerHtml, generateCompactDisclaimer } from "./pnp-disclaimer.util";

@Injectable()
export class PnpService {
  constructor(private readonly prisma: PrismaService) {}

  private hashContent(html: string): string {
    return createHash("sha256").update(html || "").digest("hex");
  }

  // ===========================================================================
  // TENANT ENDPOINTS
  // ===========================================================================

  /**
   * List all PnP documents for the tenant.
   * Non-admin users only see APPROVED or MODIFIED_APPROVED documents.
   */
  async listTenantDocuments(actor: AuthenticatedUser, includeRejected = false) {
    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.OWNER;

    const whereClause: any = { companyId: actor.companyId };

    if (!isAdmin) {
      // Non-admins only see approved docs
      whereClause.reviewStatus = { in: [PnpReviewStatus.APPROVED, PnpReviewStatus.MODIFIED_APPROVED] };
      whereClause.active = true;
    } else if (!includeRejected) {
      whereClause.reviewStatus = { not: PnpReviewStatus.REJECTED };
    }

    return this.prisma.tenantPnpDocument.findMany({
      where: whereClause,
      orderBy: [{ category: "asc" }, { title: "asc" }],
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            versionLabel: true,
            createdAt: true,
          },
        },
        sourcePnpDocument: {
          select: {
            id: true,
            code: true,
            title: true,
            currentVersionId: true,
          },
        },
      },
    });
  }

  /**
   * List documents pending review (ADMIN/OWNER only).
   */
  async listPendingReview(actor: AuthenticatedUser) {
    this.requireAdminRole(actor);

    return this.prisma.tenantPnpDocument.findMany({
      where: {
        companyId: actor.companyId,
        reviewStatus: PnpReviewStatus.PENDING_REVIEW,
      },
      orderBy: [{ category: "asc" }, { title: "asc" }],
      include: {
        currentVersion: true,
        sourcePnpDocument: {
          select: { id: true, code: true, title: true },
        },
      },
    });
  }

  /**
   * Get a single tenant PnP document with full version history.
   */
  async getTenantDocument(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.prisma.tenantPnpDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNo: "desc" } },
        sourcePnpDocument: {
          include: {
            currentVersion: {
              select: { id: true, versionNo: true, versionLabel: true },
            },
          },
        },
        sourceVersion: {
          select: { id: true, versionNo: true, versionLabel: true },
        },
      },
    });

    if (!doc) throw new Error("Document not found");

    // Non-admins can't see pending/rejected docs
    const isAdmin = actor.role === Role.ADMIN || actor.role === Role.OWNER;
    if (!isAdmin && doc.reviewStatus !== PnpReviewStatus.APPROVED && doc.reviewStatus !== PnpReviewStatus.MODIFIED_APPROVED) {
      throw new Error("Document not found");
    }

    // Check if system version is newer (update available)
    const updateAvailable =
      doc.sourcePnpDocument &&
      doc.sourceVersion &&
      doc.sourcePnpDocument.currentVersion &&
      doc.sourcePnpDocument.currentVersion.versionNo > doc.sourceVersion.versionNo;

    return { ...doc, updateAvailable };
  }

  /**
   * Get rendered document with disclaimer injected.
   */
  async getRenderedDocument(actor: AuthenticatedUser, documentId: string) {
    const doc = await this.getTenantDocument(actor, documentId);

    if (!doc.currentVersion) {
      throw new Error("Document has no content");
    }

    // Get company name for disclaimer
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { name: true },
    });

    // Get reviewer name if available
    let reviewerName: string | null = null;
    if (doc.reviewedByUserId) {
      const reviewer = await this.prisma.user.findUnique({
        where: { id: doc.reviewedByUserId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (reviewer) {
        reviewerName = reviewer.firstName && reviewer.lastName
          ? `${reviewer.firstName} ${reviewer.lastName}`
          : reviewer.email;
      }
    }

    const disclaimerHtml = generateDisclaimerHtml({
      reviewStatus: doc.reviewStatus,
      companyName: company?.name || "Organization",
      reviewerName,
      reviewedAt: doc.reviewedAt,
      isFork: doc.isFork,
    });

    const compactDisclaimer = generateCompactDisclaimer({
      reviewStatus: doc.reviewStatus,
      companyName: company?.name || "Organization",
      reviewedAt: doc.reviewedAt,
    });

    return {
      id: doc.id,
      code: doc.code,
      title: doc.title,
      category: doc.category,
      reviewStatus: doc.reviewStatus,
      isFork: doc.isFork,
      renderedHtml: disclaimerHtml + doc.currentVersion.htmlContent,
      disclaimerHtml,
      compactDisclaimer,
      versionNo: doc.currentVersion.versionNo,
      versionLabel: doc.currentVersion.versionLabel,
    };
  }

  /**
   * Update/edit a tenant PnP document. Triggers fork if modifying system-seeded content.
   */
  async updateTenantDocument(
    actor: AuthenticatedUser,
    documentId: string,
    input: {
      title?: string;
      description?: string;
      htmlContent?: string;
      versionLabel?: string;
      versionNotes?: string;
    }
  ) {
    this.requireAdminRole(actor);

    const doc = await this.prisma.tenantPnpDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
      include: { currentVersion: true },
    });

    if (!doc) throw new Error("Document not found");

    const hasNewContent = typeof input.htmlContent === "string";

    return this.prisma.$transaction(async (tx) => {
      // Update metadata
      const updates: any = {};
      if (input.title) updates.title = input.title.trim();
      if (input.description !== undefined) updates.description = input.description?.trim() || null;

      // If this is a seeded doc and we're modifying content, mark as forked
      if (hasNewContent && doc.sourcePnpDocumentId && !doc.isFork) {
        updates.isFork = true;
        updates.forkedAt = new Date();
        updates.forkedByUserId = actor.userId;
      }

      if (Object.keys(updates).length > 0) {
        await tx.tenantPnpDocument.update({
          where: { id: documentId },
          data: updates,
        });
      }

      // Create new version if content changed
      if (hasNewContent) {
        const html = String(input.htmlContent ?? "");
        const agg = await tx.tenantPnpDocumentVersion.aggregate({
          where: { documentId },
          _max: { versionNo: true },
        });
        const nextVersionNo = (agg._max.versionNo ?? 0) + 1;

        const newVersion = await tx.tenantPnpDocumentVersion.create({
          data: {
            documentId,
            versionNo: nextVersionNo,
            versionLabel: input.versionLabel?.trim() || null,
            notes: input.versionNotes?.trim() || null,
            htmlContent: html,
            contentHash: this.hashContent(html),
            createdByUserId: actor.userId,
          },
        });

        await tx.tenantPnpDocument.update({
          where: { id: documentId },
          data: { currentVersionId: newVersion.id },
        });
      }

      return tx.tenantPnpDocument.findFirst({
        where: { id: documentId },
        include: {
          currentVersion: true,
          versions: { orderBy: { versionNo: "desc" }, take: 5 },
        },
      });
    });
  }

  /**
   * Approve a PnP document (ADMIN/OWNER only).
   */
  async approveDocument(actor: AuthenticatedUser, documentId: string, notes?: string) {
    this.requireAdminRole(actor);

    const doc = await this.prisma.tenantPnpDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new Error("Document not found");

    const newStatus = doc.isFork
      ? PnpReviewStatus.MODIFIED_APPROVED
      : PnpReviewStatus.APPROVED;

    return this.prisma.tenantPnpDocument.update({
      where: { id: documentId },
      data: {
        reviewStatus: newStatus,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNotes: notes?.trim() || null,
      },
      include: { currentVersion: true },
    });
  }

  /**
   * Reject a PnP document (ADMIN/OWNER only).
   */
  async rejectDocument(actor: AuthenticatedUser, documentId: string, notes?: string) {
    this.requireAdminRole(actor);

    const doc = await this.prisma.tenantPnpDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
    });

    if (!doc) throw new Error("Document not found");

    return this.prisma.tenantPnpDocument.update({
      where: { id: documentId },
      data: {
        reviewStatus: PnpReviewStatus.REJECTED,
        reviewedByUserId: actor.userId,
        reviewedAt: new Date(),
        reviewNotes: notes?.trim() || null,
        active: false,
      },
    });
  }

  /**
   * Revert a forked document back to the latest system version.
   */
  async revertToSystemVersion(actor: AuthenticatedUser, documentId: string) {
    this.requireAdminRole(actor);

    const doc = await this.prisma.tenantPnpDocument.findFirst({
      where: { id: documentId, companyId: actor.companyId },
      include: {
        sourcePnpDocument: {
          include: { currentVersion: true },
        },
      },
    });

    if (!doc) throw new Error("Document not found");
    if (!doc.sourcePnpDocument) throw new Error("Document is not from system library");
    if (!doc.sourcePnpDocument.currentVersion) throw new Error("System document has no content");

    const systemVersion = doc.sourcePnpDocument.currentVersion;

    return this.prisma.$transaction(async (tx) => {
      // Create new tenant version with system content
      const agg = await tx.tenantPnpDocumentVersion.aggregate({
        where: { documentId },
        _max: { versionNo: true },
      });
      const nextVersionNo = (agg._max.versionNo ?? 0) + 1;

      const newVersion = await tx.tenantPnpDocumentVersion.create({
        data: {
          documentId,
          versionNo: nextVersionNo,
          versionLabel: `Reverted to system v${systemVersion.versionNo}`,
          notes: "Reverted to NEXUS system version",
          htmlContent: systemVersion.htmlContent,
          contentHash: systemVersion.contentHash,
          createdByUserId: actor.userId,
        },
      });

      // Reset fork status and update source version reference
      return tx.tenantPnpDocument.update({
        where: { id: documentId },
        data: {
          currentVersionId: newVersion.id,
          sourceVersionId: systemVersion.id,
          isFork: false,
          forkedAt: null,
          forkedByUserId: null,
          reviewStatus: PnpReviewStatus.PENDING_REVIEW,
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNotes: null,
        },
        include: { currentVersion: true },
      });
    });
  }

  // ===========================================================================
  // SYSTEM ADMIN ENDPOINTS
  // ===========================================================================

  /**
   * List all system PnP documents (SUPER_ADMIN only).
   */
  async listSystemDocuments() {
    return this.prisma.pnpDocument.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            versionLabel: true,
            effectiveDate: true,
            createdAt: true,
          },
        },
        _count: { select: { tenantCopies: true } },
      },
    });
  }

  /**
   * Get a system PnP document with version history.
   */
  async getSystemDocument(documentId: string) {
    const doc = await this.prisma.pnpDocument.findUnique({
      where: { id: documentId },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNo: "desc" } },
        tenantCopies: {
          select: {
            id: true,
            companyId: true,
            isFork: true,
            reviewStatus: true,
            sourceVersionId: true,
          },
        },
      },
    });

    if (!doc) throw new Error("System document not found");
    return doc;
  }

  /**
   * Create a new system PnP document.
   */
  async createSystemDocument(
    actorUserId: string,
    input: {
      code: string;
      title: string;
      category: PnpCategory;
      description?: string;
      htmlContent: string;
      versionLabel?: string;
      releaseNotes?: string;
      effectiveDate?: Date;
    }
  ) {
    const code = (input.code || "").trim().toUpperCase();
    if (!code) throw new Error("Document code is required");
    if (!input.title?.trim()) throw new Error("Document title is required");
    if (!input.htmlContent) throw new Error("Document content is required");

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.pnpDocument.create({
        data: {
          code,
          title: input.title.trim(),
          category: input.category,
          description: input.description?.trim() || null,
          active: true,
          sortOrder: 0,
        },
      });

      const v1 = await tx.pnpDocumentVersion.create({
        data: {
          documentId: doc.id,
          versionNo: 1,
          versionLabel: input.versionLabel?.trim() || null,
          releaseNotes: input.releaseNotes?.trim() || null,
          htmlContent: input.htmlContent,
          contentHash: this.hashContent(input.htmlContent),
          effectiveDate: input.effectiveDate || null,
          createdByUserId: actorUserId,
        },
      });

      return tx.pnpDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: v1.id },
        include: { currentVersion: true },
      });
    });
  }

  /**
   * Update a system PnP document (creates new version if content changes).
   */
  async updateSystemDocument(
    actorUserId: string,
    documentId: string,
    input: {
      title?: string;
      description?: string;
      active?: boolean;
      sortOrder?: number;
      htmlContent?: string;
      versionLabel?: string;
      releaseNotes?: string;
      effectiveDate?: Date;
    }
  ) {
    const doc = await this.prisma.pnpDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) throw new Error("System document not found");

    const hasNewContent = typeof input.htmlContent === "string";

    return this.prisma.$transaction(async (tx) => {
      // Update metadata
      await tx.pnpDocument.update({
        where: { id: documentId },
        data: {
          title: input.title?.trim(),
          description: input.description === undefined ? undefined : input.description?.trim() || null,
          active: input.active,
          sortOrder: input.sortOrder,
        },
      });

      if (hasNewContent) {
        const html = String(input.htmlContent ?? "");
        const agg = await tx.pnpDocumentVersion.aggregate({
          where: { documentId },
          _max: { versionNo: true },
        });
        const nextVersionNo = (agg._max.versionNo ?? 0) + 1;

        const newVersion = await tx.pnpDocumentVersion.create({
          data: {
            documentId,
            versionNo: nextVersionNo,
            versionLabel: input.versionLabel?.trim() || null,
            releaseNotes: input.releaseNotes?.trim() || null,
            htmlContent: html,
            contentHash: this.hashContent(html),
            effectiveDate: input.effectiveDate || null,
            createdByUserId: actorUserId,
          },
        });

        await tx.pnpDocument.update({
          where: { id: documentId },
          data: { currentVersionId: newVersion.id },
        });
      }

      return tx.pnpDocument.findUnique({
        where: { id: documentId },
        include: {
          currentVersion: true,
          versions: { orderBy: { versionNo: "desc" }, take: 5 },
        },
      });
    });
  }

  /**
   * Seed PnP documents to a specific tenant.
   */
  async seedDocumentsToTenant(companyId: string, documentIds?: string[]) {
    // Get active system documents to seed
    const whereClause: any = { active: true };
    if (documentIds?.length) {
      whereClause.id = { in: documentIds };
    }

    const systemDocs = await this.prisma.pnpDocument.findMany({
      where: whereClause,
      include: { currentVersion: true },
    });

    const results = [];

    for (const sysDoc of systemDocs) {
      if (!sysDoc.currentVersion) continue;

      // Check if tenant already has this document
      const existing = await this.prisma.tenantPnpDocument.findUnique({
        where: {
          TenantPnpDocument_company_code_key: {
            companyId,
            code: sysDoc.code,
          },
        },
      });

      if (existing) {
        results.push({ code: sysDoc.code, status: "skipped", reason: "already exists" });
        continue;
      }

      // Create tenant copy
      const tenantDoc = await this.prisma.$transaction(async (tx) => {
        const doc = await tx.tenantPnpDocument.create({
          data: {
            companyId,
            code: sysDoc.code,
            title: sysDoc.title,
            category: sysDoc.category,
            description: sysDoc.description,
            active: true,
            sourcePnpDocumentId: sysDoc.id,
            sourceVersionId: sysDoc.currentVersion!.id,
            isFork: false,
            reviewStatus: PnpReviewStatus.PENDING_REVIEW,
          },
        });

        const v1 = await tx.tenantPnpDocumentVersion.create({
          data: {
            documentId: doc.id,
            versionNo: 1,
            versionLabel: `Seeded from NEXUS v${sysDoc.currentVersion!.versionNo}`,
            htmlContent: sysDoc.currentVersion!.htmlContent,
            contentHash: sysDoc.currentVersion!.contentHash,
          },
        });

        return tx.tenantPnpDocument.update({
          where: { id: doc.id },
          data: { currentVersionId: v1.id },
        });
      });

      results.push({ code: sysDoc.code, status: "seeded", tenantDocId: tenantDoc.id });
    }

    return results;
  }

  /**
   * Seed PnP documents to all active tenants.
   */
  async seedDocumentsToAllTenants(documentIds?: string[]) {
    const companies = await this.prisma.company.findMany({
      where: {
        kind: "ORGANIZATION",
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    const results = [];
    for (const company of companies) {
      const seedResult = await this.seedDocumentsToTenant(company.id, documentIds);
      results.push({
        companyId: company.id,
        companyName: company.name,
        documents: seedResult,
      });
    }

    return results;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private requireAdminRole(actor: AuthenticatedUser) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.OWNER) {
      throw new Error("This action requires ADMIN or OWNER role");
    }
  }
}
