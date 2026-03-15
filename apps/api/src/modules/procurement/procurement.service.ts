import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SupplierCatalogService } from '../supplier-catalog/supplier-catalog.service';
import { CbaEngineService, type SupplierPricing } from './cba-engine.service';
import {
  SupplierOptimizerService,
  type ItemPricing,
  type SupplierInfo,
  type SupplierProductDetail,
  type TripPlan,
} from './supplier-optimizer.service';
import { ProductIntelligenceService } from './product-intelligence.service';
import {
  normalizeMaterialKey,
  materialKeyToSearchQuery,
} from '@repo/database';
import type {
  ShoppingCartStatus,
  ShoppingCartHorizon,
  ShoppingCartItemStatus,
} from '@prisma/client';
import { normalizePricing, normalizeUnit, type NormalizedPricing, type CoverageInfo } from './coverage-extractor';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateCartDto {
  companyId: string;
  projectId: string;
  createdByUserId?: string;
  label?: string;
  horizon?: ShoppingCartHorizon;
  horizonDate?: Date;
  notes?: string;
}

export interface AddCartItemDto {
  sowItemId?: string;
  costBookItemId?: string;
  description: string;
  unit?: string;
  unitPrice?: number;
  projectNeedQty: number;
  cartQty: number;
  roomParticleId?: string;
}

