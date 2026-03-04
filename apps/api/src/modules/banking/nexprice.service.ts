import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { PriceListKind, RegionType, NexPriceConfidence } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriceContribution {
  sku: string;
  description?: string;
  unitPrice: number;
  unit?: string;
  sourceVendor: string;
  /** Resolved region (ZIP3 prefix) */
  regionZip?: string;
  /** The tenant CompanyPriceListItem ID (for back-link tracking) */
  companyPriceListItemId?: string;
  /** The tenant company ID (for contributor counting) */
  companyId?: string;
}

interface NormalizedResult {
  globalItemId: string;
  normalizedPrice: number;
  regionZip: string | null;
  multiplier: number;
  confidence: NexPriceConfidence;
  isNew: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class NexPriceService {
  private readonly logger = new Logger(NexPriceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════════════
  // Core: syncToGlobalMaster
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Single entry point for all price contributions to the global Master
   * Cost Book. Called from:
   *  - HD Pro Xtra CSV import (line items with SKUs)
   *  - Receipt OCR (extracted line items)
   *  - Manual cost book edits (tenant updates unitPrice)
   *  - PETL import (Xactimate lines with cost book back-links)
   *
   * Performs:
   *  1. Region resolution (HD store → ZIP, OCR vendorZip, project fallback)
   *  2. RegionalCostIndex lookup → multiplier
   *  3. Normalize: normalizedPrice = rawPrice / multiplier
   *  4. Upsert to global PriceListItem (MASTER kind)
   *  5. Update contributor count and observation count
   */
  async syncToGlobalMaster(contribution: PriceContribution): Promise<NormalizedResult | null> {
    if (!contribution.sku || !contribution.unitPrice) return null;

    // 1. Find or validate the MASTER price list
    const masterList = await this.getOrCreateMasterPriceList();

    // 2. Resolve region
    const regionZip = contribution.regionZip ?? null;

    // 3. Look up regional multiplier
    const multiplier = regionZip ? await this.getMultiplierForZip3(regionZip) : 1.0;

    // 4. Normalize price
    const normalizedPrice = multiplier > 0 ? contribution.unitPrice / multiplier : contribution.unitPrice;

    // 5. Upsert to global master
    const existing = await this.prisma.priceListItem.findFirst({
      where: {
        priceListId: masterList.id,
        sku: contribution.sku,
        sourceVendor: contribution.sourceVendor,
      },
    });

    let globalItem: { id: string };
    let isNew = false;

    if (existing) {
      // Update existing — weighted average for normalizedPrice
      const prevCount = existing.priceObservationCount || 1;
      const prevNormalized = existing.normalizedPrice ?? normalizedPrice;
      const newCount = prevCount + 1;
      const weightedNormalized = (prevNormalized * prevCount + normalizedPrice) / newCount;

      // Only increment contributorCount if this is a new tenant contributor
      let newContributorCount = existing.contributorCount;
      if (contribution.companyPriceListItemId) {
        const alreadyContributed = await this.prisma.companyPriceListItem.count({
          where: {
            globalPriceListItemId: existing.id,
            companyPriceListId: { not: undefined },
          },
        });
        // Simple heuristic: if the existing contributor count doesn't match,
        // it's a new tenant
        if (alreadyContributed <= existing.contributorCount) {
          newContributorCount = existing.contributorCount + 1;
        }
      }

      globalItem = await this.prisma.priceListItem.update({
        where: { id: existing.id },
        data: {
          lastSeenPrice: contribution.unitPrice,
          lastSeenAt: new Date(),
          normalizedPrice: Math.round(weightedNormalized * 100) / 100,
          regionZip: regionZip ?? existing.regionZip,
          priceObservationCount: newCount,
          contributorCount: newContributorCount,
        },
        select: { id: true },
      });
    } else {
      // Create new global master item — NO tenant-identifying data
      globalItem = await this.prisma.priceListItem.create({
        data: {
          priceListId: masterList.id,
          sku: contribution.sku,
          description: contribution.description,
          unitPrice: contribution.unitPrice,
          unit: contribution.unit,
          sourceVendor: contribution.sourceVendor,
          sourceCategory: "PURCHASE_IMPORT",
          sourceDate: new Date(),
          lastSeenPrice: contribution.unitPrice,
          lastSeenAt: new Date(),
          normalizedPrice: Math.round(normalizedPrice * 100) / 100,
          regionZip: regionZip,
          priceObservationCount: 1,
          contributorCount: 1,
        },
        select: { id: true },
      });
      isNew = true;
    }

    // 6. Update the tenant's CompanyPriceListItem back-link if provided
    if (contribution.companyPriceListItemId) {
      await this.prisma.companyPriceListItem.update({
        where: { id: contribution.companyPriceListItemId },
        data: { globalPriceListItemId: globalItem.id },
      });
    }

    // 7. Compute confidence tier
    const confidence = this.computeConfidence(existing, isNew);

    return {
      globalItemId: globalItem.id,
      normalizedPrice: Math.round(normalizedPrice * 100) / 100,
      regionZip,
      multiplier,
      confidence,
      isNew,
    };
  }

  /**
   * Batch version of syncToGlobalMaster for bulk imports.
   */
  async syncBatchToGlobalMaster(contributions: PriceContribution[]): Promise<{
    synced: number;
    created: number;
    updated: number;
    skipped: number;
  }> {
    let synced = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const contribution of contributions) {
      try {
        const result = await this.syncToGlobalMaster(contribution);
        if (result) {
          synced++;
          if (result.isNew) created++;
          else updated++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to sync SKU ${contribution.sku}: ${err.message}`);
        skipped++;
      }
    }

    this.logger.log(
      `NexPRICE batch sync: ${synced} synced (${created} new, ${updated} updated), ${skipped} skipped`,
    );

    return { synced, created, updated, skipped };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Region resolution
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Resolve a HD store number to its ZIP3 prefix via the HdStoreLocation table.
   */
  async resolveHdStoreRegion(storeNumber: string): Promise<string | null> {
    const store = await this.prisma.hdStoreLocation.findUnique({
      where: { storeNumber },
      select: { zip: true },
    });
    return store ? store.zip.slice(0, 3) : null;
  }

  /**
   * Resolve region for a transaction by trying multiple fallbacks:
   * 1. HD store number → store ZIP → ZIP3
   * 2. OCR vendor ZIP → ZIP3
   * 3. Project address → ZIP3
   */
  async resolveRegionForTransaction(params: {
    storeNumber?: string | null;
    vendorZip?: string | null;
    projectId?: string | null;
  }): Promise<string | null> {
    // 1. HD store lookup
    if (params.storeNumber) {
      const zip3 = await this.resolveHdStoreRegion(params.storeNumber);
      if (zip3) return zip3;
    }

    // 2. OCR vendor ZIP
    if (params.vendorZip && params.vendorZip.length >= 3) {
      return params.vendorZip.slice(0, 3);
    }

    // 3. Project address fallback
    if (params.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: params.projectId },
        select: { postalCode: true },
      });
      if (project?.postalCode && project.postalCode.length >= 3) {
        return project.postalCode.slice(0, 3);
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // RegionalCostIndex lookup
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get the COL multiplier for a ZIP3 prefix. Falls back to 1.0 if no
   * index is found (assumes NYC baseline).
   */
  async getMultiplierForZip3(zip3: string, year?: number): Promise<number> {
    const effectiveYear = year ?? new Date().getFullYear();

    const index = await this.prisma.regionalCostIndex.findUnique({
      where: {
        RegionalCostIndex_region_year_key: {
          regionCode: zip3,
          effectiveYear,
        },
      },
      select: { multiplier: true },
    });

    if (index) return index.multiplier;

    // Fall back to previous year if current year not seeded yet
    const fallback = await this.prisma.regionalCostIndex.findFirst({
      where: { regionCode: zip3 },
      orderBy: { effectiveYear: "desc" },
      select: { multiplier: true },
    });

    return fallback?.multiplier ?? 1.0;
  }

  /**
   * Get the full RegionalCostIndex row for a region.
   */
  async getRegionalCostIndex(regionCode: string, year?: number) {
    const effectiveYear = year ?? new Date().getFullYear();

    return this.prisma.regionalCostIndex.findFirst({
      where: { regionCode, effectiveYear: { lte: effectiveYear } },
      orderBy: { effectiveYear: "desc" },
    });
  }

  /**
   * List all regional cost indices (for admin/display).
   */
  async listRegionalCostIndices(filters?: {
    regionType?: RegionType;
    year?: number;
  }) {
    const where: any = {};
    if (filters?.regionType) where.regionType = filters.regionType;
    if (filters?.year) where.effectiveYear = filters.year;

    return this.prisma.regionalCostIndex.findMany({
      where,
      orderBy: [{ regionType: "asc" }, { regionCode: "asc" }],
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Cost book seeding (NexPRICE Seed product)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Seed a tenant's cost book from the global Master Cost Book, localizing
   * prices to the tenant's region. This is the NexPRICE Seed product.
   */
  async seedTenantCostBook(
    companyId: string,
    companyPriceListId: string,
    tenantZip3: string,
  ): Promise<{ seeded: number; skipped: number }> {
    const masterList = await this.getOrCreateMasterPriceList();
    const tenantMultiplier = await this.getMultiplierForZip3(tenantZip3);

    // Get all master items that originated from purchases
    const masterItems = await this.prisma.priceListItem.findMany({
      where: {
        priceListId: masterList.id,
        sourceCategory: "PURCHASE_IMPORT",
        sku: { not: null },
        normalizedPrice: { not: null },
      },
      select: {
        id: true,
        sku: true,
        description: true,
        unit: true,
        unitPrice: true,
        normalizedPrice: true,
        sourceVendor: true,
      },
    });

    let seeded = 0;
    let skipped = 0;

    for (const item of masterItems) {
      // Check if tenant already has this SKU
      const exists = await this.prisma.companyPriceListItem.findFirst({
        where: {
          companyPriceListId,
          sku: item.sku,
        },
      });

      if (exists) {
        skipped++;
        continue;
      }

      // Localize price: normalizedPrice × tenantMultiplier
      const localizedPrice = item.normalizedPrice
        ? Math.round(item.normalizedPrice * tenantMultiplier * 100) / 100
        : item.unitPrice;

      await this.prisma.companyPriceListItem.create({
        data: {
          companyPriceListId,
          sku: item.sku,
          description: item.description,
          unit: item.unit,
          unitPrice: localizedPrice,
          sourceVendor: item.sourceVendor,
          sourceDate: new Date(),
          globalPriceListItemId: item.id,
          regionZip: tenantZip3,
          localizedPrice,
        },
      });
      seeded++;
    }

    this.logger.log(
      `NexPRICE seed: ${seeded} items seeded, ${skipped} already existed for company ${companyId}`,
    );

    return { seeded, skipped };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Confidence computation
  // ═══════════════════════════════════════════════════════════════════

  private computeConfidence(
    existing: { priceObservationCount: number; contributorCount: number } | null,
    isNew: boolean,
  ): NexPriceConfidence {
    if (isNew || !existing) return NexPriceConfidence.LOW;

    const obs = existing.priceObservationCount + 1;
    const contributors = existing.contributorCount;

    // HIGH: 3+ observations, 2+ contributors
    if (obs >= 3 && contributors >= 2) return NexPriceConfidence.HIGH;

    // MEDIUM: 2+ observations or 2+ contributors
    if (obs >= 2 || contributors >= 2) return NexPriceConfidence.MEDIUM;

    return NexPriceConfidence.LOW;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Master price list helper
  // ═══════════════════════════════════════════════════════════════════

  private async getOrCreateMasterPriceList() {
    let masterList = await this.prisma.priceList.findFirst({
      where: { kind: PriceListKind.MASTER, isActive: true },
      select: { id: true },
    });

    if (!masterList) {
      masterList = await this.prisma.priceList.create({
        data: {
          kind: PriceListKind.MASTER,
          label: "NEXUS SYSTEM Master Cost Book",
          revision: 1,
          isActive: true,
        },
        select: { id: true },
      });
      this.logger.log("Created NEXUS SYSTEM Master Cost Book price list");
    }

    return masterList;
  }
}
