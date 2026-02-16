import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { ManualVersionChangeType, TenantDocumentStatus, GlobalRole as PrismaGlobalRole } from "@prisma/client";
import { GlobalRole } from "../auth/auth.guards";
import {
  CreateManualDto,
  UpdateManualDto,
  PublishManualDto,
  CreateChapterDto,
  UpdateChapterDto,
  ReorderChaptersDto,
  AddDocumentToManualDto,
  UpdateManualDocumentDto,
  ReorderDocumentsDto,
} from "./dto/manual.dto";

@Injectable()
export class ManualsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // Manual CRUD
  // =========================================================================

  /**
   * Check if user's global role can access a NEXUS-internal manual.
   */
  private canAccessNexusInternal(userGlobalRole: GlobalRole, requiredRoles: PrismaGlobalRole[]): boolean {
    if (userGlobalRole === GlobalRole.SUPER_ADMIN) {
      return true; // SUPER_ADMIN can access everything
    }
    // Check if user's role is in the required roles array
    return requiredRoles.includes(userGlobalRole as unknown as PrismaGlobalRole);
  }

  async listManuals(options?: { status?: string; includeArchived?: boolean; userGlobalRole?: GlobalRole }) {
    const manuals = await this.prisma.manual.findMany({
      where: {
        ...(options?.status ? { status: options.status as any } : {}),
        ...(options?.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
        // Only show NEXUS System manuals (ownerCompanyId is null) in this endpoint
        ownerCompanyId: null,
      },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { chapters: true, documents: { where: { active: true } } } },
        targetTags: { include: { systemTag: { select: { id: true, code: true, label: true, color: true } } } },
      },
      orderBy: [{ status: "asc" }, { title: "asc" }],
    });

    // Filter out NEXUS-internal manuals the user can't access
    if (options?.userGlobalRole) {
      return manuals.filter((m) => {
        if (!m.isNexusInternal) return true;
        return this.canAccessNexusInternal(options.userGlobalRole!, m.requiredGlobalRoles);
      });
    }

    return manuals;
  }

  /**
   * Get manual with access check for NEXUS-internal manuals.
   */
  async getManualWithAccessCheck(id: string, userGlobalRole: GlobalRole) {
    const manual = await this.getManual(id);

    if (manual.isNexusInternal) {
      if (!this.canAccessNexusInternal(userGlobalRole, manual.requiredGlobalRoles)) {
        throw new ForbiddenException("You do not have access to this internal manual");
      }
    }

    return manual;
  }

  async getManual(id: string) {
    const manual = await this.prisma.manual.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        targetTags: { include: { systemTag: { select: { id: true, code: true, label: true, color: true } } } },
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
                    category: true,
                    currentVersion: { select: { versionNo: true } },
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
                category: true,
                currentVersion: { select: { versionNo: true } },
              },
            },
          },
        },
      },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return manual;
  }

  async createManual(userId: string, dto: CreateManualDto) {
    // Check for duplicate code
    const existing = await this.prisma.manual.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Manual with code "${dto.code}" already exists`);
    }

    // Check publicSlug uniqueness if provided
    if (dto.publicSlug) {
      const slugExists = await this.prisma.manual.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (slugExists) {
        throw new ConflictException(`Public slug "${dto.publicSlug}" already in use`);
      }
    }

    // Create manual with initial version
    const manual = await this.prisma.$transaction(async (tx) => {
      const newManual = await tx.manual.create({
        data: {
          code: dto.code,
          title: dto.title,
          description: dto.description,
          publicSlug: dto.publicSlug,
          isPublic: dto.isPublic ?? false,
          publishToAllTenants: dto.publishToAllTenants ?? false,
          coverImageUrl: dto.coverImageUrl,
          iconEmoji: dto.iconEmoji,
          createdByUserId: userId,
          currentVersion: 1,
          // Ownership and access control
          ownerCompanyId: dto.ownerCompanyId ?? null,
          isNexusInternal: dto.isNexusInternal ?? false,
          requiredGlobalRoles: (dto.requiredGlobalRoles as PrismaGlobalRole[]) ?? [],
        },
      });

      // Create initial version record
      await tx.manualVersion.create({
        data: {
          manualId: newManual.id,
          version: 1,
          changeType: ManualVersionChangeType.INITIAL,
          changeNotes: "Manual created",
          createdByUserId: userId,
          structureSnapshot: { chapters: [], documents: [] },
        },
      });

      // Create target tag associations
      if (dto.targetTagIds && dto.targetTagIds.length > 0) {
        await tx.manualTargetTag.createMany({
          data: dto.targetTagIds.map((tagId) => ({
            manualId: newManual.id,
            systemTagId: tagId,
          })),
        });
      }

      return newManual;
    });

    return this.getManual(manual.id);
  }

  async updateManual(id: string, dto: UpdateManualDto) {
    const manual = await this.prisma.manual.findUnique({ where: { id } });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    // Check publicSlug uniqueness if changing
    if (dto.publicSlug && dto.publicSlug !== manual.publicSlug) {
      const slugExists = await this.prisma.manual.findUnique({
        where: { publicSlug: dto.publicSlug },
      });
      if (slugExists) {
        throw new ConflictException(`Public slug "${dto.publicSlug}" already in use`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.manual.update({
        where: { id },
        data: {
          title: dto.title ?? manual.title,
          description: dto.description ?? manual.description,
          publicSlug: dto.publicSlug ?? manual.publicSlug,
          isPublic: dto.isPublic ?? manual.isPublic,
          publishToAllTenants: dto.publishToAllTenants ?? manual.publishToAllTenants,
          coverImageUrl: dto.coverImageUrl ?? manual.coverImageUrl,
          iconEmoji: dto.iconEmoji ?? manual.iconEmoji,
        },
      });

      // Update target tags if provided
      if (dto.targetTagIds !== undefined) {
        await tx.manualTargetTag.deleteMany({ where: { manualId: id } });
        if (dto.targetTagIds.length > 0) {
          await tx.manualTargetTag.createMany({
            data: dto.targetTagIds.map((tagId) => ({
              manualId: id,
              systemTagId: tagId,
            })),
          });
        }
      }
    });

    return this.getManual(id);
  }

  async archiveManual(id: string) {
    await this.prisma.manual.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return { success: true };
  }

  async publishManual(id: string, userId: string, dto: PublishManualDto) {
    const manual = await this.prisma.manual.findUnique({
      where: { id },
      include: {
        chapters: { where: { active: true }, include: { documents: { where: { active: true } } } },
        documents: { where: { active: true } },
      },
    });

    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    // Create structure snapshot
    const structureSnapshot = {
      chapters: manual.chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        sortOrder: ch.sortOrder,
        documents: ch.documents.map((d) => ({
          id: d.id,
          systemDocumentId: d.systemDocumentId,
          sortOrder: d.sortOrder,
        })),
      })),
      rootDocuments: manual.documents.map((d) => ({
        id: d.id,
        systemDocumentId: d.systemDocumentId,
        sortOrder: d.sortOrder,
      })),
    };

    const isFirstPublish = manual.status === "DRAFT";

    await this.prisma.$transaction(async (tx) => {
      const newVersion = manual.currentVersion + 1;

      await tx.manual.update({
        where: { id },
        data: {
          status: "PUBLISHED",
          currentVersion: newVersion,
          publishedAt: isFirstPublish ? new Date() : manual.publishedAt,
        },
      });

      await tx.manualVersion.create({
        data: {
          manualId: id,
          version: newVersion,
          changeType: ManualVersionChangeType.METADATA_UPDATED,
          changeNotes: dto.changeNotes || "Manual published",
          createdByUserId: userId,
          structureSnapshot,
        },
      });
    });

    // Distribute to tenants with UNRELEASED status
    await this.distributeManualToTenants(manual, userId);

    return this.getManual(id);
  }

  /**
   * Creates TenantManualCopy records for targeted companies.
   * Copies are created with UNRELEASED status for tenant admins to review and publish.
   */
  private async distributeManualToTenants(
    manual: { id: string; title: string; publishToAllTenants: boolean; currentVersion: number; targetTags?: any[] },
    userId: string
  ) {
    let companyIds: string[] = [];

    // Load targetTags if not included
    const targetTags = manual.targetTags ?? await this.prisma.manualTargetTag.findMany({
      where: { manualId: manual.id },
      select: { systemTagId: true },
    });

    if (manual.publishToAllTenants) {
      // Get all active companies (not deleted)
      const companies = await this.prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      companyIds = companies.map((c) => c.id);
    } else if (targetTags.length > 0) {
      // Get companies that have any of the target tags
      const tagIds = targetTags.map((t: any) => t.systemTagId);
      const companyTags = await this.prisma.companySystemTag.findMany({
        where: {
          systemTagId: { in: tagIds },
          company: { deletedAt: null },
        },
        select: { companyId: true },
      });
      companyIds = [...new Set(companyTags.map((ct) => ct.companyId))];
    }

    if (companyIds.length === 0) return;

    // Get existing copies to avoid duplicates
    const existingCopies = await this.prisma.tenantManualCopy.findMany({
      where: {
        sourceManualId: manual.id,
        companyId: { in: companyIds },
      },
      select: { companyId: true, id: true },
    });
    const existingCompanyIds = new Set(existingCopies.map((c) => c.companyId));

    // Create copies for companies that don't have one yet
    for (const companyId of companyIds) {
      if (existingCompanyIds.has(companyId)) {
        // Could update existing copies with newer version notification here
        continue;
      }

      // Create new tenant manual copy with UNRELEASED status
      await this.prisma.tenantManualCopy.create({
        data: {
          companyId,
          sourceManualId: manual.id,
          sourceManualVersion: manual.currentVersion,
          title: manual.title,
          receivedByUserId: userId,
          status: TenantDocumentStatus.UNRELEASED,
        },
      });
    }
  }

  async getVersionHistory(manualId: string) {
    const manual = await this.prisma.manual.findUnique({ where: { id: manualId } });
    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    return this.prisma.manualVersion.findMany({
      where: { manualId },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { version: "desc" },
    });
  }

  // =========================================================================
  // Chapter Management
  // =========================================================================

  async addChapter(manualId: string, userId: string, dto: CreateChapterDto) {
    const manual = await this.prisma.manual.findUnique({ where: { id: manualId } });
    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    // Get max sort order
    const maxOrder = await this.prisma.manualChapter.aggregate({
      where: { manualId, active: true },
      _max: { sortOrder: true },
    });

    const chapter = await this.prisma.$transaction(async (tx) => {
      const newChapter = await tx.manualChapter.create({
        data: {
          manualId,
          title: dto.title,
          description: dto.description,
          sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
        },
      });

      // Increment manual version
      await this.incrementManualVersion(tx, manualId, userId, ManualVersionChangeType.CHAPTER_ADDED, `Added chapter: ${dto.title}`);

      return newChapter;
    });

    return this.getManual(manualId);
  }

  async updateChapter(manualId: string, chapterId: string, dto: UpdateChapterDto) {
    const chapter = await this.prisma.manualChapter.findFirst({
      where: { id: chapterId, manualId, active: true },
    });

    if (!chapter) {
      throw new NotFoundException("Chapter not found");
    }

    await this.prisma.manualChapter.update({
      where: { id: chapterId },
      data: {
        title: dto.title ?? chapter.title,
        description: dto.description ?? chapter.description,
        sortOrder: dto.sortOrder ?? chapter.sortOrder,
      },
    });

    return this.getManual(manualId);
  }

  async removeChapter(manualId: string, chapterId: string, userId: string) {
    const chapter = await this.prisma.manualChapter.findFirst({
      where: { id: chapterId, manualId, active: true },
    });

    if (!chapter) {
      throw new NotFoundException("Chapter not found");
    }

    await this.prisma.$transaction(async (tx) => {
      // Soft delete chapter
      await tx.manualChapter.update({
        where: { id: chapterId },
        data: { active: false },
      });

      // Move any documents in this chapter to root (or mark inactive)
      await tx.manualDocument.updateMany({
        where: { chapterId, active: true },
        data: { chapterId: null },
      });

      // Increment manual version
      await this.incrementManualVersion(tx, manualId, userId, ManualVersionChangeType.CHAPTER_REMOVED, `Removed chapter: ${chapter.title}`);
    });

    return this.getManual(manualId);
  }

  async reorderChapters(manualId: string, userId: string, dto: ReorderChaptersDto) {
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.chapterIds.length; i++) {
        await tx.manualChapter.updateMany({
          where: { id: dto.chapterIds[i], manualId },
          data: { sortOrder: i },
        });
      }

      await this.incrementManualVersion(tx, manualId, userId, ManualVersionChangeType.CHAPTER_REORDERED, "Chapters reordered");
    });

    return this.getManual(manualId);
  }

  // =========================================================================
  // Document Management
  // =========================================================================

  async addDocument(manualId: string, userId: string, dto: AddDocumentToManualDto) {
    const manual = await this.prisma.manual.findUnique({ where: { id: manualId } });
    if (!manual) {
      throw new NotFoundException("Manual not found");
    }

    // Verify system document exists
    const systemDoc = await this.prisma.systemDocument.findUnique({
      where: { id: dto.systemDocumentId },
    });
    if (!systemDoc) {
      throw new NotFoundException("System document not found");
    }

    // Check if document already exists in this manual (active)
    const existing = await this.prisma.manualDocument.findFirst({
      where: { manualId, systemDocumentId: dto.systemDocumentId, active: true },
    });
    if (existing) {
      throw new ConflictException("Document already exists in this manual");
    }

    // Verify chapter if provided
    if (dto.chapterId) {
      const chapter = await this.prisma.manualChapter.findFirst({
        where: { id: dto.chapterId, manualId, active: true },
      });
      if (!chapter) {
        throw new NotFoundException("Chapter not found");
      }
    }

    // Get max sort order for target location
    const maxOrder = await this.prisma.manualDocument.aggregate({
      where: { manualId, chapterId: dto.chapterId ?? null, active: true },
      _max: { sortOrder: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.manualDocument.create({
        data: {
          manualId,
          chapterId: dto.chapterId,
          systemDocumentId: dto.systemDocumentId,
          displayTitleOverride: dto.displayTitleOverride,
          sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
          addedInManualVersion: manual.currentVersion,
        },
      });

      await this.incrementManualVersion(tx, manualId, userId, ManualVersionChangeType.DOCUMENT_ADDED, `Added document: ${systemDoc.title}`);
    });

    return this.getManual(manualId);
  }

  async updateDocument(manualId: string, docId: string, dto: UpdateManualDocumentDto) {
    const doc = await this.prisma.manualDocument.findFirst({
      where: { id: docId, manualId, active: true },
    });

    if (!doc) {
      throw new NotFoundException("Manual document not found");
    }

    // Verify chapter if changing
    if (dto.chapterId !== undefined && dto.chapterId !== null) {
      const chapter = await this.prisma.manualChapter.findFirst({
        where: { id: dto.chapterId, manualId, active: true },
      });
      if (!chapter) {
        throw new NotFoundException("Chapter not found");
      }
    }

    await this.prisma.manualDocument.update({
      where: { id: docId },
      data: {
        chapterId: dto.chapterId === null ? null : (dto.chapterId ?? doc.chapterId),
        displayTitleOverride: dto.displayTitleOverride === null ? null : (dto.displayTitleOverride ?? doc.displayTitleOverride),
        sortOrder: dto.sortOrder ?? doc.sortOrder,
        includeInPrint: dto.includeInPrint ?? doc.includeInPrint,
      },
    });

    return this.getManual(manualId);
  }

  /**
   * Toggle includeInPrint for a manual document.
   * Returns just the updated document for quick UI updates.
   */
  async toggleDocumentPrintInclusion(manualId: string, docId: string, includeInPrint: boolean) {
    const doc = await this.prisma.manualDocument.findFirst({
      where: { id: docId, manualId, active: true },
    });

    if (!doc) {
      throw new NotFoundException("Manual document not found");
    }

    const updated = await this.prisma.manualDocument.update({
      where: { id: docId },
      data: { includeInPrint },
      include: {
        systemDocument: {
          select: { id: true, title: true },
        },
      },
    });

    return updated;
  }

  async removeDocument(manualId: string, docId: string, userId: string) {
    const doc = await this.prisma.manualDocument.findFirst({
      where: { id: docId, manualId, active: true },
      include: { systemDocument: { select: { title: true } } },
    });

    if (!doc) {
      throw new NotFoundException("Manual document not found");
    }

    const manual = await this.prisma.manual.findUnique({ where: { id: manualId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.manualDocument.update({
        where: { id: docId },
        data: {
          active: false,
          removedInManualVersion: manual!.currentVersion + 1,
        },
      });

      await this.incrementManualVersion(tx, manualId, userId, ManualVersionChangeType.DOCUMENT_REMOVED, `Removed document: ${doc.systemDocument.title}`);
    });

    return this.getManual(manualId);
  }

  async reorderDocuments(manualId: string, userId: string, chapterId: string | null, dto: ReorderDocumentsDto) {
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.documentIds.length; i++) {
        await tx.manualDocument.updateMany({
          where: { id: dto.documentIds[i], manualId },
          data: { sortOrder: i },
        });
      }

      await this.incrementManualVersion(tx, manualId, userId, ManualVersionChangeType.DOCUMENT_REORDERED, "Documents reordered");
    });

    return this.getManual(manualId);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async incrementManualVersion(
    tx: any,
    manualId: string,
    userId: string,
    changeType: ManualVersionChangeType,
    changeNotes: string
  ) {
    const manual = await tx.manual.findUnique({ where: { id: manualId } });
    const newVersion = manual.currentVersion + 1;

    await tx.manual.update({
      where: { id: manualId },
      data: { currentVersion: newVersion },
    });

    await tx.manualVersion.create({
      data: {
        manualId,
        version: newVersion,
        changeType,
        changeNotes,
        createdByUserId: userId,
      },
    });
  }

  // =========================================================================
  // Available Documents (for adding to manual)
  // =========================================================================

  async getAvailableDocuments(manualId: string) {
    // Get documents already in this manual
    const existingDocs = await this.prisma.manualDocument.findMany({
      where: { manualId, active: true },
      select: { systemDocumentId: true },
    });
    const existingIds = new Set(existingDocs.map((d) => d.systemDocumentId));

    // Get all active system documents
    const allDocs = await this.prisma.systemDocument.findMany({
      where: { active: true },
      select: {
        id: true,
        code: true,
        title: true,
        category: true,
        subcategory: true,
        currentVersion: { select: { versionNo: true } },
      },
      orderBy: [{ category: "asc" }, { title: "asc" }],
    });

    return allDocs.map((doc) => ({
      ...doc,
      alreadyInManual: existingIds.has(doc.id),
    }));
  }
}
