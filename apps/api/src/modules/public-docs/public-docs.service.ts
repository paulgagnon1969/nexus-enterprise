import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import * as crypto from "crypto";
import { CreateShareLinkDto, UpdatePublicSettingsDto } from "./dto/public-doc.dto";

@Injectable()
export class PublicDocsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateToken(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  private hashPasscode(passcode: string): string {
    return crypto.createHash("sha256").update(passcode).digest("hex");
  }

  // =========================================================================
  // Public Portal (No Auth Required)
  // =========================================================================

  /**
   * Get all public manuals and documents for the public portal
   */
  async getPublicPortal() {
    const [manuals, documents] = await Promise.all([
      // Get all public published manuals
      this.prisma.manual.findMany({
        where: {
          isPublic: true,
          status: "PUBLISHED",
          publicSlug: { not: null },
        },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          publicSlug: true,
          iconEmoji: true,
          coverImageUrl: true,
          currentVersion: true,
          publishedAt: true,
          _count: {
            select: {
              chapters: { where: { active: true } },
              documents: { where: { active: true } },
            },
          },
        },
        orderBy: { title: "asc" },
      }),
      // Get all public documents (standalone, not part of manuals)
      this.prisma.systemDocument.findMany({
        where: {
          isPublic: true,
          active: true,
          publicSlug: { not: null },
        },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          publicSlug: true,
          category: true,
          subcategory: true,
          currentVersion: {
            select: { versionNo: true, createdAt: true },
          },
        },
        orderBy: [{ category: "asc" }, { title: "asc" }],
      }),
    ]);

    return {
      manuals: manuals.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        description: m.description,
        slug: m.publicSlug,
        iconEmoji: m.iconEmoji,
        coverImageUrl: m.coverImageUrl,
        version: m.currentVersion,
        publishedAt: m.publishedAt,
        chapterCount: m._count.chapters,
        documentCount: m._count.documents,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        description: d.description,
        slug: d.publicSlug,
        category: d.category,
        subcategory: d.subcategory,
        versionNo: d.currentVersion?.versionNo,
        updatedAt: d.currentVersion?.createdAt,
      })),
    };
  }

  // =========================================================================
  // Public Document Access (No Auth Required)
  // =========================================================================

  async getPublicDocument(slug: string) {
    const doc = await this.prisma.systemDocument.findFirst({
      where: {
        publicSlug: slug,
        isPublic: true,
        active: true,
      },
      include: {
        currentVersion: {
          select: {
            id: true,
            versionNo: true,
            htmlContent: true,
            createdAt: true,
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    return {
      id: doc.id,
      code: doc.code,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      subcategory: doc.subcategory,
      versionNo: doc.currentVersion?.versionNo,
      htmlContent: doc.currentVersion?.htmlContent,
      updatedAt: doc.currentVersion?.createdAt || doc.updatedAt,
    };
  }

  async getPublicManual(slug: string) {
    const manual = await this.prisma.manual.findFirst({
      where: {
        publicSlug: slug,
        isPublic: true,
        status: "PUBLISHED",
      },
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
                    currentVersion: {
                      select: { versionNo: true, htmlContent: true },
                    },
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
                currentVersion: {
                  select: { versionNo: true, htmlContent: true },
                },
              },
            },
          },
        },
      },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return {
      id: manual.id,
      code: manual.code,
      title: manual.title,
      description: manual.description,
      version: manual.currentVersion,
      iconEmoji: manual.iconEmoji,
      coverImageUrl: manual.coverImageUrl,
      publishedAt: manual.publishedAt,
      chapters: manual.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        documents: ch.documents.map((d) => ({
          id: d.id,
          title: d.displayTitleOverride || d.systemDocument.title,
          code: d.systemDocument.code,
          versionNo: d.systemDocument.currentVersion?.versionNo,
          htmlContent: d.systemDocument.currentVersion?.htmlContent,
        })),
      })),
      rootDocuments: manual.documents.map((d) => ({
        id: d.id,
        title: d.displayTitleOverride || d.systemDocument.title,
        code: d.systemDocument.code,
        versionNo: d.systemDocument.currentVersion?.versionNo,
        htmlContent: d.systemDocument.currentVersion?.htmlContent,
      })),
    };
  }

  // =========================================================================
  // Share Link Access (Token Required)
  // =========================================================================

  async accessShareLink(token: string, passcode?: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { accessToken: token },
      include: {
        systemDocument: {
          include: {
            currentVersion: {
              select: { versionNo: true, htmlContent: true, createdAt: true },
            },
          },
        },
        manual: {
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
      },
    });

    if (!link || !link.isActive) {
      throw new NotFoundException("Share link not found or has been revoked");
    }

    // Check expiration
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new ForbiddenException("This share link has expired");
    }

    // Check passcode
    if (link.passcode) {
      if (!passcode) {
        throw new ForbiddenException("This link requires a passcode");
      }
      if (this.hashPasscode(passcode) !== link.passcode) {
        throw new ForbiddenException("Invalid passcode");
      }
    }

    // Update access stats
    await this.prisma.documentShareLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    // Return document or manual content
    if (link.systemDocument) {
      return {
        type: "document",
        id: link.systemDocument.id,
        code: link.systemDocument.code,
        title: link.systemDocument.title,
        description: link.systemDocument.description,
        category: link.systemDocument.category,
        versionNo: link.systemDocument.currentVersion?.versionNo,
        htmlContent: link.systemDocument.currentVersion?.htmlContent,
        updatedAt: link.systemDocument.currentVersion?.createdAt,
      };
    }

    if (link.manual) {
      return {
        type: "manual",
        id: link.manual.id,
        code: link.manual.code,
        title: link.manual.title,
        description: link.manual.description,
        version: link.manual.currentVersion,
        iconEmoji: link.manual.iconEmoji,
        coverImageUrl: link.manual.coverImageUrl,
        chapters: link.manual.chapters.map((ch) => ({
          id: ch.id,
          title: ch.title,
          description: ch.description,
          documents: ch.documents.map((d) => ({
            id: d.id,
            title: d.displayTitleOverride || d.systemDocument.title,
            code: d.systemDocument.code,
            versionNo: d.systemDocument.currentVersion?.versionNo,
            htmlContent: d.systemDocument.currentVersion?.htmlContent,
          })),
        })),
        rootDocuments: link.manual.documents.map((d) => ({
          id: d.id,
          title: d.displayTitleOverride || d.systemDocument.title,
          code: d.systemDocument.code,
          versionNo: d.systemDocument.currentVersion?.versionNo,
          htmlContent: d.systemDocument.currentVersion?.htmlContent,
        })),
      };
    }

    throw new NotFoundException("Link target not found");
  }

  // =========================================================================
  // Share Link Management (Auth Required - Super Admin)
  // =========================================================================

  async createDocumentShareLink(documentId: string, userId: string, dto: CreateShareLinkDto) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    return this.prisma.documentShareLink.create({
      data: {
        systemDocumentId: documentId,
        accessToken: this.generateToken(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        passcode: dto.passcode ? this.hashPasscode(dto.passcode) : null,
        createdByUserId: userId,
      },
    });
  }

  async createManualShareLink(manualId: string, userId: string, dto: CreateShareLinkDto) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return this.prisma.documentShareLink.create({
      data: {
        manualId,
        accessToken: this.generateToken(),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        passcode: dto.passcode ? this.hashPasscode(dto.passcode) : null,
        createdByUserId: userId,
      },
    });
  }

  async listDocumentShareLinks(documentId: string) {
    return this.prisma.documentShareLink.findMany({
      where: { systemDocumentId: documentId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async listManualShareLinks(manualId: string) {
    return this.prisma.documentShareLink.findMany({
      where: { manualId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeShareLink(linkId: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      throw new NotFoundException("Share link not found");
    }

    return this.prisma.documentShareLink.update({
      where: { id: linkId },
      data: { isActive: false },
    });
  }

  async deleteShareLink(linkId: string) {
    const link = await this.prisma.documentShareLink.findUnique({
      where: { id: linkId },
    });

    if (!link) {
      throw new NotFoundException("Share link not found");
    }

    await this.prisma.documentShareLink.delete({
      where: { id: linkId },
    });

    return { success: true };
  }

  // =========================================================================
  // Public Settings Management (Auth Required - Super Admin)
  // =========================================================================

  async updateDocumentPublicSettings(documentId: string, dto: UpdatePublicSettingsDto) {
    const doc = await this.prisma.systemDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    // Check slug uniqueness if changing
    if (dto.publicSlug && dto.publicSlug !== doc.publicSlug) {
      const existing = await this.prisma.systemDocument.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (existing) {
        throw new ConflictException(`Slug "${dto.publicSlug}" is already in use`);
      }
    }

    return this.prisma.systemDocument.update({
      where: { id: documentId },
      data: {
        publicSlug: dto.publicSlug === "" ? null : dto.publicSlug ?? doc.publicSlug,
        isPublic: dto.isPublic ?? doc.isPublic,
      },
      select: {
        id: true,
        code: true,
        title: true,
        publicSlug: true,
        isPublic: true,
      },
    });
  }

  async updateManualPublicSettings(manualId: string, dto: UpdatePublicSettingsDto) {
    const manual = await this.prisma.manual.findUnique({
      where: { id: manualId },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    // Check slug uniqueness if changing
    if (dto.publicSlug && dto.publicSlug !== manual.publicSlug) {
      const existing = await this.prisma.manual.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (existing) {
        throw new ConflictException(`Slug "${dto.publicSlug}" is already in use`);
      }
    }

    return this.prisma.manual.update({
      where: { id: manualId },
      data: {
        publicSlug: dto.publicSlug === "" ? null : dto.publicSlug ?? manual.publicSlug,
        isPublic: dto.isPublic ?? manual.isPublic,
      },
      select: {
        id: true,
        code: true,
        title: true,
        publicSlug: true,
        isPublic: true,
      },
    });
  }
}
