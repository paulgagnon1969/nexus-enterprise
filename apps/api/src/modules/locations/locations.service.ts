import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { InventoryItemType, AssetType, moveInventoryWithCost } from "@repo/database";
import { LocationType } from "@prisma/client";

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  private slugifyCodePart(input: string): string {
    return String(input || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "")
      .slice(0, 24);
  }

  async seedProjectLocationTree(params: {
    companyId: string;
    projectId: string;
    zonesCount?: number;
    upstreamVendors?: string[];
  }) {
    const { companyId, projectId } = params;

    const zonesCount = Math.max(1, Math.min(50, Number(params.zonesCount ?? 3)));
    const upstreamVendors = (params.upstreamVendors ?? ["Home Depot"]).filter(Boolean);

    const [company, project] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.project.findFirst({ where: { id: projectId, companyId } }),
    ]);

    if (!company) {
      throw new NotFoundException("Company not found");
    }
    if (!project) {
      throw new NotFoundException("Project not found in this company");
    }

    // Location codes are used as stable identifiers so we can upsert safely.
    const companyRootCode = `ORG:${companyId}`;
    const projectRootCode = `PROJ:${projectId}`;

    return this.prisma.$transaction(async (tx) => {
      const companyRoot = await tx.location.upsert({
        where: {
          Location_companyId_code_unique: {
            companyId,
            code: companyRootCode,
          },
        },
        update: {
          name: company.name,
          type: LocationType.LOGICAL,
          isActive: true,
        },
        create: {
          companyId,
          type: LocationType.LOGICAL,
          name: company.name,
          code: companyRootCode,
          isActive: true,
          metadata: {
            kind: "COMPANY_ROOT",
            companyId,
          } as any,
        },
      });

      const projectRoot = await tx.location.upsert({
        where: {
          Location_companyId_code_unique: {
            companyId,
            code: projectRootCode,
          },
        },
        update: {
          name: project.name,
          type: LocationType.SITE,
          parentLocationId: companyRoot.id,
          isActive: true,
          metadata: {
            kind: "PROJECT_ROOT",
            projectId,
            projectName: project.name,
            addressLine1: (project as any).addressLine1 ?? null,
            city: (project as any).city ?? null,
            state: (project as any).state ?? null,
            postalCode: (project as any).postalCode ?? null,
          } as any,
        },
        create: {
          companyId,
          type: LocationType.SITE,
          name: project.name,
          code: projectRootCode,
          parentLocationId: companyRoot.id,
          isActive: true,
          metadata: {
            kind: "PROJECT_ROOT",
            projectId,
            projectName: project.name,
            addressLine1: (project as any).addressLine1 ?? null,
            city: (project as any).city ?? null,
            state: (project as any).state ?? null,
            postalCode: (project as any).postalCode ?? null,
          } as any,
        },
      });

      const upstream = await tx.location.upsert({
        where: {
          Location_companyId_code_unique: {
            companyId,
            code: `UPSTREAM:${projectId}`,
          },
        },
        update: {
          name: "Upstream",
          type: LocationType.LOGICAL,
          parentLocationId: projectRoot.id,
          isActive: true,
        },
        create: {
          companyId,
          type: LocationType.LOGICAL,
          name: "Upstream",
          code: `UPSTREAM:${projectId}`,
          parentLocationId: projectRoot.id,
          isActive: true,
          metadata: { kind: "UPSTREAM" } as any,
        },
      });

      const downstream = await tx.location.upsert({
        where: {
          Location_companyId_code_unique: {
            companyId,
            code: `DOWNSTREAM:${projectId}`,
          },
        },
        update: {
          name: "Downstream",
          type: LocationType.LOGICAL,
          parentLocationId: projectRoot.id,
          isActive: true,
        },
        create: {
          companyId,
          type: LocationType.LOGICAL,
          name: "Downstream",
          code: `DOWNSTREAM:${projectId}`,
          parentLocationId: projectRoot.id,
          isActive: true,
          metadata: { kind: "DOWNSTREAM" } as any,
        },
      });

      const warehouse = await tx.location.upsert({
        where: {
          Location_companyId_code_unique: {
            companyId,
            code: `WH:${projectId}:MAIN`,
          },
        },
        update: {
          name: "Main Warehouse",
          type: LocationType.WAREHOUSE,
          parentLocationId: projectRoot.id,
          isActive: true,
        },
        create: {
          companyId,
          type: LocationType.WAREHOUSE,
          name: "Main Warehouse",
          code: `WH:${projectId}:MAIN`,
          parentLocationId: projectRoot.id,
          isActive: true,
          metadata: { kind: "WAREHOUSE", isDefault: true } as any,
        },
      });

      for (let i = 1; i <= zonesCount; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await tx.location.upsert({
          where: {
            Location_companyId_code_unique: {
              companyId,
              code: `ZONE:${projectId}:${i}`,
            },
          },
          update: {
            name: `Zone ${i}`,
            type: LocationType.ZONE,
            parentLocationId: warehouse.id,
            isActive: true,
          },
          create: {
            companyId,
            type: LocationType.ZONE,
            name: `Zone ${i}`,
            code: `ZONE:${projectId}:${i}`,
            parentLocationId: warehouse.id,
            isActive: true,
            metadata: { kind: "ZONE", zoneNo: i } as any,
          },
        });
      }

      for (const v of upstreamVendors) {
        const codePart = this.slugifyCodePart(v) || "VENDOR";
        // eslint-disable-next-line no-await-in-loop
        await tx.location.upsert({
          where: {
            Location_companyId_code_unique: {
              companyId,
              code: `VENDOR:${projectId}:${codePart}`,
            },
          },
          update: {
            name: v,
            type: LocationType.VENDOR,
            parentLocationId: upstream.id,
            isActive: true,
          },
          create: {
            companyId,
            type: LocationType.VENDOR,
            name: v,
            code: `VENDOR:${projectId}:${codePart}`,
            parentLocationId: upstream.id,
            isActive: true,
            metadata: { kind: "UPSTREAM_VENDOR" } as any,
          },
        });
      }

      return {
        companyRoot,
        projectRoot,
        upstream,
        downstream,
        warehouse,
        zonesCount,
      };
    });
  }

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

  async getProjectRootLocation(companyId: string, projectId: string) {
    const code = `PROJ:${projectId}`;
    return this.prisma.location.findFirst({
      where: { companyId, code, isActive: true },
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
