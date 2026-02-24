import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { VendorRegistryService } from "./vendor-registry.service";
import { SupplierCatalogService } from "./supplier-catalog.service";
import { WebScraperProvider } from "./web-scraper.provider";
import type { CatalogProvider, CatalogProduct } from "./catalog-provider.interface";

export interface ComparisonRow {
  catalogItemId: string;
  specHash: string;
  description: string;
  category: string;
  unit: string;
  quotes: Array<{
    vendorCode: string;
    vendorName: string;
    vendorSku: string | null;
    unitPrice: number | null;
    inStock: boolean | null;
    leadTimeDays: number | null;
    productUrl: string | null;
    scrapedAt: Date;
    isBest: boolean;
  }>;
  bestPrice: number | null;
  bestVendor: string | null;
}

@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vendorRegistry: VendorRegistryService,
    private readonly supplierCatalog: SupplierCatalogService,
  ) {}

  /**
   * Get the comparison grid for a set of CatalogItems.
   * Reads existing VendorQuotes — does NOT trigger new scrapes.
   */
  async getComparisonGrid(
    catalogItemIds: string[],
  ): Promise<ComparisonRow[]> {
    if (!catalogItemIds.length) return [];

    const items = await this.prisma.catalogItem.findMany({
      where: { id: { in: catalogItemIds } },
      include: {
        vendorQuotes: {
          include: { vendor: true },
          orderBy: { scrapedAt: "desc" },
        },
      },
    });

    const vendors = await this.vendorRegistry.listVendors();

    return items.map((item) => {
      // Deduplicate quotes: latest per vendor+sku.
      const seen = new Set<string>();
      const latestQuotes = item.vendorQuotes.filter((q) => {
        const key = `${q.vendorId}:${q.vendorSku ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const bestPrice = latestQuotes.reduce<number | null>((min, q) => {
        if (q.unitPrice == null) return min;
        return min == null || q.unitPrice < min ? q.unitPrice : min;
      }, null);

      const quotes = latestQuotes.map((q) => ({
        vendorCode: q.vendor.code,
        vendorName: q.vendor.name,
        vendorSku: q.vendorSku,
        unitPrice: q.unitPrice,
        inStock: q.inStock,
        leadTimeDays: q.leadTimeDays,
        productUrl: q.productUrl,
        scrapedAt: q.scrapedAt,
        isBest:
          bestPrice != null && q.unitPrice != null && q.unitPrice === bestPrice,
      }));

      const bestVendor =
        quotes.find((q) => q.isBest)?.vendorCode ?? null;

      return {
        catalogItemId: item.id,
        specHash: item.specHash,
        description: item.description,
        category: item.category,
        unit: item.unit,
        quotes,
        bestPrice,
        bestVendor,
      };
    });
  }

  /**
   * Shop for a single CatalogItem across all enabled vendors.
   * Triggers live scrapes/API calls and upserts VendorQuotes.
   */
  async shopForItem(
    catalogItemId: string,
    options?: { zipCode?: string },
  ) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: catalogItemId },
      include: {
        vendorQuotes: { select: { vendorId: true, vendorSku: true } },
      },
    });

    if (!item) throw new Error(`CatalogItem ${catalogItemId} not found`);

    const vendors = await this.vendorRegistry.listVendors(true);
    const results: Array<{
      vendorCode: string;
      product: CatalogProduct | null;
      error?: string;
    }> = [];

    for (const vendor of vendors) {
      try {
        const provider = this.resolveProvider(vendor);
        if (!provider || !provider.isEnabled()) {
          results.push({ vendorCode: vendor.code, product: null, error: "provider_disabled" });
          continue;
        }

        // Use existing vendorSku if we have one, otherwise search by description.
        const existingQuote = item.vendorQuotes.find(
          (q) => q.vendorId === vendor.id,
        );
        const searchTerm = existingQuote?.vendorSku ?? item.description;

        const product = await provider.getProduct(searchTerm, options?.zipCode);
        results.push({ vendorCode: vendor.code, product });

        if (product && product.price != null) {
          await this.prisma.vendorQuote.upsert({
            where: {
              catalogItemId_vendorId_vendorSku: {
                catalogItemId: item.id,
                vendorId: vendor.id,
                vendorSku: product.productId ?? searchTerm,
              },
            },
            update: {
              unitPrice: product.price,
              wasPrice: product.wasPrice ?? null,
              inStock: product.inStock ?? null,
              productUrl: product.productUrl ?? null,
              imageUrl: product.imageUrl ?? null,
              scrapedAt: new Date(),
            },
            create: {
              catalogItemId: item.id,
              vendorId: vendor.id,
              vendorSku: product.productId ?? searchTerm,
              unitPrice: product.price,
              wasPrice: product.wasPrice ?? null,
              inStock: product.inStock ?? null,
              productUrl: product.productUrl ?? null,
              imageUrl: product.imageUrl ?? null,
              scrapedAt: new Date(),
            },
          });
        }
      } catch (err: any) {
        results.push({
          vendorCode: vendor.code,
          product: null,
          error: err?.message ?? String(err),
        });
      }
    }

    return { catalogItemId, results };
  }

  /**
   * Shop for all CatalogItems in a BOM (project estimate).
   * Resolves each material SowItem to CatalogItems, then shops each.
   */
  async shopForBom(
    projectId: string,
    estimateVersionId: string,
    options?: { zipCode?: string; catalogItemIds?: string[] },
  ) {
    // If specific catalog item IDs provided, shop those.
    if (options?.catalogItemIds?.length) {
      const results = [];
      for (const id of options.catalogItemIds) {
        const r = await this.shopForItem(id, { zipCode: options.zipCode });
        results.push(r);
      }
      return { projectId, estimateVersionId, results };
    }

    // Otherwise find CatalogItems linked to this project's PriceListItems.
    const linkedItems = await this.prisma.catalogItem.findMany({
      where: {
        priceListItems: {
          some: {
            priceList: { kind: "MASTER", isActive: true },
          },
        },
      },
      select: { id: true },
    });

    const results = [];
    for (const item of linkedItems) {
      const r = await this.shopForItem(item.id, { zipCode: options?.zipCode });
      results.push(r);
    }

    return { projectId, estimateVersionId, results };
  }

  // ── Provider resolution ───────────────────────────────────────────

  private resolveProvider(vendor: any): CatalogProvider | null {
    if (vendor.providerType === "WEB_SCRAPER") {
      const sc = (vendor.scrapeConfig ?? {}) as Record<string, any>;
      const rl = (vendor.rateLimit ?? {}) as Record<string, any>;
      return new WebScraperProvider(
        vendor.code.toLowerCase(),
        vendor.name,
        sc as any,
        rl as any,
      );
    }

    if (
      vendor.providerType === "SERPAPI" ||
      vendor.providerType === "BIGBOX"
    ) {
      // Delegate to existing SupplierCatalogService providers.
      const apiConf = (vendor.apiConfig ?? {}) as Record<string, any>;
      const providerKey = apiConf.providerKey ?? vendor.code.toLowerCase();
      const statuses = this.supplierCatalog.getProviderStatus();
      const found = statuses.find((s) => s.key === providerKey && s.enabled);
      if (!found) return null;
      // Return a thin wrapper that delegates to the existing service.
      return {
        providerKey,
        displayName: vendor.name,
        isEnabled: () => true,
        searchProducts: (q, opts) =>
          this.supplierCatalog.search(providerKey, q, opts),
        getProduct: async (pid, zip) => {
          const result = await this.supplierCatalog.search(providerKey, pid, {
            zipCode: zip,
            pageSize: 1,
          });
          return result.products[0] ?? null;
        },
        getStoreAvailability: (_pid, _zip) =>
          Promise.resolve({
            provider: providerKey,
            productId: _pid,
            zipCode: _zip,
            stores: [],
          }),
      };
    }

    return null;
  }
}
