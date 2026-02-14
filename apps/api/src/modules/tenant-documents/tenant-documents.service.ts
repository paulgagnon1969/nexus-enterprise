import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { TenantDocumentStatus } from "@prisma/client";
import {
  PublishDocumentDto,
  ArchiveDocumentDto,
  UpdateTenantDocumentDto,
  PublishManualDto,
} from "./dto/tenant-document.dto";

@Injectable()
export class TenantDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Document Inbox (Unreleased Documents)
  // =========================================================================

  async getDocumentInbox(companyId: string) {
    const documents = await this.prisma.tenantDocumentCopy.findMany({
      where: {
        companyId,
        status: TenantDocumentStatus.UNRELEASED,
      },
      include: {
        sourceSystemDocument: {
          select: {
            id: true,
            code: true,
            title: true,
            category: true,
            currentVersion: { select: { versionNo: true } },
          },
        },
        copiedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { copiedAt: "desc" },
    });

    const manuals = await this.prisma.tenantManualCopy.findMany({
      where: {
        companyId,
        status: TenantDocumentStatus.UNRELEASED,
      },
      include: {
        sourceManual: {
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            iconEmoji: true,
            currentVersion: true,
          },
        },
        receivedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { receivedAt: "desc" },
    });

    return { documents, manuals };
  }

  // =========================================================================
  // Published Documents
  // =========================================================================

  async getPublishedDocuments(companyId: string) {
    const documents = await this.prisma.tenantDocumentCopy.findMany({
      where: {
        companyId,
        status: TenantDocumentStatus.PUBLISHED,
      },
      include: {
        sourceSystemDocument: {
          select: {
            id: true,
            code: true,
            title: true,
            category: true,
            currentVersion: { select: { versionNo: true } },
          },
        },
        currentVersion: { select: { versionNo: true, createdAt: true } },
        publishedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { publishedAt: "desc" },
    });

    const manuals = await this.prisma.tenantManualCopy.findMany({
      where: {
        companyId,
        status: TenantDocumentStatus.PUBLISHED,
      },
      include: {
        sourceManual: {
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            iconEmoji: true,
            currentVersion: true,
          },
        },
        publishedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { publishedAt: "desc" },
    });

    return { documents, manuals };
  }

  // =========================================================================
  // Document Operations
  // =========================================================================

  async getDocument(companyId: string, documentId: string) {
    const document = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: documentId, companyId },
      include: {
        sourceSystemDocument: {
          select: {
            id: true,
            code: true,
            title: true,
            category: true,
            currentVersion: {
              select: { id: true, versionNo: true, htmlContent: true },
            },
          },
        },
        currentVersion: { select: { id: true, versionNo: true, htmlContent: true, createdAt: true } },
        copiedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        publishedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    return document;
  }

  async publishDocument(companyId: string, documentId: string, userId: string, dto: PublishDocumentDto) {
    const document = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: documentId, companyId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    if (document.status === TenantDocumentStatus.PUBLISHED) {
      throw new BadRequestException("Document is already published");
    }

    return this.prisma.tenantDocumentCopy.update({
      where: { id: documentId },
      data: {
        status: TenantDocumentStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: userId,
        internalNotes: dto.internalNotes ?? document.internalNotes,
      },
      include: {
        sourceSystemDocument: {
          select: { id: true, code: true, title: true },
        },
      },
    });
  }

  async archiveDocument(companyId: string, documentId: string, userId: string, dto: ArchiveDocumentDto) {
    const document = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: documentId, companyId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    return this.prisma.tenantDocumentCopy.update({
      where: { id: documentId },
      data: {
        status: TenantDocumentStatus.ARCHIVED,
        internalNotes: dto.reason
          ? `${document.internalNotes || ""}\n[Archived] ${dto.reason}`.trim()
          : document.internalNotes,
      },
    });
  }

  async updateDocument(companyId: string, documentId: string, dto: UpdateTenantDocumentDto) {
    const document = await this.prisma.tenantDocumentCopy.findFirst({
      where: { id: documentId, companyId },
    });

    if (!document) {
      throw new NotFoundException("Document not found");
    }

    return this.prisma.tenantDocumentCopy.update({
      where: { id: documentId },
      data: {
        title: dto.title ?? document.title,
        internalNotes: dto.internalNotes ?? document.internalNotes,
      },
    });
  }

  // =========================================================================
  // Manual Operations
  // =========================================================================

  async getManual(companyId: string, manualId: string) {
    const manual = await this.prisma.tenantManualCopy.findFirst({
      where: { id: manualId, companyId },
      include: {
        sourceManual: {
          include: {
            chapters: {
              where: { active: true },
              orderBy: { sortOrder: "asc" },
              include: {
                documents: {
                  where: { active: true },
                  orderBy: { sortOrder: "asc" },
                  include: {
                    systemDocument: {
                      select: {
                        id: true,
                        code: true,
                        title: true,
                        currentVersion: { select: { versionNo: true, htmlContent: true } },
                      },
                    },
                  },
                },
              },
            },
            documents: {
              where: { active: true, chapterId: null },
              orderBy: { sortOrder: "asc" },
              include: {
                systemDocument: {
                  select: {
                    id: true,
                    code: true,
                    title: true,
                    currentVersion: { select: { versionNo: true, htmlContent: true } },
                  },
                },
              },
            },
          },
        },
        receivedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        publishedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return manual;
  }

  async publishManual(companyId: string, manualId: string, userId: string, dto: PublishManualDto) {
    const manual = await this.prisma.tenantManualCopy.findFirst({
      where: { id: manualId, companyId },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    if (manual.status === TenantDocumentStatus.PUBLISHED) {
      throw new BadRequestException("Manual is already published");
    }

    return this.prisma.tenantManualCopy.update({
      where: { id: manualId },
      data: {
        status: TenantDocumentStatus.PUBLISHED,
        publishedAt: new Date(),
        publishedByUserId: userId,
        title: dto.title ?? manual.title,
        internalNotes: dto.internalNotes ?? manual.internalNotes,
      },
      include: {
        sourceManual: {
          select: { id: true, code: true, title: true, iconEmoji: true },
        },
      },
    });
  }

  async archiveManual(companyId: string, manualId: string) {
    const manual = await this.prisma.tenantManualCopy.findFirst({
      where: { id: manualId, companyId },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return this.prisma.tenantManualCopy.update({
      where: { id: manualId },
      data: { status: TenantDocumentStatus.ARCHIVED },
    });
  }

  // =========================================================================
  // Stats / Summary
  // =========================================================================

  async getInboxStats(companyId: string) {
    const [unreleasedDocs, unreleasedManuals, publishedDocs, publishedManuals, updatesPending] =
      await Promise.all([
        this.prisma.tenantDocumentCopy.count({
          where: { companyId, status: TenantDocumentStatus.UNRELEASED },
        }),
        this.prisma.tenantManualCopy.count({
          where: { companyId, status: TenantDocumentStatus.UNRELEASED },
        }),
        this.prisma.tenantDocumentCopy.count({
          where: { companyId, status: TenantDocumentStatus.PUBLISHED },
        }),
        this.prisma.tenantManualCopy.count({
          where: { companyId, status: TenantDocumentStatus.PUBLISHED },
        }),
        this.prisma.tenantDocumentCopy.count({
          where: { companyId, hasNewerSystemVersion: true },
        }),
      ]);

    return {
      unreleased: unreleasedDocs + unreleasedManuals,
      unreleasedDocuments: unreleasedDocs,
      unreleasedManuals,
      published: publishedDocs + publishedManuals,
      publishedDocuments: publishedDocs,
      publishedManuals,
      updatesPending,
    };
  }
}
