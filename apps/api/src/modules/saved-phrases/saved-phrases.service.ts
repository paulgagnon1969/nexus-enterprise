import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { SavedPhraseCategory } from "@prisma/client";

export interface CreateSavedPhraseDto {
  category?: SavedPhraseCategory;
  phrase: string;
  label?: string;
  isCompanyWide?: boolean; // If true, create as company-wide (admin only)
}

export interface UpdateSavedPhraseDto {
  category?: SavedPhraseCategory;
  phrase?: string;
  label?: string;
  sortOrder?: number;
}

@Injectable()
export class SavedPhrasesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List saved phrases for the current user.
   * Returns both user-specific phrases AND company-wide phrases.
   * Optionally filter by category.
   */
  async list(
    companyId: string,
    userId: string,
    category?: SavedPhraseCategory
  ) {
    const whereClause: any = {
      companyId,
      OR: [
        { userId }, // User's own phrases
        { userId: null }, // Company-wide phrases
      ],
    };

    if (category) {
      whereClause.category = category;
    }

    const phrases = await this.prisma.savedPhrase.findMany({
      where: whereClause,
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" },
      ],
    });

    return phrases.map((p) => ({
      id: p.id,
      category: p.category,
      phrase: p.phrase,
      label: p.label,
      sortOrder: p.sortOrder,
      isCompanyWide: p.userId === null,
      isOwn: p.userId === userId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * Create a new saved phrase.
   * By default, creates as user-specific. If isCompanyWide is true,
   * creates as company-wide (requires admin role - checked in controller).
   */
  async create(
    companyId: string,
    userId: string,
    dto: CreateSavedPhraseDto,
    isAdmin: boolean
  ) {
    // Only admins can create company-wide phrases
    if (dto.isCompanyWide && !isAdmin) {
      throw new ForbiddenException(
        "Only administrators can create company-wide phrases"
      );
    }

    const phrase = await this.prisma.savedPhrase.create({
      data: {
        companyId,
        userId: dto.isCompanyWide ? null : userId,
        category: dto.category ?? SavedPhraseCategory.GENERAL,
        phrase: dto.phrase,
        label: dto.label ?? null,
      },
    });

    return {
      id: phrase.id,
      category: phrase.category,
      phrase: phrase.phrase,
      label: phrase.label,
      sortOrder: phrase.sortOrder,
      isCompanyWide: phrase.userId === null,
      isOwn: phrase.userId === userId,
      createdAt: phrase.createdAt,
      updatedAt: phrase.updatedAt,
    };
  }

  /**
   * Update an existing saved phrase.
   * Users can only update their own phrases.
   * Admins can update any phrase in their company.
   */
  async update(
    companyId: string,
    userId: string,
    phraseId: string,
    dto: UpdateSavedPhraseDto,
    isAdmin: boolean
  ) {
    const existing = await this.prisma.savedPhrase.findFirst({
      where: { id: phraseId, companyId },
    });

    if (!existing) {
      throw new NotFoundException("Phrase not found");
    }

    // Check permissions: must be owner OR admin
    const isOwner = existing.userId === userId;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        "You can only update your own phrases"
      );
    }

    const updated = await this.prisma.savedPhrase.update({
      where: { id: phraseId },
      data: {
        category: dto.category,
        phrase: dto.phrase,
        label: dto.label,
        sortOrder: dto.sortOrder,
      },
    });

    return {
      id: updated.id,
      category: updated.category,
      phrase: updated.phrase,
      label: updated.label,
      sortOrder: updated.sortOrder,
      isCompanyWide: updated.userId === null,
      isOwn: updated.userId === userId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Delete a saved phrase.
   * Users can only delete their own phrases.
   * Admins can delete any phrase in their company.
   */
  async delete(
    companyId: string,
    userId: string,
    phraseId: string,
    isAdmin: boolean
  ) {
    const existing = await this.prisma.savedPhrase.findFirst({
      where: { id: phraseId, companyId },
    });

    if (!existing) {
      throw new NotFoundException("Phrase not found");
    }

    // Check permissions: must be owner OR admin
    const isOwner = existing.userId === userId;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        "You can only delete your own phrases"
      );
    }

    await this.prisma.savedPhrase.delete({
      where: { id: phraseId },
    });

    return { deleted: true, id: phraseId };
  }

  /**
   * Promote a user phrase to company-wide (admin only).
   * Creates a copy as company-wide, optionally keeping the original.
   */
  async promote(
    companyId: string,
    userId: string,
    phraseId: string,
    keepOriginal: boolean = false
  ) {
    const existing = await this.prisma.savedPhrase.findFirst({
      where: { id: phraseId, companyId },
    });

    if (!existing) {
      throw new NotFoundException("Phrase not found");
    }

    if (existing.userId === null) {
      throw new ForbiddenException("Phrase is already company-wide");
    }

    if (keepOriginal) {
      // Create a new company-wide copy
      const promoted = await this.prisma.savedPhrase.create({
        data: {
          companyId,
          userId: null, // Company-wide
          category: existing.category,
          phrase: existing.phrase,
          label: existing.label,
        },
      });

      return {
        id: promoted.id,
        category: promoted.category,
        phrase: promoted.phrase,
        label: promoted.label,
        sortOrder: promoted.sortOrder,
        isCompanyWide: true,
        isOwn: false,
        createdAt: promoted.createdAt,
        updatedAt: promoted.updatedAt,
        originalKept: true,
      };
    } else {
      // Convert existing to company-wide
      const promoted = await this.prisma.savedPhrase.update({
        where: { id: phraseId },
        data: { userId: null },
      });

      return {
        id: promoted.id,
        category: promoted.category,
        phrase: promoted.phrase,
        label: promoted.label,
        sortOrder: promoted.sortOrder,
        isCompanyWide: true,
        isOwn: false,
        createdAt: promoted.createdAt,
        updatedAt: promoted.updatedAt,
        originalKept: false,
      };
    }
  }
}
