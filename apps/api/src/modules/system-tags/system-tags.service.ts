import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  CreateSystemTagDto,
  UpdateSystemTagDto,
  AssignTagsToCompanyDto,
  BulkAssignTagDto,
} from "./dto/system-tag.dto";

@Injectable()
export class SystemTagsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // System Tag CRUD
  // =========================================================================

  async listTags(options?: { includeInactive?: boolean; category?: string }) {
    return this.prisma.systemTag.findMany({
      where: {
        ...(options?.includeInactive ? {} : { active: true }),
        ...(options?.category ? { category: options.category } : {}),
      },
      include: {
        _count: { select: { companyTags: true } },
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
    });
  }

  async getTag(id: string) {
    const tag = await this.prisma.systemTag.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        companyTags: {
          include: {
            company: { select: { id: true, name: true } },
          },
          orderBy: { assignedAt: "desc" },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException("System tag not found");
    }

    return tag;
  }

  async createTag(userId: string, dto: CreateSystemTagDto) {
    // Check for duplicate code
    const existing = await this.prisma.systemTag.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Tag with code "${dto.code}" already exists`);
    }

    return this.prisma.systemTag.create({
      data: {
        code: dto.code,
        label: dto.label,
        description: dto.description,
        category: dto.category,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 0,
        createdByUserId: userId,
      },
      include: {
        _count: { select: { companyTags: true } },
      },
    });
  }

  async updateTag(id: string, dto: UpdateSystemTagDto) {
    const tag = await this.prisma.systemTag.findUnique({ where: { id } });

    if (!tag) {
      throw new NotFoundException("System tag not found");
    }

    return this.prisma.systemTag.update({
      where: { id },
      data: {
        label: dto.label ?? tag.label,
        description: dto.description ?? tag.description,
        category: dto.category ?? tag.category,
        color: dto.color ?? tag.color,
        sortOrder: dto.sortOrder ?? tag.sortOrder,
        active: dto.active ?? tag.active,
      },
      include: {
        _count: { select: { companyTags: true } },
      },
    });
  }

  async deleteTag(id: string) {
    // Soft delete
    await this.prisma.systemTag.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }

  // =========================================================================
  // Company Tag Assignment
  // =========================================================================

  async getCompanyTags(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });

    if (!company) {
      throw new NotFoundException("Company not found");
    }

    const tags = await this.prisma.companySystemTag.findMany({
      where: { companyId },
      include: {
        systemTag: true,
        assignedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { assignedAt: "desc" },
    });

    return { company, tags };
  }

  async assignTagsToCompany(companyId: string, userId: string, dto: AssignTagsToCompanyDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });

    if (!company) {
      throw new NotFoundException("Company not found");
    }

    // Verify all tags exist
    const tags = await this.prisma.systemTag.findMany({
      where: { id: { in: dto.tagIds }, active: true },
    });

    if (tags.length !== dto.tagIds.length) {
      throw new NotFoundException("One or more tags not found or inactive");
    }

    // Get existing assignments to avoid duplicates
    const existing = await this.prisma.companySystemTag.findMany({
      where: { companyId, systemTagId: { in: dto.tagIds } },
      select: { systemTagId: true },
    });

    const existingTagIds = new Set(existing.map((e) => e.systemTagId));
    const newTagIds = dto.tagIds.filter((id) => !existingTagIds.has(id));

    // Create new assignments
    if (newTagIds.length > 0) {
      await this.prisma.companySystemTag.createMany({
        data: newTagIds.map((tagId) => ({
          companyId,
          systemTagId: tagId,
          assignedByUserId: userId,
        })),
      });
    }

    return this.getCompanyTags(companyId);
  }

  async removeTagFromCompany(companyId: string, tagId: string) {
    await this.prisma.companySystemTag.deleteMany({
      where: { companyId, systemTagId: tagId },
    });

    return this.getCompanyTags(companyId);
  }

  async bulkAssignTag(userId: string, dto: BulkAssignTagDto) {
    // Verify tag exists
    const tag = await this.prisma.systemTag.findUnique({
      where: { id: dto.tagId },
    });

    if (!tag || !tag.active) {
      throw new NotFoundException("Tag not found or inactive");
    }

    // Verify all companies exist
    const companies = await this.prisma.company.findMany({
      where: { id: { in: dto.companyIds } },
      select: { id: true },
    });

    if (companies.length !== dto.companyIds.length) {
      throw new NotFoundException("One or more companies not found");
    }

    // Get existing assignments
    const existing = await this.prisma.companySystemTag.findMany({
      where: { systemTagId: dto.tagId, companyId: { in: dto.companyIds } },
      select: { companyId: true },
    });

    const existingCompanyIds = new Set(existing.map((e) => e.companyId));
    const newCompanyIds = dto.companyIds.filter((id) => !existingCompanyIds.has(id));

    // Create new assignments
    if (newCompanyIds.length > 0) {
      await this.prisma.companySystemTag.createMany({
        data: newCompanyIds.map((companyId) => ({
          companyId,
          systemTagId: dto.tagId,
          assignedByUserId: userId,
        })),
      });
    }

    return {
      tagId: dto.tagId,
      assigned: newCompanyIds.length,
      alreadyAssigned: existingCompanyIds.size,
      total: dto.companyIds.length,
    };
  }

  // =========================================================================
  // Query Helpers
  // =========================================================================

  async getCompaniesByTag(tagId: string) {
    const tag = await this.prisma.systemTag.findUnique({
      where: { id: tagId },
      include: {
        companyTags: {
          include: {
            company: { select: { id: true, name: true, kind: true } },
          },
        },
      },
    });

    if (!tag) {
      throw new NotFoundException("Tag not found");
    }

    return {
      tag: { id: tag.id, code: tag.code, label: tag.label },
      companies: tag.companyTags.map((ct) => ct.company),
    };
  }

  async getTagCategories() {
    const tags = await this.prisma.systemTag.findMany({
      where: { active: true },
      select: { category: true },
      distinct: ["category"],
    });

    return tags
      .map((t) => t.category)
      .filter((c): c is string => c !== null)
      .sort();
  }
}
