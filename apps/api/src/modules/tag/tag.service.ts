import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

@Injectable()
export class TagService {
  constructor(private readonly prisma: PrismaService) {}

  async listTagsForCompanyAndType(companyId: string, entityType: string) {
    return this.prisma.tag.findMany({
      where: {
        companyId,
        active: true,
        assignments: {
          some: { entityType },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
  }

  async createOrUpdateTag(companyId: string, input: { id?: string; code: string; label: string; color?: string | null; sortOrder?: number; active?: boolean; createdByUserId?: string }) {
    if (input.id) {
      return this.prisma.tag.update({
        where: { id: input.id },
        data: {
          code: input.code,
          label: input.label,
          color: input.color ?? null,
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
        },
      });
    }

    return this.prisma.tag.create({
      data: {
        companyId,
        code: input.code,
        label: input.label,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
        active: input.active ?? true,
        createdByUserId: input.createdByUserId,
      },
    });
  }

  async softDeleteTag(companyId: string, id: string) {
    // Ensure tag belongs to the same company
    const tag = await this.prisma.tag.findFirst({ where: { id, companyId } });
    if (!tag) return null;

    return this.prisma.tag.update({
      where: { id },
      data: { active: false },
    });
  }

  async listTagsForEntity(companyId: string, entityType: string, entityId: string) {
    return this.prisma.tagAssignment.findMany({
      where: { companyId, entityType, entityId },
      include: { tag: true },
      orderBy: [{ tag: { sortOrder: "asc" } }, { tag: { label: "asc" } }],
    });
  }

  async listTagsForEntities(entityType: string, entityIds: string[]) {
    if (!entityIds.length) return [];

    return this.prisma.tagAssignment.findMany({
      where: {
        entityType,
        entityId: { in: entityIds },
      },
      include: { tag: true },
      orderBy: [{ tag: { sortOrder: "asc" } }, { tag: { label: "asc" } }],
    });
  }

  async setTagsForEntity(companyId: string, entityType: string, entityId: string, tagIds: string[], userId?: string) {
    // Remove existing assignments
    await this.prisma.tagAssignment.deleteMany({ where: { companyId, entityType, entityId } });

    if (!tagIds.length) return [];

    // Add new assignments
    await this.prisma.tagAssignment.createMany({
      data: tagIds.map(tagId => ({
        companyId,
        tagId,
        entityType,
        entityId,
        createdByUserId: userId,
      })),
    });

    return this.listTagsForEntity(companyId, entityType, entityId);
  }
}
