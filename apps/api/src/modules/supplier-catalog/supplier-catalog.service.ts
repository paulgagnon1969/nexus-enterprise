import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { BigBoxProvider } from "./bigbox.provider";
import { LowesProvider } from "./lowes.provider";
import type {
  CatalogProvider,
  CatalogProduct,
  CatalogSearchResult,
  CatalogSearchOptions,
  StoreAvailability,
} from "./catalog-provider.interface";

/** CostBook comparison result. */
export interface PriceComparison {
  catalogProduct: CatalogProduct;
  costBookMatch: {
    id: string;
    description: string;
    cat: string | null;
    sel: string | null;
    unitPrice: number | null;
    unit: string | null;
  } | null;
  /** Positive = catalog is more expensive, negative = catalog is cheaper. */
  priceDifference: number | null;
  /** e.g. +12.5% or -8.3% */
  percentDifference: number | null;
}

@Injectable()
export class SupplierCatalogService {
  private readonly logger = new Logger(SupplierCatalogService.name);
  private readonly providers: Map<string, CatalogProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bigBox: BigBoxProvider,
    private readonly lowes: LowesProvider,
  ) {
    this.providers = new Map<string, CatalogProvider>([
      [this.bigBox.providerKey, this.bigBox],
      [this.lowes.providerKey, this.lowes],
    ]);
  }

  // -------------------------------------------------------------------------
  // Provider Discovery
  // -------------------------------------------------------------------------

  /** Get status of all registered providers. */
  getProviderStatus() {
    const statuses: Array<{
      key: string;
      name: string;
      enabled: boolean;
    }> = [];

    for (const p of this.providers.values()) {
      statuses.push({
        key: p.providerKey,
        name: p.displayName,
        enabled: p.isEnabled(),
      });
    }

    return statuses;
  }

  /** Get a specific provider by key. */
  private getProvider(key: string): CatalogProvider | null {
    return this.providers.get(key) ?? null;
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /** Search a single provider. */
  async search(
    providerKey: string,
    query: string,
    options?: CatalogSearchOptions,
  ): Promise<CatalogSearchResult> {
    const provider = this.getProvider(providerKey);
    if (!provider || !provider.isEnabled()) {
      return { provider: providerKey, query, totalResults: 0, page: 1, products: [] };
    }
    return provider.searchProducts(query, options);
  }

  /** Search across all enabled providers and merge results. */
  async searchAll(
    query: string,
    options?: CatalogSearchOptions,
  ): Promise<CatalogSearchResult[]> {
    const enabled = Array.from(this.providers.values()).filter((p) => p.isEnabled());
    if (enabled.length === 0) return [];

    const results = await Promise.allSettled(
      enabled.map((p) => p.searchProducts(query, options)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<CatalogSearchResult> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  // -------------------------------------------------------------------------
  // Product Detail
  // -------------------------------------------------------------------------

  async getProduct(
    providerKey: string,
    productId: string,
    zipCode?: string,
  ): Promise<CatalogProduct | null> {
    const provider = this.getProvider(providerKey);
    if (!provider || !provider.isEnabled()) return null;
    return provider.getProduct(productId, zipCode);
  }

  // -------------------------------------------------------------------------
  // Store Availability
  // -------------------------------------------------------------------------

  async getAvailability(
    providerKey: string,
    productId: string,
    zipCode: string,
  ): Promise<StoreAvailability> {
    const provider = this.getProvider(providerKey);
    if (!provider || !provider.isEnabled()) {
      return { provider: providerKey, productId, zipCode, stores: [] };
    }
    return provider.getStoreAvailability(productId, zipCode);
  }

  // -------------------------------------------------------------------------
  // CostBook Comparison
  // -------------------------------------------------------------------------

  /**
   * Fetch a product from a provider and compare its price against the
   * company's CostBook (CompanyPriceListItem).
   *
   * Matching strategy (in priority order):
   * 1. UPC match (exact)
   * 2. Description keyword + CAT code match (fuzzy)
   */
  async compareWithCostBook(
    providerKey: string,
    productId: string,
    companyId: string,
    zipCode?: string,
  ): Promise<PriceComparison> {
    const product = await this.getProduct(providerKey, productId, zipCode);

    if (!product) {
      return {
        catalogProduct: {
          productId,
          provider: providerKey,
          title: "Product not found",
        },
        costBookMatch: null,
        priceDifference: null,
        percentDifference: null,
      };
    }

    // Try to find a CostBook match
    const costBookItem = await this.findCostBookMatch(product, companyId);

    let priceDifference: number | null = null;
    let percentDifference: number | null = null;

    if (costBookItem?.unitPrice && product.price) {
      priceDifference = +(product.price - costBookItem.unitPrice).toFixed(2);
      percentDifference = +(
        ((product.price - costBookItem.unitPrice) / costBookItem.unitPrice) *
        100
      ).toFixed(1);
    }

    return {
      catalogProduct: product,
      costBookMatch: costBookItem
        ? {
            id: costBookItem.id,
            description: costBookItem.description,
            cat: costBookItem.cat,
            sel: costBookItem.sel,
            unitPrice: costBookItem.unitPrice,
            unit: costBookItem.unit,
          }
        : null,
      priceDifference,
      percentDifference,
    };
  }

  /** Find the best-matching CostBook item for a catalog product. */
  private async findCostBookMatch(
    product: CatalogProduct,
    companyId: string,
  ): Promise<any | null> {
    // First: try to find the company's active price list
    const priceList = await this.prisma.companyPriceList.findFirst({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    if (!priceList) return null;

    // Strategy 1: UPC match
    if (product.upc) {
      const upcMatch = await this.prisma.companyPriceListItem.findFirst({
        where: {
          companyPriceListId: priceList.id,
          OR: [
            { description: { contains: product.upc, mode: "insensitive" } },
          ],
        },
      });
      if (upcMatch) return upcMatch;
    }

    // Strategy 2: keyword match on product title
    // Extract meaningful keywords (skip common words)
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "in", "of", "for", "with", "to", "ft",
      "sq", "lb", "oz", "pk", "per", "each", "pack", "ct", "x",
    ]);
    const keywords = (product.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))
      .slice(0, 4); // Top 4 keywords

    if (keywords.length === 0) return null;

    // Search for items matching any keyword
    const keywordConditions = keywords.map((kw) => ({
      description: { contains: kw, mode: "insensitive" as const },
    }));

    const matches = await this.prisma.companyPriceListItem.findMany({
      where: {
        companyPriceListId: priceList.id,
        OR: keywordConditions,
      },
      take: 5,
      orderBy: { unitPrice: "asc" },
    });

    // Return the best match (most keyword overlap)
    if (matches.length === 0) return null;

    // Score by keyword overlap
    let bestMatch = matches[0];
    let bestScore = 0;
    for (const m of matches) {
      const desc = (m.description ?? "").toLowerCase();
      const score = keywords.filter((kw) => desc.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
      }
    }

    return bestMatch;
  }
}
