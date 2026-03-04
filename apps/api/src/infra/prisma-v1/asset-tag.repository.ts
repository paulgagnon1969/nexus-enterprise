import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const SEED_TAGS = [
  { label: "Fleet",    color: "#2563eb" },
  { label: "Personal", color: "#7c3aed" },
  { label: "Jobsite",  color: "#d97706" },
];

@Injectable()
export class AssetTagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureSeeded(companyId: string): Promise<void> {
    const count = await this.prisma.assetTag.count({ where: { companyId } });
    if (count > 0) return;

    await this.prisma.assetTag.createMany({
      data: SEED_TAGS.map((t) => ({ companyId, ...t })),
      skipDuplicates: true,
    });
  }

  async list(companyId: string) {
    await this.ensureSeeded(companyId);
    return this.prisma.assetTag.findMany({
      where: { companyId },
      orderBy: { label: "asc" },
    });
  }

  async create(companyId: string, input: { label: string; color?: string }) {
    return this.prisma.assetTag.create({
      data: {
        companyId,
        label: input.label.trim(),
        color: input.color ?? null,
      },
    });
  }

  async update(companyId: string, id: string, input: { label?: string; color?: string }) {
    const existing = await this.prisma.assetTag.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Tag not found");

    const data: any = {};
    if (input.label !== undefined) data.label = input.label.trim();
    if (input.color !== undefined) data.color = input.color;

    return this.prisma.assetTag.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    const existing = await this.prisma.assetTag.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException("Tag not found");
    // Cascade delete will remove assignments
    return this.prisma.assetTag.delete({ where: { id } });
  }

  /**
   * Replace all tag assignments for an asset with the given tag IDs.
   */
  async setTagsForAsset(companyId: string, assetId: string, tagIds: string[]) {
    // Verify asset exists
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, companyId } });
    if (!asset) throw new NotFoundException("Asset not found");

    // Delete existing assignments and create new ones in a transaction
    await this.prisma.$transaction([
      this.prisma.assetTagAssignment.deleteMany({ where: { assetId } }),
      ...(tagIds.length > 0
        ? [
            this.prisma.assetTagAssignment.createMany({
              data: tagIds.map((tagId) => ({ assetId, tagId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    // Return updated assignments with tag details
    return this.prisma.assetTagAssignment.findMany({
      where: { assetId },
      include: { tag: true },
    });
  }
}
