import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AssetType, AssetOwnershipType, AssetSharingVisibility, BillingMode, UsageStatus } from "@prisma/client";

export type OwnershipFilter = "ALL" | "COMPANY" | "PERSONAL" | "MY_ASSETS";

export interface CreateAssetInput {
  companyId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  assetType: AssetType;
  baseUnit?: string | null;
  baseRate?: string | null; // Decimal as string to avoid JS float issues
  costBreakdown?: any;
  manufacturer?: string | null;
  model?: string | null;
  serialNumberOrVin?: string | null;
  year?: number | null;
  isTrackable?: boolean;
  isConsumable?: boolean;
  currentLocationId?: string | null;
  ownershipType?: AssetOwnershipType;
  ownerId?: string | null;
  sharingVisibility?: AssetSharingVisibility;
  maintenanceAssigneeId?: string | null;
  maintenancePoolId?: string | null;
}

export interface UpdateAssetInput {
  name?: string;
  code?: string | null;
  description?: string | null;
  assetType?: AssetType;
  baseUnit?: string | null;
  baseRate?: string | null;
  costBreakdown?: any;
  attributes?: any;
  manufacturer?: string | null;
  model?: string | null;
  serialNumberOrVin?: string | null;
  year?: number | null;
  isTrackable?: boolean;
  isConsumable?: boolean;
  isActive?: boolean;
  currentLocationId?: string | null;
  ownershipType?: AssetOwnershipType;
  ownerId?: string | null;
  sharingVisibility?: AssetSharingVisibility;
  maintenanceAssigneeId?: string | null;
  maintenancePoolId?: string | null;
}

export interface CostSummary {
  assetId: string;
  totalHours: number;
  totalCost: number;
  projectBreakdown: { projectId: string; projectName: string; hours: number; cost: number }[];
  transactionCount: number;
}

