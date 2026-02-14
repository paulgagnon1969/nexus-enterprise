import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { SystemDocumentPublicationTarget, TenantDocumentStatus } from "@prisma/client";
import * as crypto from "crypto";
import {
  CreateSystemDocumentDto,
  UpdateSystemDocumentDto,
  PublishSystemDocumentDto,
  CopyToOrgDto,
  UpdateTenantCopyDto,
} from "./dto/system-document.dto";

@Injectable()
export class SystemDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  // =========================================================================
  // SUPER_ADMIN: System Document CRUD
  // =========================================================================

  async listSystemDocuments(options?: { includeInactive?: boolean }) {
    return this.prisma.systemDocument.findMany({
      where: options?.includeInactive ? {} : { active: true },
      include: {
        currentVersion: true,
        _count: { select: { publications: true, tenantCopies: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getSystemDocument(id: string) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNo: "desc" }, take: 10 },
        publications: {
          where: { retractedAt: null },
          include: { targetCompany: { select: { id: true, name: true } } },
        },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!doc) {
      throw new NotFoundException("System document not found");
    }

    return doc;
  }

  async createSystemDocument(userId: string, dto: CreateSystemDocumentDto) {
    const contentHash = this.hashContent(dto.htmlContent);

    return this.prisma.$transaction(async (tx) => {
      // Create the document
      const doc = await tx.systemDocument.create({
        data: {
          code: dto.code,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          subcategory: dto.subcategory,
          tags: dto.tags || [],
          createdByUserId: userId,
        },
      });

      // Create the first version
      const version = await tx.systemDocumentVersion.create({
        data: {
          systemDocumentId: doc.id,
          versionNo: 1,
          htmlContent: dto.htmlContent,
          contentHash,
          notes: dto.notes || "Initial version",
          createdByUserId: userId,
        },
      });

      // Link current version
      await tx.systemDocument.update({
        where: { id: doc.id },
        data: { currentVersionId: version.id },
      });

      return this.getSystemDocument(doc.id);
    });
  }

  async updateSystemDocument(id: string, userId: string, dto: UpdateSystemDocumentDto) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id },
      include: { currentVersion: true },
    });

    if (!doc) {
      throw new NotFoundException("System document not found");
    }

    const contentHash = this.hashContent(dto.htmlContent);
    const currentHash = doc.currentVersion?.contentHash;

    // Only create new version if content changed
    const contentChanged = contentHash !== currentHash;

    return this.prisma.$transaction(async (tx) => {
      // Update document metadata
      await tx.systemDocument.update({
        where: { id },
        data: {
          title: dto.title ?? doc.title,
          description: dto.description ?? doc.description,
          category: dto.category ?? doc.category,
          subcategory: dto.subcategory ?? doc.subcategory,
          tags: dto.tags ?? doc.tags,
        },
      });

      if (contentChanged) {
        // Get next version number
        const lastVersion = await tx.systemDocumentVersion.findFirst({
          where: { systemDocumentId: id },
          orderBy: { versionNo: "desc" },
        });
        const nextVersionNo = (lastVersion?.versionNo ?? 0) + 1;

        // Create new version
        const version = await tx.systemDocumentVersion.create({
          data: {
            systemDocumentId: id,
            versionNo: nextVersionNo,
            htmlContent: dto.htmlContent,
            contentHash,
            notes: dto.notes || `Version ${nextVersionNo}`,
            createdByUserId: userId,
          },
        });

        // Update current version pointer
        await tx.systemDocument.update({
          where: { id },
          data: { currentVersionId: version.id },
        });

        // Mark tenant copies as having newer version available
        await tx.tenantDocumentCopy.updateMany({
          where: { sourceSystemDocumentId: id },
          data: { hasNewerSystemVersion: true },
        });
      }

      return this.getSystemDocument(id);
    });
  }

  async deleteSystemDocument(id: string) {
    // Soft delete
    await this.prisma.systemDocument.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }

  // =========================================================================
  // SUPER_ADMIN: Publication Management
  // =========================================================================

  async publishDocument(id: string, userId: string, dto: PublishSystemDocumentDto) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id },
      include: { currentVersion: true },
    });

    if (!doc || !doc.currentVersion) {
      throw new NotFoundException("System document not found or has no content");
    }

    if (dto.targetType === SystemDocumentPublicationTarget.SINGLE_TENANT && !dto.targetCompanyId) {
      throw new BadRequestException("targetCompanyId is required for SINGLE_TENANT publication");
    }

    // Check for existing active publication with same target
    const existing = await this.prisma.systemDocumentPublication.findFirst({
      where: {
        systemDocumentId: id,
        targetType: dto.targetType,
        targetCompanyId: dto.targetCompanyId ?? null,
        retractedAt: null,
      },
    });

    if (existing) {
      // Update existing publication to point to new version
      return this.prisma.systemDocumentPublication.update({
        where: { id: existing.id },
        data: {
          systemDocumentVersionId: doc.currentVersion.id,
          publishedAt: new Date(),
          publishedByUserId: userId,
        },
        include: { targetCompany: { select: { id: true, name: true } } },
      });
    }

    // Create new publication
    const publication = await this.prisma.systemDocumentPublication.create({
      data: {
        systemDocumentId: id,
        systemDocumentVersionId: doc.currentVersion.id,
        targetType: dto.targetType,
        targetCompanyId: dto.targetCompanyId,
        publishedByUserId: userId,
      },
      include: { targetCompany: { select: { id: true, name: true } } },
    });

    // Distribute to tenants with UNRELEASED status
    await this.distributeDocumentToTenants(
      id,
      { title: doc.title, currentVersion: doc.currentVersion },
      userId,
      dto.targetType,
      dto.targetCompanyId
    );

    return publication;
  }

  /**
   * Creates TenantDocumentCopy records for targeted companies.
   * Copies are created with UNRELEASED status for tenant admins to review and publish.
   */
  private async distributeDocumentToTenants(
    documentId: string,
    doc: { title: string; currentVersion: { id: string; versionNo: number; htmlContent: string } },
    userId: string,
    targetType: SystemDocumentPublicationTarget,
    targetCompanyId?: string | null
  ) {
    // Determine target companies
    let companyIds: string[] = [];

    if (targetType === SystemDocumentPublicationTarget.SINGLE_TENANT && targetCompanyId) {
      companyIds = [targetCompanyId];
    } else if (targetType === SystemDocumentPublicationTarget.ALL_TENANTS) {
      // Get all active companies (not deleted)
      const companies = await this.prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      companyIds = companies.map((c) => c.id);
    }

    if (companyIds.length === 0) return;

    // Get existing copies to avoid duplicates
    const existingCopies = await this.prisma.tenantDocumentCopy.findMany({
      where: {
        sourceSystemDocumentId: documentId,
        companyId: { in: companyIds },
      },
      select: { companyId: true },
    });
    const existingCompanyIds = new Set(existingCopies.map((c) => c.companyId));

    // Create copies for companies that don't have one yet
    const contentHash = this.hashContent(doc.currentVersion.htmlContent);

    for (const companyId of companyIds) {
      if (existingCompanyIds.has(companyId)) {
        // Company already has a copy - mark as having newer version if needed
        await this.prisma.tenantDocumentCopy.updateMany({
          where: { sourceSystemDocumentId: documentId, companyId },
          data: { hasNewerSystemVersion: true },
        });
        continue;
      }

      // Create new tenant copy with UNRELEASED status
      await this.prisma.$transaction(async (tx) => {
        const copy = await tx.tenantDocumentCopy.create({
          data: {
            companyId,
            sourceSystemDocumentId: documentId,
            sourceVersionNo: doc.currentVersion.versionNo,
            title: doc.title,
            copiedByUserId: userId,
            status: TenantDocumentStatus.UNRELEASED,
          },
        });

        // Create first version
        const version = await tx.tenantDocumentCopyVersion.create({
          data: {
            tenantDocumentCopyId: copy.id,
            versionNo: 1,
            htmlContent: doc.currentVersion.htmlContent,
            contentHash,
            notes: `Received from NEXUS v${doc.currentVersion.versionNo}`,
            createdByUserId: userId,
          },
        });

        // Link current version
        await tx.tenantDocumentCopy.update({
          where: { id: copy.id },
          data: { currentVersionId: version.id },
        });
      });
    }
  }

  async retractPublication(publicationId: string, userId: string) {
    return this.prisma.systemDocumentPublication.update({
      where: { id: publicationId },
      data: {
        retractedAt: new Date(),
        retractedByUserId: userId,
      },
    });
  }

  async getPublications(documentId: string) {
    return this.prisma.systemDocumentPublication.findMany({
      where: { systemDocumentId: documentId },
      include: {
        targetCompany: { select: { id: true, name: true } },
        systemDocumentVersion: { select: { versionNo: true, createdAt: true } },
        publishedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { publishedAt: "desc" },
    });
  }

  // =========================================================================
  // TENANT: View Published Documents
  // =========================================================================

  async listPublishedForTenant(companyId: string) {
    // Get documents published to ALL_TENANTS or specifically to this company
    const publications = await this.prisma.systemDocumentPublication.findMany({
      where: {
        retractedAt: null,
        OR: [
          { targetType: SystemDocumentPublicationTarget.ALL_TENANTS },
          { targetType: SystemDocumentPublicationTarget.SINGLE_TENANT, targetCompanyId: companyId },
        ],
      },
      include: {
        systemDocument: {
          include: { currentVersion: true },
        },
        systemDocumentVersion: true,
      },
      orderBy: { publishedAt: "desc" },
    });

    // Check which ones have been copied
    const docIds = publications.map((p) => p.systemDocumentId);
    const copies = await this.prisma.tenantDocumentCopy.findMany({
      where: {
        companyId,
        sourceSystemDocumentId: { in: docIds },
      },
      select: { sourceSystemDocumentId: true, id: true },
    });

    const copyMap = new Map(copies.map((c) => [c.sourceSystemDocumentId, c.id]));

    return publications.map((pub) => ({
      id: pub.systemDocument.id,
      code: pub.systemDocument.code,
      title: pub.systemDocument.title,
      description: pub.systemDocument.description,
      category: pub.systemDocument.category,
      subcategory: pub.systemDocument.subcategory,
      publishedAt: pub.publishedAt,
      publishedVersionNo: pub.systemDocumentVersion.versionNo,
      htmlContent: pub.systemDocumentVersion.htmlContent,
      tenantCopyId: copyMap.get(pub.systemDocumentId) || null,
    }));
  }

  async getPublishedDocument(companyId: string, documentId: string) {
    const publication = await this.prisma.systemDocumentPublication.findFirst({
      where: {
        systemDocumentId: documentId,
        retractedAt: null,
        OR: [
          { targetType: SystemDocumentPublicationTarget.ALL_TENANTS },
          { targetType: SystemDocumentPublicationTarget.SINGLE_TENANT, targetCompanyId: companyId },
        ],
      },
      include: {
        systemDocument: true,
        systemDocumentVersion: true,
      },
    });

    if (!publication) {
      throw new NotFoundException("Document not found or not published to your organization");
    }

    return {
      id: publication.systemDocument.id,
      code: publication.systemDocument.code,
      title: publication.systemDocument.title,
      description: publication.systemDocument.description,
      category: publication.systemDocument.category,
      htmlContent: publication.systemDocumentVersion.htmlContent,
      publishedVersionNo: publication.systemDocumentVersion.versionNo,
    };
  }

  // =========================================================================
  // TENANT: Copy to Org
  // =========================================================================

  async copyToOrg(companyId: string, userId: string, systemDocumentId: string, dto: CopyToOrgDto) {
    // Verify document is published to this tenant
    const publication = await this.prisma.systemDocumentPublication.findFirst({
      where: {
        systemDocumentId,
        retractedAt: null,
        OR: [
          { targetType: SystemDocumentPublicationTarget.ALL_TENANTS },
          { targetType: SystemDocumentPublicationTarget.SINGLE_TENANT, targetCompanyId: companyId },
        ],
      },
      include: {
        systemDocument: true,
        systemDocumentVersion: true,
      },
    });

    if (!publication) {
      throw new ForbiddenException("Document not available for your organization");
    }

    // Check if already copied
    const existing = await this.prisma.tenantDocumentCopy.findFirst({
      where: { companyId, sourceSystemDocumentId: systemDocumentId },
    });

    if (existing) {
      throw new BadRequestException("Document already copied to your organization");
    }

    const contentHash = this.hashContent(publication.systemDocumentVersion.htmlContent);

    return this.prisma.$transaction(async (tx) => {
      // Create tenant copy
      const copy = await tx.tenantDocumentCopy.create({
        data: {
          companyId,
          sourceSystemDocumentId: systemDocumentId,
          sourceVersionNo: publication.systemDocumentVersion.versionNo,
          title: dto.title || publication.systemDocument.title,
          copiedByUserId: userId,
        },
      });

      // Create first version (copy of system doc content)
      const version = await tx.tenantDocumentCopyVersion.create({
        data: {
          tenantDocumentCopyId: copy.id,
          versionNo: 1,
          htmlContent: publication.systemDocumentVersion.htmlContent,
          contentHash,
          notes: `Copied from system document v${publication.systemDocumentVersion.versionNo}`,
          createdByUserId: userId,
        },
      });

      // Link current version
      await tx.tenantDocumentCopy.update({
        where: { id: copy.id },
        data: { currentVersionId: version.id },
      });

      return tx.tenantDocumentCopy.findUnique({
        where: { id: copy.id },
        include: { currentVersion: true, sourceSystemDocument: true },
      });
    });
  }

  // =========================================================================
  // TENANT: Manage Copies
  // =========================================================================

  async listTenantCopies(companyId: string) {
    return this.prisma.tenantDocumentCopy.findMany({
      where: { companyId },
      include: {
        currentVersion: true,
        sourceSystemDocument: { select: { id: true, code: true, title: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getTenantCopy(companyId: string, copyId: string) {
    const copy = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: copyId, companyId },
      include: {
        currentVersion: true,
        versions: { orderBy: { versionNo: "desc" }, take: 5 },
        sourceSystemDocument: {
          include: { currentVersion: { select: { versionNo: true } } },
        },
        copiedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!copy) {
      throw new NotFoundException("Document copy not found");
    }

    return copy;
  }

  async updateTenantCopy(companyId: string, copyId: string, userId: string, dto: UpdateTenantCopyDto) {
    const copy = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: copyId, companyId },
      include: { currentVersion: true },
    });

    if (!copy) {
      throw new NotFoundException("Document copy not found");
    }

    const contentHash = this.hashContent(dto.htmlContent);
    const contentChanged = contentHash !== copy.currentVersion?.contentHash;

    return this.prisma.$transaction(async (tx) => {
      // Update metadata
      if (dto.title) {
        await tx.tenantDocumentCopy.update({
          where: { id: copyId },
          data: { title: dto.title },
        });
      }

      if (contentChanged) {
        // Get next version number
        const lastVersion = await tx.tenantDocumentCopyVersion.findFirst({
          where: { tenantDocumentCopyId: copyId },
          orderBy: { versionNo: "desc" },
        });
        const nextVersionNo = (lastVersion?.versionNo ?? 0) + 1;

        // Create new version
        const version = await tx.tenantDocumentCopyVersion.create({
          data: {
            tenantDocumentCopyId: copyId,
            versionNo: nextVersionNo,
            htmlContent: dto.htmlContent,
            contentHash,
            notes: dto.notes || `Version ${nextVersionNo}`,
            createdByUserId: userId,
          },
        });

        // Update current version pointer
        await tx.tenantDocumentCopy.update({
          where: { id: copyId },
          data: { currentVersionId: version.id },
        });
      }

      return this.getTenantCopy(companyId, copyId);
    });
  }

  async rollbackTenantCopy(companyId: string, copyId: string, targetVersionNo?: number) {
    const copy = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: copyId, companyId },
      include: {
        versions: { orderBy: { versionNo: "desc" } },
        currentVersion: true,
      },
    });

    if (!copy) {
      throw new NotFoundException("Document copy not found");
    }

    const currentVersionNo = copy.currentVersion?.versionNo ?? 1;

    // Default to previous version if not specified
    const rollbackTo = targetVersionNo ?? currentVersionNo - 1;

    if (rollbackTo < 1) {
      throw new BadRequestException("Cannot rollback: no previous version available");
    }

    const targetVersion = copy.versions.find((v) => v.versionNo === rollbackTo);
    if (!targetVersion) {
      throw new NotFoundException(`Version ${rollbackTo} not found`);
    }

    await this.prisma.tenantDocumentCopy.update({
      where: { id: copyId },
      data: { currentVersionId: targetVersion.id },
    });

    return this.getTenantCopy(companyId, copyId);
  }

  async refreshFromSystemDocument(companyId: string, copyId: string, userId: string) {
    const copy = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: copyId, companyId },
      include: { sourceSystemDocument: { include: { currentVersion: true } } },
    });

    if (!copy || !copy.sourceSystemDocument.currentVersion) {
      throw new NotFoundException("Document copy or source not found");
    }

    const latestContent = copy.sourceSystemDocument.currentVersion.htmlContent;
    const latestVersionNo = copy.sourceSystemDocument.currentVersion.versionNo;

    // Create new version from latest system doc
    const result = await this.updateTenantCopy(companyId, copyId, userId, {
      htmlContent: latestContent,
      notes: `Refreshed from system document v${latestVersionNo}`,
    });

    // Clear the update flag
    await this.prisma.tenantDocumentCopy.update({
      where: { id: copyId },
      data: {
        hasNewerSystemVersion: false,
        sourceVersionNo: latestVersionNo,
      },
    });

    return result;
  }
}
