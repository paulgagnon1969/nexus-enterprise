import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** 2026 IRS standard mileage rate for business use */
const DEFAULT_MILEAGE_RATE = 0.70;
const METERS_PER_MILE = 1609.344;

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface TransitCostEstimate {
  fromLocationId: string;
  toLocationId: string;
  distanceMiles: number;
  ratePerMile: number;
  estimatedCost: number;
  rateSource: 'COMPANY_OVERRIDE' | 'IRS_DEFAULT';
}

@Injectable()
export class TransitCostService {
  private readonly logger = new Logger(TransitCostService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estimate transit cost between two locations using haversine distance
   * and either the company's configured mileage rate or the IRS default.
   */
  async estimateTransitCost(
    companyId: string,
    fromLocationId: string,
    toLocationId: string,
  ): Promise<TransitCostEstimate> {
    const [fromLoc, toLoc] = await Promise.all([
      this.prisma.location.findUnique({
        where: { id: fromLocationId },
        select: { id: true, metadata: true },
      }),
      this.prisma.location.findUnique({
        where: { id: toLocationId },
        select: { id: true, metadata: true },
      }),
    ]);

    if (!fromLoc) throw new NotFoundException(`Location ${fromLocationId} not found`);
    if (!toLoc) throw new NotFoundException(`Location ${toLocationId} not found`);

    const fromMeta = fromLoc.metadata as any;
    const toMeta = toLoc.metadata as any;

    let distanceMiles = 0;
    if (fromMeta?.lat != null && fromMeta?.lng != null && toMeta?.lat != null && toMeta?.lng != null) {
      const meters = haversineMeters(fromMeta.lat, fromMeta.lng, toMeta.lat, toMeta.lng);
      distanceMiles = meters / METERS_PER_MILE;
    }

    // Check for company-configurable mileage rate (stored in defaultPayrollConfig JSON)
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultPayrollConfig: true },
    });

    const config = company?.defaultPayrollConfig as any;
    const ratePerMile = config?.mileageRate ?? DEFAULT_MILEAGE_RATE;
    const rateSource: 'COMPANY_OVERRIDE' | 'IRS_DEFAULT' = config?.mileageRate
      ? 'COMPANY_OVERRIDE'
      : 'IRS_DEFAULT';

    const estimatedCost = Math.round(distanceMiles * ratePerMile * 100) / 100;

    return {
      fromLocationId,
      toLocationId,
      distanceMiles: Math.round(distanceMiles * 100) / 100,
      ratePerMile,
      estimatedCost,
      rateSource,
    };
  }

  /**
   * Compute distance in miles between two locations (for transit history display).
   * Returns null if either location lacks lat/lng metadata.
   */
  computeDistanceMiles(
    fromMeta: any,
    toMeta: any,
  ): number | null {
    if (fromMeta?.lat == null || fromMeta?.lng == null || toMeta?.lat == null || toMeta?.lng == null) {
      return null;
    }
    const meters = haversineMeters(fromMeta.lat, fromMeta.lng, toMeta.lat, toMeta.lng);
    return Math.round((meters / METERS_PER_MILE) * 100) / 100;
  }

  /**
   * Update transport cost on an existing InventoryMovement and recapitalize
   * the cost into the destination InventoryPosition.
   */
  async updateMovementTransportCost(
    movementId: string,
    companyId: string,
    transportCost: number,
  ): Promise<any> {
    const movement = await this.prisma.inventoryMovement.findFirst({
      where: { id: movementId, companyId },
    });

    if (!movement) throw new NotFoundException(`Movement ${movementId} not found`);

    const oldTransportCost = Number(movement.transportCost ?? 0);
    const costDelta = transportCost - oldTransportCost;

    // Update the movement's transport cost
    const updated = await this.prisma.inventoryMovement.update({
      where: { id: movementId },
      data: { transportCost },
    });

    // Recapitalize: adjust destination InventoryPosition.totalCost by the delta
    if (costDelta !== 0) {
      const destPosition = await this.prisma.inventoryPosition.findFirst({
        where: {
          companyId,
          itemType: movement.itemType,
          itemId: movement.itemId,
          locationId: movement.toLocationId,
        },
      });

      if (destPosition) {
        const newTotalCost = Number(destPosition.totalCost) + costDelta;
        await this.prisma.inventoryPosition.update({
          where: { id: destPosition.id },
          data: { totalCost: Math.max(0, newTotalCost) },
        });

        this.logger.log(
          `Recapitalized transport cost for movement ${movementId}: delta=$${costDelta}, new position total=$${newTotalCost}`,
        );
      }
    }

    return updated;
  }
}
