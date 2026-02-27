import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { TransitCostService } from "../locations/transit-cost.service";
import { UsageStatus } from "@prisma/client";

/**
 * Bridges the Asset system with the Logistics/Inventory system.
 *
 * - Deploy: creates AssetUsage (ACTIVE), moves asset to project site,
 *   creates InventoryMovement with transit cost estimate.
 * - Return: completes AssetUsage, moves asset back, creates return movement.
 * - Time Punch: records hours of use, computes cost, updates usage total.
 */
@Injectable()
export class AssetDeploymentService {
  private readonly logger = new Logger(AssetDeploymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitCost: TransitCostService,
  ) {}

  /**
   * Deploy an asset to a project site.
   * Creates AssetUsage, InventoryMovement, and estimates transit cost.
   */
  async deployToProject(
    companyId: string,
    userId: string,
    assetId: string,
    projectId: string,
    destinationLocationId: string,
    opts?: { billingMode?: string; overrideRate?: string; notes?: string },
  ) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId, isActive: true },
    });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found or inactive`);

    // Check for existing active usage on this project
    const existingUsage = await this.prisma.assetUsage.findFirst({
      where: { assetId, projectId, companyId, status: "ACTIVE" },
    });
    if (existingUsage) {
      throw new BadRequestException(
        `Asset "${asset.name}" is already deployed to this project (usage ${existingUsage.id})`,
      );
    }

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { id: true, name: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const fromLocationId = asset.currentLocationId;

    // Estimate transit cost if both locations are known
    let transportCost: number | null = null;
    if (fromLocationId && destinationLocationId) {
      try {
        const estimate = await this.transitCost.estimateTransitCost(
          companyId,
          fromLocationId,
          destinationLocationId,
        );
        transportCost = estimate.estimatedCost;
      } catch {
        // Non-fatal — proceed without cost estimate
      }
    }

    // Create the usage record
    const billingMode = (opts?.billingMode as any) ?? "TIME_AND_MATERIAL";
    const usage = await this.prisma.assetUsage.create({
      data: {
        companyId,
        projectId,
        assetId,
        billingMode,
        status: UsageStatus.ACTIVE,
        overrideRate: opts?.overrideRate ?? null,
        snapshotRate: asset.baseRate,
        snapshotCostBreakdown: asset.costBreakdown ?? undefined,
        startDate: new Date(),
        createdByUserId: userId,
        notes: opts?.notes ?? null,
      },
    });

    // Move the asset
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { currentLocationId: destinationLocationId },
    });

    // Create inventory movement
    const movement = await this.prisma.inventoryMovement.create({
      data: {
        companyId,
        itemType: "ASSET",
        itemId: assetId,
        fromLocationId: fromLocationId ?? undefined,
        toLocationId: destinationLocationId,
        quantity: 1,
        transportCost: transportCost ?? undefined,
        movedByUserId: userId,
        reason: `Deploy to project: ${project.name}`,
        note: opts?.notes ?? null,
      },
    });

    this.logger.log(
      `Asset ${asset.name} deployed to project ${project.name} (usage=${usage.id}, movement=${movement.id})`,
    );

    return {
      usage,
      movement,
      transportCost,
    };
  }

  /**
   * Return an asset from a project.
   * Completes the AssetUsage, moves asset to return location, creates return movement.
   */
  async returnFromProject(
    companyId: string,
    userId: string,
    assetId: string,
    usageId: string,
    returnLocationId: string,
    opts?: { notes?: string },
  ) {
    const usage = await this.prisma.assetUsage.findFirst({
      where: { id: usageId, assetId, companyId, status: "ACTIVE" },
      include: {
        asset: { select: { id: true, name: true, currentLocationId: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!usage) throw new NotFoundException(`Active usage ${usageId} not found for asset ${assetId}`);

    const fromLocationId = usage.asset.currentLocationId;

    // Estimate transit cost for the return trip
    let transportCost: number | null = null;
    if (fromLocationId && returnLocationId) {
      try {
        const estimate = await this.transitCost.estimateTransitCost(
          companyId,
          fromLocationId,
          returnLocationId,
        );
        transportCost = estimate.estimatedCost;
      } catch {
        // Non-fatal
      }
    }

    // Complete the usage
    await this.prisma.assetUsage.update({
      where: { id: usageId },
      data: {
        status: UsageStatus.COMPLETED,
        endDate: new Date(),
      },
    });

    // Move the asset back
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { currentLocationId: returnLocationId },
    });

    // Create return movement
    const movement = await this.prisma.inventoryMovement.create({
      data: {
        companyId,
        itemType: "ASSET",
        itemId: assetId,
        fromLocationId: fromLocationId ?? undefined,
        toLocationId: returnLocationId,
        quantity: 1,
        transportCost: transportCost ?? undefined,
        movedByUserId: userId,
        reason: `Return from project: ${usage.project.name}`,
        note: opts?.notes ?? null,
      },
    });

    this.logger.log(
      `Asset ${usage.asset.name} returned from project ${usage.project.name} (movement=${movement.id})`,
    );

    return { movement, transportCost };
  }

  /**
   * Record a time punch for an active asset usage.
   * Creates an AssetTransaction (TIME_PUNCH), computes cost, accumulates into usage.
   */
  async recordTimePunch(
    companyId: string,
    userId: string,
    usageId: string,
    hours: number,
    date?: string | Date,
    opts?: { dailyLogId?: string; notes?: string },
  ) {
    const usage = await this.prisma.assetUsage.findFirst({
      where: { id: usageId, companyId, status: "ACTIVE" },
      include: {
        asset: { select: { id: true, name: true, baseRate: true } },
      },
    });
    if (!usage) throw new NotFoundException(`Active usage ${usageId} not found`);

    if (hours <= 0) throw new BadRequestException("Hours must be positive");

    // Effective rate: override > snapshot > asset base
    const effectiveRate = Number(usage.overrideRate ?? usage.snapshotRate ?? usage.asset.baseRate ?? 0);
    const totalCost = Math.round(hours * effectiveRate * 100) / 100;

    const transaction = await this.prisma.assetTransaction.create({
      data: {
        assetId: usage.assetId,
        companyId,
        projectId: usage.projectId,
        usageId,
        kind: "TIME_PUNCH",
        quantity: hours,
        unit: "HR",
        unitCost: effectiveRate,
        totalCost,
        notes: opts?.notes ?? null,
        createdById: userId,
      },
    });

    // Accumulate into usage actualCost
    const currentActual = Number(usage.actualCost ?? 0);
    await this.prisma.assetUsage.update({
      where: { id: usageId },
      data: {
        actualCost: currentActual + totalCost,
        quantity: Number(usage.quantity ?? 0) + hours,
      },
    });

    this.logger.log(
      `Time punch: ${hours}h × $${effectiveRate}/hr = $${totalCost} for ${usage.asset.name} (tx=${transaction.id})`,
    );

    return {
      transaction,
      effectiveRate,
      totalCost,
    };
  }
}
