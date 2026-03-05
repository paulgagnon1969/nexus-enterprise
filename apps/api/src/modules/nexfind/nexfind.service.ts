import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { AuditService } from "../../common/audit.service";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { MapboxPlacesProvider, PlaceResult } from "./mapbox-places.provider";
import { LocalSupplierStatus } from "@prisma/client";

/** Haversine distance in meters between two lat/lng points. */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Convert meters to miles. */
function metersToMiles(m: number): number {
  return m / 1609.34;
}

export interface DiscoverResult {
  newCount: number;
  existingCount: number;
  totalSuppliers: number;
}

export interface NearbySupplier {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  category: string | null;
  source: string | null;
  distanceMiles: number;
  status: LocalSupplierStatus;
}

@Injectable()
export class NexfindService {
  private readonly logger = new Logger(NexfindService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly places: MapboxPlacesProvider,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Discover nearby suppliers via Google Places
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Scrape nearby construction suppliers and upsert them into the tenant's
   * LocalSupplier table + the global network index.
   */
  async discoverNearby(
    companyId: string,
    lat: number,
    lng: number,
    radiusMeters?: number,
  ): Promise<DiscoverResult> {
    const places = await this.places.searchNearby(lat, lng, radiusMeters);

    let newCount = 0;
    let existingCount = 0;

    for (const place of places) {
      try {
        const result = await this.upsertLocalSupplier(
          companyId,
          place,
          "google_places",
        );
        if (result === "created") newCount++;
        else existingCount++;
      } catch (err: any) {
        this.logger.warn(
          `Failed to upsert supplier ${place.name}: ${err?.message}`,
        );
      }
    }

    this.logger.log(
      `NexFIND discovery for company ${companyId}: ${newCount} new, ${existingCount} existing`,
    );

    return {
      newCount,
      existingCount,
      totalSuppliers: newCount + existingCount,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Record navigation event (directions capture)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record that a user tapped "Get Directions" to a supplier.
   * Updates visit metadata and ensures the supplier is in the tenant library.
   */
  async recordNavigation(
    actor: AuthenticatedUser,
    supplierId: string,
    projectId?: string,
  ): Promise<{ ok: boolean; supplier: any }> {
    const supplier = await this.prisma.localSupplier.findFirst({
      where: { id: supplierId, companyId: actor.companyId },
    });

    if (!supplier) {
      // Supplier might be from the global index — try to find and clone
      const global = await this.prisma.globalSupplier.findUnique({
        where: { id: supplierId },
      });
      if (global) {
        const cloned = await this.cloneFromGlobal(actor.companyId, global, "directions");
        return { ok: true, supplier: cloned };
      }
      return { ok: false, supplier: null };
    }

    // Update visit metadata
    const meta = (supplier.metadata as any) ?? {};
    meta.visitCount = (meta.visitCount ?? 0) + 1;
    meta.lastNavigatedAt = new Date().toISOString();
    meta.lastNavigatedByUserId = actor.userId;
    if (projectId) {
      meta.lastProjectId = projectId;
    }

    const updated = await this.prisma.localSupplier.update({
      where: { id: supplierId },
      data: { metadata: meta },
    });

    await this.audit.log(actor, "NEXFIND_NAVIGATE", {
      companyId: actor.companyId,
      metadata: { supplierId, projectId },
    });

    return { ok: true, supplier: updated };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Product/supplier search
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Search for nearby suppliers matching a product query.
   * Returns LocalSupplier records ranked by distance + category relevance.
   */
  async searchNearby(
    companyId: string,
    query: string,
    lat: number,
    lng: number,
    radiusMiles: number = 25,
  ): Promise<NearbySupplier[]> {
    // Fetch all active suppliers for the company
    const suppliers = await this.prisma.localSupplier.findMany({
      where: {
        companyId,
        status: LocalSupplierStatus.ACTIVE,
      },
    });

    const radiusMeters = radiusMiles * 1609.34;
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length >= 2);

    const results: NearbySupplier[] = [];

    for (const s of suppliers) {
      const dist = haversineMeters(lat, lng, s.lat, s.lng);
      if (dist > radiusMeters) continue;

      // Relevance scoring: match query against name + category
      const nameMatch = queryWords.some(
        (w) =>
          s.name.toLowerCase().includes(w) ||
          (s.category?.toLowerCase().includes(w) ?? false),
      );

      // Include all suppliers within radius; sort later
      results.push({
        id: s.id,
        name: s.name,
        address: s.address,
        phone: s.phone,
        website: s.website,
        lat: s.lat,
        lng: s.lng,
        category: s.category,
        source: s.source,
        distanceMiles: Math.round(metersToMiles(dist) * 10) / 10,
        status: s.status,
      });
    }

    // Sort: relevance matches first, then by distance
    results.sort((a, b) => {
      const aMatch = queryWords.some(
        (w) =>
          a.name.toLowerCase().includes(w) ||
          (a.category?.toLowerCase().includes(w) ?? false),
      )
        ? 0
        : 1;
      const bMatch = queryWords.some(
        (w) =>
          b.name.toLowerCase().includes(w) ||
          (b.category?.toLowerCase().includes(w) ?? false),
      )
        ? 0
        : 1;

      if (aMatch !== bMatch) return aMatch - bMatch;
      return a.distanceMiles - b.distanceMiles;
    });

    return results.slice(0, 50);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Global network index
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get suppliers from the global network near a coordinate.
   * Used for NexFIND Pro / cross-tenant discovery.
   */
  async getNetworkSuppliers(
    lat: number,
    lng: number,
    radiusMiles: number = 25,
  ): Promise<
    Array<{
      id: string;
      name: string;
      address: string | null;
      lat: number;
      lng: number;
      category: string | null;
      tenantCount: number;
      distanceMiles: number;
    }>
  > {
    // Bounding box approximation (1 degree ≈ 69 miles lat, ~55 miles lng at mid-US)
    const latDelta = radiusMiles / 69;
    const lngDelta = radiusMiles / 55;

    const globals = await this.prisma.globalSupplier.findMany({
      where: {
        lat: { gte: lat - latDelta, lte: lat + latDelta },
        lng: { gte: lng - lngDelta, lte: lng + lngDelta },
      },
      orderBy: { tenantCount: "desc" },
      take: 100,
    });

    const radiusMeters = radiusMiles * 1609.34;

    return globals
      .map((g) => ({
        id: g.id,
        name: g.name,
        address: g.address,
        lat: g.lat,
        lng: g.lng,
        category: g.category,
        tenantCount: g.tenantCount,
        distanceMiles:
          Math.round(
            metersToMiles(haversineMeters(lat, lng, g.lat, g.lng)) * 10,
          ) / 10,
      }))
      .filter((g) => g.distanceMiles <= radiusMiles)
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Sync local supplier to global index
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Upsert a GlobalSupplier from a LocalSupplier record.
   * Called automatically whenever a LocalSupplier is created.
   */
  async syncToGlobal(localSupplierId: string): Promise<void> {
    const local = await this.prisma.localSupplier.findUnique({
      where: { id: localSupplierId },
    });
    if (!local) return;

    try {
      if (local.placeId) {
        // Upsert by placeId
        const existing = await this.prisma.globalSupplier.findUnique({
          where: { placeId: local.placeId },
        });

        if (existing) {
          // Link and increment tenant count (only if not already linked)
          const alreadyLinked = local.globalSupplierId === existing.id;
          await this.prisma.globalSupplier.update({
            where: { id: existing.id },
            data: {
              tenantCount: alreadyLinked
                ? existing.tenantCount
                : existing.tenantCount + 1,
            },
          });
          if (!alreadyLinked) {
            await this.prisma.localSupplier.update({
              where: { id: local.id },
              data: { globalSupplierId: existing.id },
            });
          }
        } else {
          const global = await this.prisma.globalSupplier.create({
            data: {
              name: local.name,
              address: local.address,
              phone: local.phone,
              website: local.website,
              lat: local.lat,
              lng: local.lng,
              category: local.category,
              placeId: local.placeId,
              source: local.source,
              tenantCount: 1,
            },
          });
          await this.prisma.localSupplier.update({
            where: { id: local.id },
            data: { globalSupplierId: global.id },
          });
        }
      } else {
        // No placeId — create a new global supplier (can't de-dup)
        const global = await this.prisma.globalSupplier.create({
          data: {
            name: local.name,
            address: local.address,
            phone: local.phone,
            website: local.website,
            lat: local.lat,
            lng: local.lng,
            category: local.category,
            source: local.source,
            tenantCount: 1,
          },
        });
        await this.prisma.localSupplier.update({
          where: { id: local.id },
          data: { globalSupplierId: global.id },
        });
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to sync local supplier ${localSupplierId} to global index: ${err?.message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Public helper: upsert from external data (receipt OCR, etc.)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Upsert a LocalSupplier from receipt OCR data or other external source.
   * Used by the receipt-inventory bridge to connect the two systems.
   */
  async upsertFromReceiptData(
    companyId: string,
    data: {
      name: string;
      address?: string | null;
      phone?: string | null;
      lat?: number | null;
      lng?: number | null;
      storeNumber?: string | null;
    },
  ): Promise<string | null> {
    if (!data.name || data.lat == null || data.lng == null) return null;

    // Try to find existing by name + proximity
    const existing = await this.prisma.localSupplier.findFirst({
      where: {
        companyId,
        status: LocalSupplierStatus.ACTIVE,
        name: { contains: data.name, mode: "insensitive" },
      },
    });

    if (existing) {
      // Check proximity (200m)
      const dist = haversineMeters(
        data.lat,
        data.lng,
        existing.lat,
        existing.lng,
      );
      if (dist <= 500) return existing.id;
    }

    // Create new
    const supplier = await this.prisma.localSupplier.create({
      data: {
        companyId,
        name: data.storeNumber
          ? `${data.name} #${data.storeNumber}`
          : data.name,
        address: data.address,
        phone: data.phone,
        lat: data.lat,
        lng: data.lng,
        source: "receipt_ocr",
        savedVia: "receipt_ocr",
        status: LocalSupplierStatus.ACTIVE,
      },
    });

    // Sync to global index (fire-and-forget)
    void this.syncToGlobal(supplier.id).catch(() => {});

    this.logger.log(
      `NexFIND: created supplier from receipt: ${supplier.name} (${supplier.id})`,
    );

    return supplier.id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Upsert a LocalSupplier from a Google Places result.
   * Returns "created" or "existing".
   */
  private async upsertLocalSupplier(
    companyId: string,
    place: PlaceResult,
    savedVia: string,
  ): Promise<"created" | "existing"> {
    if (place.placeId) {
      // Check if already exists for this company
      const existing = await this.prisma.localSupplier.findFirst({
        where: { companyId, placeId: place.placeId },
      });
      if (existing) return "existing";
    }

    const supplier = await this.prisma.localSupplier.create({
      data: {
        companyId,
        name: place.name,
        address: place.address,
        phone: place.phone,
        website: place.website,
        lat: place.lat,
        lng: place.lng,
        category: place.category,
        source: "mapbox",
        savedVia,
        placeId: place.placeId,
        status: LocalSupplierStatus.ACTIVE,
      },
    });

    // Sync to global index (fire-and-forget)
    void this.syncToGlobal(supplier.id).catch(() => {});

    return "created";
  }

  /**
   * Clone a GlobalSupplier into a tenant's LocalSupplier library.
   */
  private async cloneFromGlobal(
    companyId: string,
    global: {
      id: string;
      name: string;
      address: string | null;
      phone: string | null;
      website: string | null;
      lat: number;
      lng: number;
      category: string | null;
      placeId: string | null;
      source: string | null;
    },
    savedVia: string,
  ) {
    // Check if already exists
    if (global.placeId) {
      const existing = await this.prisma.localSupplier.findFirst({
        where: { companyId, placeId: global.placeId },
      });
      if (existing) return existing;
    }

    const supplier = await this.prisma.localSupplier.create({
      data: {
        companyId,
        name: global.name,
        address: global.address,
        phone: global.phone,
        website: global.website,
        lat: global.lat,
        lng: global.lng,
        category: global.category,
        placeId: global.placeId,
        source: global.source,
        savedVia,
        globalSupplierId: global.id,
        status: LocalSupplierStatus.ACTIVE,
      },
    });

    // Increment tenant count on global record
    await this.prisma.globalSupplier
      .update({
        where: { id: global.id },
        data: { tenantCount: { increment: 1 } },
      })
      .catch(() => {});

    return supplier;
  }
}