@Injectable()
export class AssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── List (with optional filters + visibility) ─────────────────────

  async listAssetsForCompany(
    companyId: string,
    userId: string,
    filters?: {
      assetType?: AssetType;
      isActive?: boolean;
      search?: string;
      ownershipFilter?: OwnershipFilter;
    },
  ) {
    const ownershipFilter = filters?.ownershipFilter ?? "ALL";

    // Build base conditions
    const conditions: any[] = [{ companyId }];

    if (filters?.assetType) conditions.push({ assetType: filters.assetType });
    if (filters?.isActive !== undefined) conditions.push({ isActive: filters.isActive });
    if (filters?.search) {
      conditions.push({
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { code: { contains: filters.search, mode: "insensitive" } },
          { serialNumberOrVin: { contains: filters.search, mode: "insensitive" } },
        ],
      });
    }

    // Ownership + visibility filter
    if (ownershipFilter === "COMPANY") {
      conditions.push({ ownershipType: "COMPANY" });
    } else if (ownershipFilter === "MY_ASSETS") {
      conditions.push({ ownershipType: "PERSONAL", ownerId: userId });
    } else if (ownershipFilter === "PERSONAL") {
      // Show personal assets user is allowed to see
      conditions.push({
        ownershipType: "PERSONAL",
        OR: [
          { ownerId: userId },
          { sharingVisibility: "COMPANY" },
          { sharingVisibility: "CUSTOM", shareGrants: { some: { grantedToUserId: userId } } },
        ],
      });
    } else {
      // ALL: company assets + visible personal assets
      conditions.push({
        OR: [
          { ownershipType: "COMPANY" },
          { ownershipType: "PERSONAL", ownerId: userId },
          { ownershipType: "PERSONAL", sharingVisibility: "COMPANY" },
          { ownershipType: "PERSONAL", sharingVisibility: "CUSTOM", shareGrants: { some: { grantedToUserId: userId } } },
        ],
      });
    }

    return this.prisma.asset.findMany({
      where: { AND: conditions },
      orderBy: { name: "asc" },
      include: {
        currentLocation: { select: { id: true, name: true, type: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        maintenanceAssignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        maintenancePool: { select: { id: true, name: true } },
      },
    });
  }

  // ── Single asset ──────────────────────────────────────────────────

  async getAssetById(companyId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
      include: {
        currentLocation: { select: { id: true, name: true, type: true } },
        owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        maintenanceAssignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        maintenancePool: {
          select: {
            id: true, name: true,
            members: {
              include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
            },
          },
        },
        shareGrants: {
          include: {
            grantedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        usages: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            project: { select: { id: true, name: true } },
          },
        },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            project: { select: { id: true, name: true } },
          },
        },
        meterReadings: {
          orderBy: { recordedAt: "desc" },
          take: 20,
        },
        maintenanceTodos: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { dueDate: "asc" },
          take: 10,
        },
      },
    });

    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
    return asset;
  }

  // ── Create ────────────────────────────────────────────────────────

  async createAsset(input: CreateAssetInput) {
    return this.prisma.asset.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        code: input.code ?? null,
        description: input.description ?? null,
        assetType: input.assetType,
        baseUnit: input.baseUnit ?? null,
        baseRate: input.baseRate ?? null,
        costBreakdown: input.costBreakdown ?? undefined,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        serialNumberOrVin: input.serialNumberOrVin ?? null,
        year: input.year ?? null,
        isTrackable: input.isTrackable ?? false,
        isConsumable: input.isConsumable ?? false,
        currentLocationId: input.currentLocationId ?? null,
        ownershipType: input.ownershipType ?? "COMPANY",
        ownerId: input.ownerId ?? null,
        sharingVisibility: input.sharingVisibility ?? (input.ownershipType === "PERSONAL" ? "PRIVATE" : "COMPANY"),
        maintenanceAssigneeId: input.maintenanceAssigneeId ?? null,
        maintenancePoolId: input.maintenancePoolId ?? null,
      },
    });
  }

  // ── Update ────────────────────────────────────────────────────────

  async updateAsset(companyId: string, assetId: string, input: UpdateAssetInput) {
    const existing = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!existing) throw new NotFoundException(`Asset ${assetId} not found`);

    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.code !== undefined) data.code = input.code;
    if (input.description !== undefined) data.description = input.description;
    if (input.assetType !== undefined) data.assetType = input.assetType;
    if (input.baseUnit !== undefined) data.baseUnit = input.baseUnit;
    if (input.baseRate !== undefined) data.baseRate = input.baseRate;
    if (input.costBreakdown !== undefined) data.costBreakdown = input.costBreakdown;
    if (input.attributes !== undefined) data.attributes = input.attributes;
    if (input.manufacturer !== undefined) data.manufacturer = input.manufacturer;
    if (input.model !== undefined) data.model = input.model;
    if (input.serialNumberOrVin !== undefined) data.serialNumberOrVin = input.serialNumberOrVin;
    if (input.year !== undefined) data.year = input.year;
    if (input.isTrackable !== undefined) data.isTrackable = input.isTrackable;
    if (input.isConsumable !== undefined) data.isConsumable = input.isConsumable;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.currentLocationId !== undefined) data.currentLocationId = input.currentLocationId;
    if (input.ownershipType !== undefined) data.ownershipType = input.ownershipType;
    if (input.ownerId !== undefined) data.ownerId = input.ownerId;
    if (input.sharingVisibility !== undefined) data.sharingVisibility = input.sharingVisibility;
    if (input.maintenanceAssigneeId !== undefined) data.maintenanceAssigneeId = input.maintenanceAssigneeId;
    if (input.maintenancePoolId !== undefined) data.maintenancePoolId = input.maintenancePoolId;

    return this.prisma.asset.update({
      where: { id: assetId },
      data,
    });
  }

  // ── Soft delete ───────────────────────────────────────────────────

  async deactivateAsset(companyId: string, assetId: string) {
    const existing = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!existing) throw new NotFoundException(`Asset ${assetId} not found`);

    return this.prisma.asset.update({
      where: { id: assetId },
      data: { isActive: false },
    });
  }

  // ── Cost summary ──────────────────────────────────────────────────

  async getCostSummary(companyId: string, assetId: string): Promise<CostSummary> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);

    // Aggregate from TIME_PUNCH transactions
    const transactions = await this.prisma.assetTransaction.findMany({
      where: { assetId, companyId, kind: "TIME_PUNCH" },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    let totalHours = 0;
    let totalCost = 0;
    const projectMap = new Map<string, { projectName: string; hours: number; cost: number }>();

    for (const tx of transactions) {
      const qty = Number(tx.quantity ?? 0);
      const cost = Number(tx.totalCost ?? 0);
      totalHours += qty;
      totalCost += cost;

      if (tx.projectId) {
        const existing = projectMap.get(tx.projectId) ?? {
          projectName: tx.project?.name ?? "Unknown",
          hours: 0,
          cost: 0,
        };
        existing.hours += qty;
        existing.cost += cost;
        projectMap.set(tx.projectId, existing);
      }
    }

    return {
      assetId,
      totalHours: Math.round(totalHours * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      projectBreakdown: Array.from(projectMap.entries()).map(([projectId, data]) => ({
        projectId,
        ...data,
        hours: Math.round(data.hours * 100) / 100,
        cost: Math.round(data.cost * 100) / 100,
      })),
      transactionCount: transactions.length,
    };
  }

  // ── Sharing ────────────────────────────────────────────────────────

  async shareAsset(companyId: string, assetId: string, ownerId: string, grantedToUserId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, ownerId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found or you are not the owner`);
    if (asset.ownershipType !== "PERSONAL") throw new ForbiddenException("Only personal assets can be shared");

    return this.prisma.assetShareGrant.upsert({
      where: { AssetShareGrant_asset_user_key: { assetId, grantedToUserId } },
      create: { assetId, grantedToUserId, grantedByUserId: ownerId },
      update: {},
      include: {
        grantedTo: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
  }

  async unshareAsset(companyId: string, assetId: string, ownerId: string, grantedToUserId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, ownerId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found or you are not the owner`);

    const grant = await this.prisma.assetShareGrant.findUnique({
      where: { AssetShareGrant_asset_user_key: { assetId, grantedToUserId } },
    });
    if (!grant) throw new NotFoundException("Share grant not found");

    return this.prisma.assetShareGrant.delete({ where: { id: grant.id } });
  }

  async updateSharingVisibility(
    companyId: string,
    assetId: string,
    ownerId: string,
    visibility: AssetSharingVisibility,
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, ownerId },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found or you are not the owner`);
    if (asset.ownershipType !== "PERSONAL") throw new ForbiddenException("Only personal assets have sharing visibility");

    return this.prisma.asset.update({
      where: { id: assetId },
      data: { sharingVisibility: visibility },
    });
  }

  // ── Usages ────────────────────────────────────────────────────────

  async createUsage(params: {
    companyId: string;
    projectId: string;
    assetId: string;
    quantity?: string | null;
    unit?: string | null;
    billingMode: BillingMode;
    createdByUserId?: string | null;
    overrideRate?: string | null;
    startDate?: Date | null;
  }) {
    const { companyId, projectId, assetId, quantity, unit, billingMode, createdByUserId } = params;

    // Snapshot the asset's current rate at time of usage creation
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { baseRate: true, costBreakdown: true },
    });

    return this.prisma.assetUsage.create({
      data: {
        companyId,
        projectId,
        assetId,
        billingMode,
        status: UsageStatus.PLANNED,
        quantity: quantity ?? null,
        unit: unit ?? null,
        overrideRate: params.overrideRate ?? null,
        snapshotRate: asset?.baseRate ?? null,
        snapshotCostBreakdown: asset?.costBreakdown ?? undefined,
        startDate: params.startDate ?? null,
        createdByUserId: createdByUserId ?? null,
      },
    });
  }

  async listUsagesForProject(companyId: string, projectId: string) {
    return this.prisma.assetUsage.findMany({
      where: { companyId, projectId },
      orderBy: { createdAt: "desc" },
      include: {
        asset: true,
      },
    });
  }

  // ── Project-level summary ─────────────────────────────────────────

  async getProjectEquipmentSummary(companyId: string, projectId: string) {
    // Active equipment deployed
    const activeUsages = await this.prisma.assetUsage.findMany({
      where: { companyId, projectId, status: "ACTIVE" },
      include: {
        asset: { select: { id: true, name: true, assetType: true, baseRate: true, baseUnit: true } },
      },
    });

    // Total cost to date from transactions on this project
    const transactions = await this.prisma.assetTransaction.findMany({
      where: { companyId, projectId, kind: "TIME_PUNCH" },
      select: { quantity: true, totalCost: true, createdAt: true },
    });

    let totalCost = 0;
    let totalHours = 0;
    let hoursThisWeek = 0;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const tx of transactions) {
      const qty = Number(tx.quantity ?? 0);
      const cost = Number(tx.totalCost ?? 0);
      totalHours += qty;
      totalCost += cost;
      if (tx.createdAt >= weekAgo) hoursThisWeek += qty;
    }

    // Upcoming maintenance for deployed assets
    const assetIds = activeUsages.map((u) => u.assetId);
    const upcomingMaintenance = assetIds.length > 0
      ? await this.prisma.maintenanceTodo.count({
          where: {
            assetId: { in: assetIds },
            status: { in: ["PENDING", "IN_PROGRESS"] },
            dueDate: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
          },
        })
      : 0;

    return {
      deployedCount: activeUsages.length,
      deployedAssets: activeUsages.map((u) => u.asset),
      totalHours: Math.round(totalHours * 100) / 100,
      hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      upcomingMaintenance,
    };
  }
}