export interface CbaRunResult {
  cartId: string;
  itemsSearched: number;
  tripPlans: TripPlan[];
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: SupplierCatalogService,
    private readonly cbaEngine: CbaEngineService,
    private readonly optimizer: SupplierOptimizerService,
    private readonly productIntelligence: ProductIntelligenceService,
  ) {}

  // ─── Tenant-wide Cart Listing ──────────────────────────────────────────

  async listAllCartsForCompany(
    companyId: string,
    filters?: { statuses?: string[]; includeCompleted?: boolean },
  ) {
    const statusFilter = filters?.statuses?.length
      ? filters.statuses
      : filters?.includeCompleted
        ? undefined // no filter = all statuses
        : ['DRAFT', 'READY', 'IN_PROGRESS']; // default: open carts

    const carts = await this.prisma.shoppingCart.findMany({
      where: {
        companyId,
        ...(statusFilter ? { status: { in: statusFilter as any } } : {}),
      },
      include: {
        project: { select: { id: true, name: true, city: true, state: true } },
        createdBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return carts.map((c) => ({
      id: c.id,
      companyId: c.companyId,
      projectId: c.projectId,
      projectName: c.project.name,
      projectCity: c.project.city,
      projectState: c.project.state,
      label: c.label,
      status: c.status,
      horizon: c.horizon,
      horizonDate: c.horizonDate,
      notes: c.notes,
      itemCount: c._count.items,
      createdBy: c.createdBy
        ? `${c.createdBy.firstName ?? ''} ${c.createdBy.lastName ?? ''}`.trim() || c.createdBy.email
        : null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  // ─── Consolidated Purchase ────────────────────────────────────────────────

  async consolidatePurchase(companyId: string, cartIds: string[]) {
    if (!cartIds.length) return { cartCount: 0, projectCount: 0, lines: [], totalItems: 0, totalEstimatedCost: 0 };

    // Fetch all carts + items, verifying company ownership
    const carts = await this.prisma.shoppingCart.findMany({
      where: { id: { in: cartIds }, companyId },
      include: {
        project: { select: { id: true, name: true, postalCode: true } },
        items: { include: { pricingSnapshots: true } },
      },
    });

    // Build project lookup
    const projectMap = new Map<string, string>();
    for (const cart of carts) {
      projectMap.set(cart.projectId, cart.project.name);
    }

    // Consolidate items by normalizedKey
    const consolidated = new Map<string, {
      normalizedKey: string;
      description: string;
      unit: string | null;
      totalQty: number;
      bestKnownPrice: number | null;
      bestSupplierName: string | null;
      purchaseUnit: string | null;
      coveragePerPurchaseUnit: number | null;
      totalPurchaseQty: number | null;
      coverageConfidence: string | null;
      allocations: Array<{
        projectId: string;
        projectName: string;
        cartId: string;
        cartLabel: string | null;
        qty: number;
        itemId: string;
      }>;
    }>();

    for (const cart of carts) {
      for (const item of cart.items) {
        const key = item.normalizedKey;
        const existing = consolidated.get(key);
        const allocation = {
          projectId: cart.projectId,
          projectName: cart.project.name,
          cartId: cart.id,
          cartLabel: cart.label,
          qty: item.cartQty,
          itemId: item.id,
        };

        if (existing) {
          existing.totalQty += item.cartQty;
          // Accumulate purchase quantities when available
          if (item.purchaseQty != null) {
            existing.totalPurchaseQty = (existing.totalPurchaseQty ?? 0) + item.purchaseQty;
          }
          existing.allocations.push(allocation);
          // Update best price if this item has a better one
          if (item.bestUnitPrice != null && (existing.bestKnownPrice == null || item.bestUnitPrice < existing.bestKnownPrice)) {
            existing.bestKnownPrice = item.bestUnitPrice;
            existing.bestSupplierName = item.bestSupplierName;
            existing.purchaseUnit = item.purchaseUnit;
            existing.coveragePerPurchaseUnit = item.coveragePerPurchaseUnit;
            existing.coverageConfidence = item.coverageConfidence;
          }
        } else {
          consolidated.set(key, {
            normalizedKey: key,
            description: item.description,
            unit: item.unit,
            totalQty: item.cartQty,
            bestKnownPrice: item.bestUnitPrice,
            bestSupplierName: item.bestSupplierName,
            purchaseUnit: item.purchaseUnit,
            coveragePerPurchaseUnit: item.coveragePerPurchaseUnit,
            totalPurchaseQty: item.purchaseQty,
            coverageConfidence: item.coverageConfidence,
            allocations: [allocation],
          });
        }
      }
    }

    const lines = Array.from(consolidated.values()).sort((a, b) => b.totalQty - a.totalQty);
    const totalEstimatedCost = lines.reduce(
      (sum, l) => sum + (l.bestKnownPrice ?? 0) * l.totalQty,
      0,
    );

    return {
      cartCount: carts.length,
      projectCount: projectMap.size,
      totalItems: lines.length,
      totalEstimatedCost,
      lines,
    };
  }

  // ─── Cart CRUD ───────────────────────────────────────────────────────────

  async listCarts(projectId: string) {
    return this.prisma.shoppingCart.findMany({
      where: { projectId },
      include: {
        items: { select: { id: true, normalizedKey: true, cartQty: true, purchasedQty: true, status: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCart(cartId: string) {
    const cart = await this.prisma.shoppingCart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: { pricingSnapshots: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  async createCart(dto: CreateCartDto) {
    // Always resolve companyId from the project to avoid stale JWT tokens
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { companyId: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.shoppingCart.create({
      data: {
        companyId: project.companyId,
        projectId: dto.projectId,
        createdByUserId: dto.createdByUserId,
        label: dto.label,
        horizon: dto.horizon ?? 'TODAY',
        horizonDate: dto.horizonDate,
        notes: dto.notes,
      },
    });
  }

  async updateCart(cartId: string, data: Partial<{ label: string; status: ShoppingCartStatus; horizon: ShoppingCartHorizon; horizonDate: Date; notes: string }>) {
    return this.prisma.shoppingCart.update({
      where: { id: cartId },
      data,
    });
  }

  async deleteCart(cartId: string) {
    return this.prisma.shoppingCart.delete({ where: { id: cartId } });
  }

  // ─── Cart Items ──────────────────────────────────────────────────────────

  async addItem(cartId: string, dto: AddCartItemDto) {
    const normalizedKey = normalizeMaterialKey(dto.description) ?? dto.description.toLowerCase().replace(/\s+/g, '-');

    return this.prisma.shoppingCartItem.create({
      data: {
        cartId,
        sowItemId: dto.sowItemId,
        costBookItemId: dto.costBookItemId,
        normalizedKey,
        description: dto.description,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        projectNeedQty: dto.projectNeedQty,
        cartQty: dto.cartQty,
        roomParticleId: dto.roomParticleId,
      },
    });
  }

  async updateItem(itemId: string, data: Partial<{ cartQty: number; status: ShoppingCartItemStatus; purchasedQty: number }>) {
    return this.prisma.shoppingCartItem.update({
      where: { id: itemId },
      data,
    });
  }

  async deleteItem(itemId: string) {
    return this.prisma.shoppingCartItem.delete({ where: { id: itemId } });
  }

  async recordPurchase(itemId: string, purchasedQty: number) {
    const item = await this.prisma.shoppingCartItem.update({
      where: { id: itemId },
      data: {
        purchasedQty,
        status: purchasedQty >= (await this.prisma.shoppingCartItem.findUnique({ where: { id: itemId } }))!.cartQty
          ? 'PURCHASED'
          : 'SOURCED',
      },
      include: { cart: true },
    });

    // Update drawdown ledger
    await this.upsertDrawdownLedger(item.cart.companyId, item.cart.projectId, item.normalizedKey, item.description, item.unit);

    return item;
  }

  // ─── PETL → Cart Population ──────────────────────────────────────────────

  async populateFromPetl(
    cartId: string,
    options?: { roomParticleId?: string; categoryCode?: string },
  ) {
    const cart = await this.prisma.shoppingCart.findUniqueOrThrow({
      where: { id: cartId },
    });

    // Find the latest estimate version for this project
    const latestEstimate = await this.prisma.estimateVersion.findFirst({
      where: { projectId: cart.projectId, status: 'ACTIVE' },
      orderBy: { sequenceNo: 'desc' },
    });
    if (!latestEstimate) {
      this.logger.warn(`No active estimate for project ${cart.projectId}`);
      return { added: 0 };
    }

    // Fetch SowItems with material content
    const whereClause: any = {
      estimateVersionId: latestEstimate.id,
      materialAmount: { not: null, gt: 0 },
    };
    if (options?.roomParticleId) {
      whereClause.projectParticleId = options.roomParticleId;
    }
    if (options?.categoryCode) {
      whereClause.categoryCode = options.categoryCode;
    }

    const sowItems = await this.prisma.sowItem.findMany({
      where: whereClause,
      select: {
        id: true,
        description: true,
        qty: true,
        unit: true,
        unitCost: true,
        materialAmount: true,
        projectParticleId: true,
      },
    });

    // Consolidate by normalized key
    const consolidated = new Map<string, {
      sowItemIds: string[];
      description: string;
      unit: string | null;
      unitPrice: number | null;
      totalQty: number;
      roomParticleId: string | null;
    }>();

    for (const item of sowItems) {
      const key = normalizeMaterialKey(item.description);
      if (!key) continue; // Pure labor line

      const existing = consolidated.get(key);
      if (existing) {
        existing.sowItemIds.push(item.id);
        existing.totalQty += item.qty ?? 0;
      } else {
        consolidated.set(key, {
          sowItemIds: [item.id],
          description: item.description,
          unit: item.unit,
          unitPrice: item.unitCost,
          totalQty: item.qty ?? 0,
          roomParticleId: item.projectParticleId,
        });
      }
    }

    // Create cart items (one per consolidated material)
    let added = 0;
    for (const [key, mat] of consolidated) {
      await this.prisma.shoppingCartItem.create({
        data: {
          cartId,
          sowItemId: mat.sowItemIds[0], // link to first SowItem
          normalizedKey: key,
          description: mat.description,
          unit: mat.unit,
          unitPrice: mat.unitPrice,
          projectNeedQty: mat.totalQty,
          cartQty: mat.totalQty, // default: full project need
          roomParticleId: mat.roomParticleId,
        },
      });
      added++;
    }

    this.logger.log(
      `Populated cart ${cartId} with ${added} materials from ${sowItems.length} PETL lines`,
    );

    return { added, totalPetlLines: sowItems.length };
  }

  // ─── CBA + Optimizer ─────────────────────────────────────────────────────

  async runCba(cartId: string, zipCode?: string): Promise<CbaRunResult> {
    const cart = await this.prisma.shoppingCart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: true,
        project: { select: { latitude: true, longitude: true, postalCode: true } },
      },
    });

    const zip = zipCode ?? cart.project.postalCode ?? undefined;
    const projectLat = cart.project.latitude;
    const projectLng = cart.project.longitude;

    if (!zip) {
      this.logger.warn('No ZIP code available for CBA — skipping supplier search');
      return { cartId, itemsSearched: 0, tripPlans: [] };
    }

    // Search each item across all providers
    const allSupplierInfos = new Map<string, SupplierInfo>();
    const itemPricings: ItemPricing[] = [];

    for (const item of cart.items) {
      // Use the normalized key to build a search query
      const searchQuery = materialKeyToSearchQuery(item.normalizedKey);
      if (!searchQuery) continue;

      // Search all providers
      const results = await this.catalogService.searchAll(searchQuery, { zipCode: zip });

      const supplierPrices: Record<string, number | null> = {};
      const supplierProducts: Record<string, SupplierProductDetail> = {};
      let bestNormalized: NormalizedPricing | null = null;

      for (const result of results) {
        if (result.products.length === 0) continue;

        // Filter for relevance before selecting cheapest.
        // Prevents wrong products (R-49 when searching R-13, car battery kit, etc.).
        const relevant = result.products.filter(p =>
          isProductRelevant(p.title ?? '', searchQuery),
        );
        if (relevant.length === 0) {
          this.logger.warn(`[CBA] No relevant products from ${result.provider} for "${searchQuery}"`);
          continue;
        }

        // Take the best-priced relevant product from each provider
        const cheapest = relevant.reduce((best, p) =>
          (p.price ?? Infinity) < (best.price ?? Infinity) ? p : best,
        );

        if (cheapest.price == null) continue;

        // ── Product Detail Enrichment ──────────────────────────────────────
        // Search results lack rawJson.specifications (coverage, package qty).
        // Fetch full product detail for the cheapest hit so the coverage
        // extractor can use Tier 1 (spec-sheet) data.
        let enrichedProduct = cheapest;
        try {
          const detail = await this.catalogService.getProduct(
            result.provider,
            cheapest.productId,
            zip,
          );
          if (detail) {
            // Preserve the search-result price if detail price is missing
            enrichedProduct = {
              ...detail,
              price: detail.price ?? cheapest.price,
            };
          }
        } catch (err) {
          this.logger.warn(`Product detail enrichment failed for ${cheapest.productId}: ${err}`);
        }

        // ── Tier 0: Fingerprint Lookup ──────────────────────────────────────
        // Check if we already have verified coverage for this product.
        const t0Start = Date.now();
        const fingerprint = await this.productIntelligence.lookupFingerprint(
          cart.companyId,
          result.provider,
          enrichedProduct.productId,
        );

        let normalized: NormalizedPricing | null = null;
        let fingerprintHit = false;

        if (
          fingerprint?.coverageValue &&
          fingerprint.coverageUnit &&
          fingerprint.purchaseUnitLabel
        ) {
          // Tier 0 hit — use fingerprint coverage, skip live extraction
          fingerprintHit = true;
          const fpCoverage: CoverageInfo = {
            coverageValue: fingerprint.coverageValue,
            coverageUnit: fingerprint.coverageUnit,
            purchaseUnitLabel: fingerprint.purchaseUnitLabel,
            confidence: fingerprint.confidence === 'VERIFIED' || fingerprint.confidence === 'BANK_CONFIRMED' || fingerprint.confidence === 'RECEIPT'
              ? 'HIGH' : fingerprint.confidence === 'HD_PRO_XTRA' || fingerprint.confidence === 'HIGH'
              ? 'HIGH' : fingerprint.confidence === 'MEDIUM' ? 'MEDIUM' : 'LOW',
            source: 'SPEC_SHEET', // Treat fingerprint as highest-quality source
          };
          const purchaseQty = Math.ceil(item.cartQty / fpCoverage.coverageValue);
          normalized = {
            purchaseQty,
            pricePerPurchaseUnit: enrichedProduct.price!,
            effectiveUnitPrice: enrichedProduct.price! / fpCoverage.coverageValue,
            totalCost: purchaseQty * enrichedProduct.price!,
            coverage: fpCoverage,
          };
          this.logger.log(
            `[CBA-TIER0] ${result.provider} | FINGERPRINT HIT for ${enrichedProduct.productId} ` +
            `(${fingerprint.confidence}) → coverage=${fpCoverage.coverageValue} ${fpCoverage.coverageUnit}`,
          );
        } else {
          // ── Standard Tier 1-3 Extraction ────────────────────────────────
          const hasSpecs = !!enrichedProduct.rawJson?.specifications;
          const specs = enrichedProduct.rawJson?.specifications;
          this.logger.log(
            `[CBA-COVERAGE] ${result.provider} | productId=${enrichedProduct.productId} | ` +
            `title="${(enrichedProduct.title ?? '').slice(0, 80)}" | price=$${enrichedProduct.price} | ` +
            `hasSpecs=${hasSpecs} | specs=${hasSpecs ? JSON.stringify(Array.isArray(specs) ? specs.slice(0, 6) : specs).slice(0, 500) : 'none'}`,
          );
          normalized = normalizePricing(enrichedProduct, item.cartQty, item.unit);
        }
        this.logger.log(
          `[CBA-COVERAGE] ${result.provider} | normalized=${normalized ? `coverage=${normalized.coverage.coverageValue} ${normalized.coverage.coverageUnit}/${normalized.coverage.purchaseUnitLabel} (${normalized.coverage.source}/${normalized.coverage.confidence}) → purchaseQty=${normalized.purchaseQty} × $${normalized.pricePerPurchaseUnit} = $${normalized.totalCost}` : 'NULL (fallback to raw price)'}`,
        );

        // ── NexPRINT Telemetry + Recording ──────────────────────────────────
        const extractionDuration = Date.now() - t0Start;
        const extractionTier = fingerprintHit ? 0 : normalized?.coverage.source === 'SPEC_SHEET' ? 1 : normalized?.coverage.source === 'TITLE_PARSE' ? 2 : normalized?.coverage.source === 'HEURISTIC' ? 3 : -1;
        this.productIntelligence.logExtraction(
          cart.companyId,
          enrichedProduct.title ?? '',
          result.provider,
          item.unit ?? 'EA',
          extractionTier,
          normalized?.coverage.coverageValue ?? null,
          normalized?.coverage.confidence ?? null,
          fingerprintHit,
          extractionDuration,
        );

        // Record CBA extraction as fingerprint (Path 3 — won't downgrade)
        if (!fingerprintHit && enrichedProduct.price != null) {
          void this.productIntelligence.recordCbaExtraction(
            cart.companyId,
            result.provider,
            enrichedProduct.productId,
            enrichedProduct.title ?? '',
            enrichedProduct.price,
            item.cartQty,
            normalized?.coverage ?? null,
          );
        }

        // For the optimizer: use the effective $/project-unit when available.
        // When normalization fails and the project unit is area/length-based,
        // the raw per-purchase-unit price is NOT comparable — skip this supplier
        // to avoid absurd line totals (e.g., $56.67/bag × 557.98 SF = $31k).
        if (normalized) {
          supplierPrices[result.provider] = normalized.effectiveUnitPrice;
        } else {
          const projUnit = normalizeUnit(item.unit);
          if (!projUnit || projUnit === 'EA') {
            // Per-each items: raw price is usable as-is
            supplierPrices[result.provider] = cheapest.price;
          } else {
            this.logger.warn(
              `[CBA] Skipping ${result.provider} for "${item.description}" — ` +
              `cannot normalize $${cheapest.price}/pkg to $/${projUnit}`,
            );
          }
        }

        // Track the best normalization result for this item
        if (normalized && (!bestNormalized || normalized.effectiveUnitPrice < bestNormalized.effectiveUnitPrice)) {
          bestNormalized = normalized;
        }

        // If this supplier was excluded from pricing (normalization failed for
        // area/length units), skip snapshot + best-supplier update entirely.
        if (supplierPrices[result.provider] == null) continue;

        // Capture product details for trip plan display
        supplierProducts[result.provider] = {
          productId: enrichedProduct.productId,
          title: enrichedProduct.title ?? '',
          modelNumber: enrichedProduct.modelNumber,
          productUrl: enrichedProduct.productUrl,
          pricePerPurchaseUnit: cheapest.price!,
          coveragePerPurchaseUnit: normalized?.coverage.coverageValue,
          purchaseUnit: normalized?.coverage.purchaseUnitLabel,
          purchaseQty: normalized?.purchaseQty,
          coverageConfidence: normalized?.coverage.confidence,
          stockQty: enrichedProduct.stockQty,
          inStock: enrichedProduct.inStock,
        };

        // Determine distance and fulfillment type
        const isOnline = cheapest.fulfillmentType === 'SHIP_TO_SITE';
        let distanceMiles = isOnline ? 0 : 15; // 0 for online, 15mi fallback for local

        const supplierDisplayName = isOnline
          ? (cheapest.brand ? `Amazon (${cheapest.brand})` : 'Amazon')
          : (cheapest.storeName ?? result.provider);
        const supplierAddr = isOnline ? undefined : cheapest.storeAddress;

        if (!allSupplierInfos.has(result.provider)) {
          allSupplierInfos.set(result.provider, {
            key: result.provider,
            name: supplierDisplayName,
            address: supplierAddr,
            distanceMiles,
            fulfillmentType: cheapest.fulfillmentType,
            shippingCost: cheapest.shippingCost,
            freeShipping: cheapest.freeShipping,
            leadTimeDays: cheapest.leadTimeDays ?? cheapest.deliveryMaxDays,
          });
        }

        // Save pricing snapshot with normalized data
        const snapshotPurchaseQty = normalized?.purchaseQty ?? null;
        const snapshotTotalPrice = normalized
          ? normalized.totalCost
          : cheapest.price * item.cartQty;

        await this.prisma.shoppingCartPricingSnapshot.create({
          data: {
            cartItemId: item.id,
            supplierKey: result.provider,
            supplierName: supplierDisplayName,
            supplierAddress: supplierAddr,
            distanceMiles,
            unitPrice: cheapest.price,
            totalPrice: snapshotTotalPrice,
            availabilityStatus: cheapest.availabilityStatus ?? null,
            leadTimeDays: cheapest.leadTimeDays ?? null,
            shippingCost: cheapest.shippingCost ?? null,
            fulfillmentType: cheapest.fulfillmentType ?? null,
            deliveryMinDays: cheapest.deliveryMinDays ?? null,
            deliveryMaxDays: cheapest.deliveryMaxDays ?? null,
            deliveryEstimate: cheapest.deliveryEstimate ?? null,
            // Coverage normalization fields
            purchaseUnit: normalized?.coverage.purchaseUnitLabel ?? null,
            coveragePerPurchaseUnit: normalized?.coverage.coverageValue ?? null,
            purchaseQty: snapshotPurchaseQty,
            normalizedUnitPrice: normalized?.effectiveUnitPrice ?? null,
          },
        });

        // Update best supplier on item if this is cheapest (use effective $/unit)
        const effectivePrice = normalized?.effectiveUnitPrice ?? cheapest.price;
        if (!item.bestUnitPrice || effectivePrice < item.bestUnitPrice) {
          await this.prisma.shoppingCartItem.update({
            where: { id: item.id },
            data: {
              bestSupplierKey: result.provider,
              bestSupplierName: supplierDisplayName,
              bestUnitPrice: effectivePrice,
              fulfillmentType: cheapest.fulfillmentType ?? null,
              status: 'SOURCED',
              // Coverage normalization fields
              purchaseUnit: normalized?.coverage.purchaseUnitLabel ?? null,
              coveragePerPurchaseUnit: normalized?.coverage.coverageValue ?? null,
              purchaseQty: normalized?.purchaseQty ?? null,
              effectiveUnitPrice: normalized?.effectiveUnitPrice ?? null,
              coverageConfidence: normalized?.coverage.confidence ?? 'UNRESOLVED',
            },
          });
        }
      }

      // ── Outlier Detection ───────────────────────────────────────────────
      // If any supplier's effective $/unit deviates >3× from the median,
      // it's almost certainly a normalization failure (e.g., multiplied a
      // bundle price by the per-batt coverage). Exclude it.
      const pricedKeys = Object.entries(supplierPrices).filter(([_, p]) => p != null) as [string, number][];
      if (pricedKeys.length >= 2) {
        const sorted = [...pricedKeys].sort((a, b) => a[1] - b[1]);
        const median = sorted[Math.floor(sorted.length / 2)][1];
        for (const [key, price] of pricedKeys) {
          if (price > median * 3) {
            this.logger.warn(
              `[CBA-OUTLIER] ${key} for "${item.description}": ` +
              `$${price.toFixed(4)}/unit is ${(price / median).toFixed(1)}× the median ` +
              `($${median.toFixed(4)}/unit). Excluding as likely normalization error.`,
            );
            delete supplierPrices[key];
            delete supplierProducts[key];
          }
        }
      }

      if (Object.keys(supplierPrices).length > 0) {
        itemPricings.push({
          cartItemId: item.id,
          description: item.description,
          quantity: item.cartQty,
          supplierPrices,
          supplierProducts,
        });
      }
    }

    // Run multi-supplier optimization
    const tripPlans = this.optimizer.optimize(
      itemPricings,
      Array.from(allSupplierInfos.values()),
    );

    // Update cart status
    await this.prisma.shoppingCart.update({
      where: { id: cartId },
      data: { status: 'READY' },
    });

    return {
      cartId,
      itemsSearched: itemPricings.length,
      tripPlans,
    };
  }

  // ─── Drawdown Ledger ─────────────────────────────────────────────────────

  async getDrawdown(projectId: string) {
    return this.prisma.materialDrawdownLedger.findMany({
      where: { projectId },
      orderBy: { normalizedKey: 'asc' },
    });
  }

  async upsertDrawdownLedger(
    companyId: string,
    projectId: string,
    normalizedKey: string,
    description: string,
    unit: string | null,
  ) {
    // Aggregate from all carts for this project + material
    const agg = await this.prisma.shoppingCartItem.aggregate({
      where: {
        normalizedKey,
        cart: { projectId },
      },
      _sum: {
        projectNeedQty: true,
        cartQty: true,
        purchasedQty: true,
      },
    });

    const totalProjectNeed = agg._sum.projectNeedQty ?? 0;
    const totalOrdered = agg._sum.cartQty ?? 0;
    const totalPurchased = agg._sum.purchasedQty ?? 0;

    await this.prisma.materialDrawdownLedger.upsert({
      where: {
        MaterialDrawdown_company_project_key: {
          companyId,
          projectId,
          normalizedKey,
        },
      },
      create: {
        companyId,
        projectId,
        normalizedKey,
        description,
        unit,
        totalProjectNeed,
        totalOrdered,
        totalPurchased,
        variance: totalPurchased - totalProjectNeed,
      },
      update: {
        totalProjectNeed,
        totalOrdered,
        totalPurchased,
        variance: totalPurchased - totalProjectNeed,
      },
    });
  }
  // ─── Receipt Reconciliation Bridge ──────────────────────────────────────

  /**
   * Called after a RECEIPT_EXPENSE daily log is promoted to inventory.
   * Matches OCR line items to open cart items by normalizedKey and updates
   * purchasedQty + drawdown ledger.
   */
  async reconcileFromReceipt(
    companyId: string,
    projectId: string,
    lineItems: Array<{ description: string; qty?: number | null }>,
  ): Promise<{ matched: number; unmatched: number }> {
    let matched = 0;
    let unmatched = 0;

    for (const line of lineItems) {
      const key = normalizeMaterialKey(line.description);
      if (!key) {
        unmatched++;
        continue;
      }

      // Find open cart items for this project + material
      const cartItem = await this.prisma.shoppingCartItem.findFirst({
        where: {
          normalizedKey: key,
          cart: { projectId, status: { in: ['DRAFT', 'READY', 'IN_PROGRESS'] } },
          status: { in: ['PENDING', 'SOURCED'] },
        },
        include: { cart: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!cartItem) {
        unmatched++;
        continue;
      }

      const qty = Math.abs(line.qty ?? 1);
      const newPurchasedQty = cartItem.purchasedQty + qty;

      await this.prisma.shoppingCartItem.update({
        where: { id: cartItem.id },
        data: {
          purchasedQty: newPurchasedQty,
          status: newPurchasedQty >= cartItem.cartQty ? 'PURCHASED' : 'SOURCED',
        },
      });

      await this.upsertDrawdownLedger(
        companyId,
        projectId,
        key,
        cartItem.description,
        cartItem.unit,
      );

      matched++;
    }

    this.logger.log(
      `Receipt reconciliation for project ${projectId}: ${matched} matched, ${unmatched} unmatched`,
    );

    return { matched, unmatched };
  }
}

// ── Product Relevance ────────────────────────────────────────────────────────

/**
 * Basic relevance check: ensure the product matches the search query.
 * Prevents wrong products (R-49 when searching R-13, car battery kit, etc.).
 */
function isProductRelevant(title: string, searchQuery: string): boolean {
  const titleLower = title.toLowerCase();
  const queryLower = searchQuery.toLowerCase();

  // 1. R-value / grade mismatch check (insulation, wire gauge, etc.)
  //    If the query specifies an R-value, the product must match.
  const queryRValue = queryLower.match(/\br[- ]?(\d+)\b/);
  if (queryRValue) {
    const titleRValue = titleLower.match(/\br[- ]?(\d+)\b/);
    if (titleRValue && titleRValue[1] !== queryRValue[1]) {
      return false; // R-value mismatch
    }
  }

  // 2. Non-construction context rejection.
  //    Products from automotive, electronics, etc. that share construction terms
  //    (e.g., "battery insulation blanket", "phone case tile pattern").
  const nonConstructionContexts = [
    /\bbatter(?:y|ies)\b/, /\bcar\b/, /\bvehicle\b/, /\bautomotive\b/,
    /\btruck\b/, /\bmotorcycle\b/, /\bboat\b/, /\bphone\b/, /\blaptop\b/,
    /\bcooler\b.*\bbag\b/, /\bpet\b.*\bhouse\b/, /\bdog\b/, /\bcat\b/,
    /\bcamping\b/, /\bsleeping\s*bag\b/,
  ];
  if (nonConstructionContexts.some(re => re.test(titleLower))) {
    return false;
  }

  // 3. Category mismatch: reject obviously wrong product categories.
  const constructionTerms = [
    'insulation', 'batt', 'fiberglass', 'drywall', 'plywood', 'lumber',
    'shingle', 'roofing', 'paint', 'concrete', 'mortar', 'flooring',
    'tile', 'screw', 'nail', 'pipe', 'wire', 'conduit', 'tape',
    'caulk', 'sealant', 'primer', 'stain', 'board', 'panel', 'sheathing',
    'mineral wool', 'rockwool', 'foam', 'kraft', 'faced', 'unfaced',
  ];
  const queryHasConstruction = constructionTerms.some(t => queryLower.includes(t));
  if (queryHasConstruction) {
    const titleHasConstruction = constructionTerms.some(t => titleLower.includes(t));
    if (!titleHasConstruction) return false;
  }

  // 4. Keyword overlap: at least 30% of meaningful query words appear in title
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0) return true;
  const matches = queryWords.filter(w => titleLower.includes(w));
  return matches.length >= Math.max(2, Math.ceil(queryWords.length * 0.3));
}

// ── Haversine ────────────────────────────────────────────────────────────────

function haversineMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
