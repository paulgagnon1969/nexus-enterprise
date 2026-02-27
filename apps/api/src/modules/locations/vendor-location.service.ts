import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { LocationType } from '@prisma/client';

export interface VendorMatchInput {
  companyId: string;
  vendorName?: string | null;
  vendorStoreNumber?: string | null;
  vendorAddress?: string | null;
  vendorCity?: string | null;
  vendorState?: string | null;
  vendorZip?: string | null;
  vendorPhone?: string | null;
  captureLat?: number | null;
  captureLng?: number | null;
}

export interface VendorMatchResult {
  locationId: string;
  matchType: 'STORE_NUMBER' | 'GEO_PROXIMITY' | 'FUZZY_NAME' | 'CREATED';
  location: { id: string; name: string; code: string | null; type: LocationType };
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class VendorLocationService {
  private readonly logger = new Logger(VendorLocationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match or create a VENDOR location from OCR data + device geolocation.
   *
   * Three-tier matching:
   * 1. Exact store number match (companyId, type=VENDOR, code=storeNumber)
   * 2. Geo-proximity: known vendor location within ~200m of capture coordinates
   * 3. Fuzzy vendor name match (ILIKE on name)
   *
   * If no match found, creates a new VENDOR location.
   */
  async matchOrCreate(input: VendorMatchInput): Promise<VendorMatchResult> {
    const { companyId, vendorStoreNumber, vendorName, captureLat, captureLng } = input;

    // ── Tier 1: Exact store number match ────────────────────────────────
    if (vendorStoreNumber) {
      const byCode = await this.prisma.location.findFirst({
        where: {
          companyId,
          type: LocationType.VENDOR,
          code: vendorStoreNumber,
          isActive: true,
        },
      });

      if (byCode) {
        this.logger.log(`Vendor matched by store number: ${byCode.name} (${byCode.code})`);
        return {
          locationId: byCode.id,
          matchType: 'STORE_NUMBER',
          location: { id: byCode.id, name: byCode.name, code: byCode.code, type: byCode.type },
        };
      }
    }

    // ── Tier 2: Geo-proximity match (~200m) ─────────────────────────────
    if (captureLat != null && captureLng != null) {
      const vendorLocations = await this.prisma.location.findMany({
        where: {
          companyId,
          type: { in: [LocationType.VENDOR, LocationType.SUPPLIER] },
          isActive: true,
        },
        select: { id: true, name: true, code: true, type: true, metadata: true },
      });

      for (const loc of vendorLocations) {
        const meta = loc.metadata as any;
        if (meta?.lat != null && meta?.lng != null) {
          const dist = haversineMeters(captureLat, captureLng, meta.lat, meta.lng);
          if (dist <= 200) {
            this.logger.log(`Vendor matched by geo-proximity (${Math.round(dist)}m): ${loc.name}`);
            return {
              locationId: loc.id,
              matchType: 'GEO_PROXIMITY',
              location: { id: loc.id, name: loc.name, code: loc.code, type: loc.type },
            };
          }
        }
      }
    }

    // ── Tier 3: Fuzzy vendor name match ─────────────────────────────────
    if (vendorName) {
      // Use contains for a basic fuzzy match (Prisma doesn't support ILIKE directly on all adapters)
      const byName = await this.prisma.location.findFirst({
        where: {
          companyId,
          type: { in: [LocationType.VENDOR, LocationType.SUPPLIER] },
          isActive: true,
          name: { contains: vendorName, mode: 'insensitive' },
        },
      });

      if (byName) {
        this.logger.log(`Vendor matched by fuzzy name: ${byName.name}`);
        return {
          locationId: byName.id,
          matchType: 'FUZZY_NAME',
          location: { id: byName.id, name: byName.name, code: byName.code, type: byName.type },
        };
      }
    }

    // ── No match: create new VENDOR location ────────────────────────────
    const locationName = vendorStoreNumber && vendorName
      ? `${vendorName} #${vendorStoreNumber}`
      : vendorName ?? 'Unknown Vendor';

    const locationCode = vendorStoreNumber ?? null;

    const metadata: Record<string, any> = {};
    if (input.vendorPhone) metadata.phone = input.vendorPhone;
    if (input.vendorAddress) metadata.address = input.vendorAddress;
    if (input.vendorCity) metadata.city = input.vendorCity;
    if (input.vendorState) metadata.state = input.vendorState;
    if (input.vendorZip) metadata.zip = input.vendorZip;
    if (captureLat != null) metadata.lat = captureLat;
    if (captureLng != null) metadata.lng = captureLng;

    const created = await this.prisma.location.create({
      data: {
        companyId,
        type: LocationType.VENDOR,
        name: locationName,
        code: locationCode,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        isActive: true,
      },
    });

    this.logger.log(`Created new vendor location: ${created.name} (${created.id})`);

    return {
      locationId: created.id,
      matchType: 'CREATED',
      location: { id: created.id, name: created.name, code: created.code, type: created.type },
    };
  }

  /**
   * Get or create a per-user TRANSIT location for will-call materials in transit.
   */
  async getOrCreateTransitLocation(companyId: string, userId: string): Promise<string> {
    const transitCode = `TRANSIT:${userId}`;

    const existing = await this.prisma.location.findFirst({
      where: { companyId, code: transitCode, isActive: true },
    });

    if (existing) return existing.id;

    // Look up user name for display
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Unknown';

    const created = await this.prisma.location.create({
      data: {
        companyId,
        type: LocationType.TRANSIT,
        name: `In Transit – ${userName}`,
        code: transitCode,
        isActive: true,
      },
    });

    this.logger.log(`Created transit location for user ${userId}: ${created.name} (${created.id})`);
    return created.id;
  }
}
