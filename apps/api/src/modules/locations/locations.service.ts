import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { InventoryItemType, AssetType, moveInventoryWithCost } from "@repo/database";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRootLocations(companyId: string) {
    return this.prisma.location.findMany({
      where: {
        companyId,
        parentLocationId: null,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async getChildLocations(companyId: string, parentLocationId: string) {
    // Ensure parent exists and belongs to this company
    const parent = await this.prisma.location.findFirst({
      where: { id: parentLocationId, companyId },
    });
    if (!parent) {
      throw new NotFoundException("Parent location not found in this company");
    }

    return this.prisma.location.findMany({
      where: {
        companyId,
        parentLocationId,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async getPersonLocation(companyId: string, userId: string) {
    const personLoc = await this.prisma.personLocation.findFirst({
      where: { companyId, userId },
      include: { location: true },
    });

    if (!personLoc) {
      return null;
    }

    return personLoc;
  }

  async getHoldingsForLocation(companyId: string, locationId: string) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, companyId },
    });
    if (!location) {
      throw new NotFoundException("Location not found in this company");
    }

    const [assets, materialLots, particles, people] = await Promise.all([
      this.prisma.asset.findMany({
        where: {
          companyId,
          currentLocationId: locationId,
        },
        select: {
          id: true,
          name: true,
          code: true,
          assetType: true,
        },
      }),
      this.prisma.materialLot.findMany({
        where: {
          companyId,
          currentLocationId: locationId,
        },
        select: {
          id: true,
          sku: true,
          name: true,
          quantity: true,
          uom: true,
        },
      }),
      this.prisma.inventoryParticle.findMany({
        where: {
          companyId,
          locationId,
        },
        select: {
          id: true,
          parentEntityType: true,
          parentEntityId: true,
          quantity: true,
          uom: true,
        },
      }),
      this.prisma.personLocation.findMany({
        where: {
          companyId,
          locationId,
        },
        select: {
          userId: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const peopleSummaries = people.map((p) => ({
      userId: p.userId,
      name:
        (p.user?.firstName || p.user?.lastName)
          ? `${p.user?.firstName ?? ""} ${p.user?.lastName ?? ""}`.trim() || null
          : null,
      email: p.user?.email ?? null,
    }));

    return {
      location,
      assets,
      materialLots,
      particles,
      people: peopleSummaries,
    };
  }

  async getHoldingsForPerson(companyId: string, userId: string) {
    const personLoc = await this.getPersonLocation(companyId, userId);

    if (!personLoc) {
      return {
        location: null,
        assets: [],
        materialLots: [],
        particles: [],
        people: [],
      };
    }

    const holdings = await this.getHoldingsForLocation(companyId, personLoc.locationId);
    return holdings;
  }

  async assignPeopleToLocation(
    companyId: string,
    locationId: string,
    actorUserId: string,
    userIds: string[],
  ) {
    if (!userIds.length) {
      return this.getHoldingsForLocation(companyId, locationId);
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, companyId },
    });
    if (!location) {
      throw new NotFoundException("Location not found in this company");
    }

    // Optionally we could validate that actor is allowed; for now, rely on controller Roles.

    await this.prisma.$transaction(async (tx) => {
      for (const userId of userIds) {
        const trimmed = userId?.trim();
        if (!trimmed) continue;

        const existing = await tx.personLocation.findFirst({
          where: {
            companyId,
            userId: trimmed,
          },
        });

        if (existing) {
          await tx.personLocation.update({
            where: { id: existing.id },
            data: { locationId },
          });
        } else {
          await tx.personLocation.create({
            data: {
              companyId,
              userId: trimmed,
              locationId,
            },
          });
        }
      }
    });

    return this.getHoldingsForLocation(companyId, locationId);
  }

  async moveAsset(params: {
    companyId: string;
    actorUserId: string;
    assetId: string;
    toLocationId: string;
    reason?: string;
    note?: string;
  }) {
    const { companyId, actorUserId, assetId, toLocationId, reason, note } = params;

    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found in this company");
    }

    const fromLocationId = asset.currentLocationId ?? null;

    await moveInventoryWithCost({
      companyId,
      itemType: InventoryItemType.ASSET,
      itemId: assetId,
      fromLocationId,
      toLocationId,
      quantity: 1,
      reason: reason ?? "TRANSFER",
      note,
      movedByUserId: actorUserId,
      // If this is the first move and no source position exists, treat it as
      // an initial load with zero cost and let later movements carry cost.
      explicitUnitCostForInitialLoad: fromLocationId ? null : 0,
    });

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { currentLocationId: toLocationId },
    });

    return this.getHoldingsForLocation(companyId, toLocationId);
  }

  async addAssetAtLocation(params: {
    companyId: string;
    actorUserId: string;
    locationId: string;
    name: string;
    assetType: string;
    code?: string | null;
    description?: string | null;
    isTrackable?: boolean;
    isConsumable?: boolean;
  }) {
    const { companyId, locationId, name, assetType, code, description, isTrackable, isConsumable } = params;

    if (!name?.trim()) {
      throw new BadRequestException("name is required");
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, companyId },
    });
    if (!location) {
      throw new NotFoundException("Location not found in this company");
    }

    const typeKey = assetType?.toUpperCase() as keyof typeof AssetType;
    if (!typeKey || !(typeKey in AssetType)) {
      throw new BadRequestException(`Invalid assetType '${assetType}'`);
    }

    await this.prisma.asset.create({
      data: {
        companyId,
        name: name.trim(),
        code: code?.trim() || null,
        description: description?.trim() || null,
        assetType: AssetType[typeKey],
        isTrackable: isTrackable ?? true,
        isConsumable: isConsumable ?? false,
        currentLocationId: locationId,
      },
    });

    return this.getHoldingsForLocation(companyId, locationId);
  }

  /**
   * Fetch recent InventoryMovement rows for a location (either from or to).
   * Returns the 20 most recent movements.
   */
  async getRecentMovementsForLocation(companyId: string, locationId: string, limit = 20) {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, companyId },
    });
    if (!location) {
      throw new NotFoundException("Location not found in this company");
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        companyId,
        OR: [
          { fromLocationId: locationId },
          { toLocationId: locationId },
        ],
      },
      orderBy: { movedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        itemType: true,
        itemId: true,
        fromLocationId: true,
        toLocationId: true,
        quantity: true,
        reason: true,
        movedAt: true,
        movedByUserId: true,
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    });

    return movements;
  }
}
