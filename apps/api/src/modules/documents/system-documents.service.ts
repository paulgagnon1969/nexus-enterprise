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
