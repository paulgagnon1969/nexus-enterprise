import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/auth.guards';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { TransitCostService } from './transit-cost.service';

@Controller()
export class MaterialLotTransitController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitCost: TransitCostService,
  ) {}

  /**
   * GET /material-lots/:id/transit-history
   *
   * Returns the chronological breadcrumb of InventoryMovement records
   * for a MaterialLot, with location details and computed distances.
   */
  @UseGuards(JwtAuthGuard)
  @Get('material-lots/:id/transit-history')
  async getTransitHistory(
    @Req() req: any,
    @Param('id') materialLotId: string,
  ) {
    const actor = req.user as AuthenticatedUser;

    const lot = await this.prisma.materialLot.findFirst({
      where: { id: materialLotId, companyId: actor.companyId },
      select: { id: true, sku: true, name: true },
    });

    if (!lot) return { error: 'MaterialLot not found', movements: [] };

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        companyId: actor.companyId,
        itemId: materialLotId,
        itemType: 'MATERIAL',
      },
      orderBy: { movedAt: 'asc' },
      include: {
        fromLocation: {
          select: { id: true, name: true, type: true, code: true, metadata: true },
        },
        toLocation: {
          select: { id: true, name: true, type: true, code: true, metadata: true },
        },
        movedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const breadcrumb = movements.map((m) => {
      const fromMeta = m.fromLocation?.metadata as any;
      const toMeta = m.toLocation?.metadata as any;
      const distanceMiles = this.transitCost.computeDistanceMiles(fromMeta, toMeta);

      return {
        movementId: m.id,
        fromLocation: m.fromLocation
          ? {
              id: m.fromLocation.id,
              name: m.fromLocation.name,
              type: m.fromLocation.type,
              code: m.fromLocation.code,
              lat: fromMeta?.lat ?? null,
              lng: fromMeta?.lng ?? null,
            }
          : null,
        toLocation: {
          id: m.toLocation.id,
          name: m.toLocation.name,
          type: m.toLocation.type,
          code: m.toLocation.code,
          lat: toMeta?.lat ?? null,
          lng: toMeta?.lng ?? null,
        },
        quantity: m.quantity ? Number(m.quantity) : null,
        reason: m.reason,
        transportCost: m.transportCost ? Number(m.transportCost) : null,
        movedAt: m.movedAt,
        movedBy: m.movedBy
          ? {
              id: m.movedBy.id,
              name: [m.movedBy.firstName, m.movedBy.lastName].filter(Boolean).join(' ') || m.movedBy.email,
            }
          : null,
        distanceMiles,
      };
    });

    return {
      lot: { id: lot.id, sku: lot.sku, name: lot.name },
      movements: breadcrumb,
      totalTransportCost: breadcrumb.reduce((sum, m) => sum + (m.transportCost ?? 0), 0),
      totalDistanceMiles: breadcrumb.reduce((sum, m) => sum + (m.distanceMiles ?? 0), 0),
    };
  }

  /**
   * GET /transit-cost/estimate?fromLocationId=X&toLocationId=Y
   *
   * Returns estimated transit cost based on haversine distance + mileage rate.
   */
  @UseGuards(JwtAuthGuard)
  @Get('transit-cost/estimate')
  async estimateCost(
    @Req() req: any,
    @Query('fromLocationId') fromLocationId: string,
    @Query('toLocationId') toLocationId: string,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.transitCost.estimateTransitCost(actor.companyId, fromLocationId, toLocationId);
  }

  /**
   * PATCH /inventory-movements/:id/transport-cost
   *
   * PM updates (or accepts pre-fill) transport cost on a movement.
   * Recapitalizes into the destination InventoryPosition.
   */
  @UseGuards(JwtAuthGuard)
  @Patch('inventory-movements/:id/transport-cost')
  async updateTransportCost(
    @Req() req: any,
    @Param('id') movementId: string,
    @Body('transportCost') transportCost: number,
  ) {
    const actor = req.user as AuthenticatedUser;
    return this.transitCost.updateMovementTransportCost(movementId, actor.companyId, transportCost);
  }
}
