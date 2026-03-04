import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AssetAttachmentCategory } from "@prisma/client";

@Injectable()
export class AssetAttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForAsset(companyId: string, assetId: string) {
    return this.prisma.assetAttachment.findMany({
      where: { companyId, assetId },
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async getById(companyId: string, id: string) {
    return this.prisma.assetAttachment.findFirst({
      where: { id, companyId },
    });
  }

  async create(data: {
    companyId: string;
    assetId: string;
    fileName: string;
    fileType: string | null;
    fileSize: number;
    storageKey: string;
    category: AssetAttachmentCategory;
    notes?: string | null;
    uploadedByUserId?: string | null;
  }) {
    return this.prisma.assetAttachment.create({ data });
  }

  async delete(companyId: string, id: string) {
    // Verify ownership first
    const att = await this.prisma.assetAttachment.findFirst({
      where: { id, companyId },
    });
    if (!att) return null;
    await this.prisma.assetAttachment.delete({ where: { id } });
    return att;
  }

  async countForAsset(companyId: string, assetId: string) {
    return this.prisma.assetAttachment.count({ where: { companyId, assetId } });
  }
}
