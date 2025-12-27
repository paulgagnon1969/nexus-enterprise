import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AssetType, BillingMode, UsageStatus } from "@prisma/client";

export interface CreateAssetInput {
  companyId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  assetType: AssetType;
  baseUnit?: string | null;
  baseRate?: string | null; // Decimal as string to avoid JS float issues
}

@Injectable()
export class AssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAssetsForCompany(companyId: string) {
    return this.prisma.asset.findMany({
      where: { companyId },
      orderBy: { name: "asc" }
    });
  }

  async createAsset(input: CreateAssetInput) {
    const { companyId, name, code, description, assetType, baseUnit, baseRate } =
      input;

    return this.prisma.asset.create({
      data: {
        companyId,
        name,
        code: code ?? null,
        description: description ?? null,
        assetType,
        baseUnit: baseUnit ?? null,
        baseRate: baseRate ?? null
      }
    });
  }

  async createUsage(params: {
    companyId: string;
    projectId: string;
    assetId: string;
    quantity?: string | null;
    unit?: string | null;
    billingMode: BillingMode;
    createdByUserId?: string | null;
  }) {
    const { companyId, projectId, assetId, quantity, unit, billingMode, createdByUserId } =
      params;

    return this.prisma.assetUsage.create({
      data: {
        companyId,
        projectId,
        assetId,
        billingMode,
        status: UsageStatus.PLANNED,
        quantity: quantity ?? null,
        unit: unit ?? null,
        createdByUserId: createdByUserId ?? null
      }
    });
  }

  async listUsagesForProject(companyId: string, projectId: string) {
    return this.prisma.assetUsage.findMany({
      where: { companyId, projectId },
      orderBy: { createdAt: "desc" },
      include: {
        asset: true
      }
    });
  }
}
