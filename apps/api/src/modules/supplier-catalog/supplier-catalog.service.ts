import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { SerpApiProvider } from "./serpapi.provider";
import { BigBoxProvider } from "./bigbox.provider";
import { SerpApiLowesProvider } from "./serpapi-lowes.provider";
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

/** Single BOM line matched against supplier catalogs. */
export interface BomSearchHit {
  sowItemId: string;
  lineNo: number;
  description: string;
  categoryCode: string | null;
  materialAmount: number | null;
  qty: number | null;
  unit: string | null;
  searchQuery: string;
  catalogResults: CatalogSearchResult[];
}

export interface BomSearchResult {
  projectId: string;
  estimateVersionId: string;
  totalLines: number;
  searchableLines: number;
  hits: BomSearchHit[];
}

// ---------------------------------------------------------------------------
// Xactimate description → search query cleaning
// ---------------------------------------------------------------------------

/** Prefixes that describe labor actions, not materials. */
const LABOR_PREFIX_RE =
  /^(r\s*&\s*r|remove\s*(&|and)?\s*(re)?install|replace|install|apply|clean|haul|dispose|demolish|demo|detach|reset|mask|seal|tape|sand|prep|prime|finish|paint|texture|float|skim|caulk|labor)\s*[-–—:]?\s*/i;

/** Measurement / per-unit noise. */
const PER_UNIT_RE =
  /[-–—]?\s*per\s+\d*\s*(sf|sq\.?\s*ft|lf|lin\.?\s*ft|sy|sq\.?\s*yd|ea|each|unit|hr|hour|day|1000\s*sf)\b/gi;

/** Level qualifiers ("Level 4 finish", "L4"). */
const LEVEL_RE = /[-–—]?\s*level\s*\d+\s*(finish)?/gi;

/** Contents / additional qualifiers that aren't material names. */
const NOISE_RE =
  /\b(contents|additional|charge|minimum|setup|mobilization|small\s*job|large\s*job|high\s*wall|tall\s*wall|detach|reset|mask|&\s*reset)\b/gi;

/** Collapse whitespace and trim. */
function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Normalize Xactimate dimension notation to retailer-friendly format.
 *  - 2" x 4" x 12'  ->  2 in x 4 in x 12 ft
 *  - 4' x 8'        ->  4 ft x 8 ft
 *  - 1/2"           ->  1/2 in
 * Preserves dimensions so search engines match the correct product size.
 */
function normalizeDimensions(s: string): string {
  // Convert feet: 12' / 12\u2019 / 12\u2032 -> 12 ft
  s = s.replace(/(\d+(?:\/\d+)?)\s*['\u2018\u2019\u2032]/g, "$1 ft");
  // Convert inches: 2" / 2\u201D / 2\u2033 -> 2 in
  s = s.replace(/(\d+(?:\/\d+)?)\s*["\u201C\u201D\u2033]/g, "$1 in");
  return s;
}

/** Strip Xactimate grade jargon that retailers don't use. */
function cleanGradeNoise(s: string): string {
  // "#2 & better" -> "#2"
  s = s.replace(/\s*&\s*better\b/gi, "");
  // "(material only)" -> ""
  s = s.replace(/\(material\s*only\)/gi, "");
  return s;
}

/**
 * Turn an Xactimate SOW description into a clean product search query.
 * Returns null if nothing useful remains (pure labor lines).
 */
export function xactDescToSearchQuery(raw: string): string | null {
  let q = raw;

  // Strip labor prefixes
  q = q.replace(LABOR_PREFIX_RE, "");

  // Strip per-unit, level, and noise phrases
  q = q.replace(PER_UNIT_RE, "");
  q = q.replace(LEVEL_RE, "");
  q = q.replace(NOISE_RE, "");

  // Normalize dimensions BEFORE stripping punctuation
  q = normalizeDimensions(q);
  q = cleanGradeNoise(q);

  // Strip leading/trailing punctuation and dashes
  q = q.replace(/^[-\u2013\u2014:,;.\s]+/, "").replace(/[-\u2013\u2014:,;.\s]+$/, "");

  q = collapseWs(q);

  // If the cleaned string is too short to be a useful search, skip it
  if (q.length < 3) return null;

  return q;
}

@Injectable()
export class SupplierCatalogService {
  private readonly logger = new Logger(SupplierCatalogService.name);
  private readonly providers: Map<string, CatalogProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly serpApi: SerpApiProvider,
    private readonly bigBox: BigBoxProvider,
    private readonly serpApiLowes: SerpApiLowesProvider,
    private readonly lowes: LowesProvider,
  ) {
    // Dual-provider strategy: register BOTH SerpAPI and BigBox for HD when
    // both keys exist. SerpAPI is best for search, BigBox is best for
    // localized pricing, availability, aisle data, and lead times.
    //
    // - "homedepot"        → SerpAPI (primary search provider)
    // - "homedepot_bigbox" → BigBox  (pricing/availability enrichment)
    //
    // If only one key exists, register it under "homedepot" as before.
    const providers: Array<[string, CatalogProvider]> = [];

    if (this.serpApi.isEnabled() && this.bigBox.isEnabled()) {
      // Both available — SerpAPI for search under "homedepot", BigBox under
      // a separate key for enrichment queries.
      providers.push(['homedepot', this.serpApi]);
      providers.push(['homedepot_bigbox', this.bigBox]);
    } else if (this.serpApi.isEnabled()) {
      providers.push(['homedepot', this.serpApi]);
    } else if (this.bigBox.isEnabled()) {
      providers.push(['homedepot', this.bigBox]);
    }

    // Lowe's — SerpAPI Google Shopping preferred, IMS fallback.
    const lowesProvider: CatalogProvider = this.serpApiLowes.isEnabled()
      ? this.serpApiLowes
      : this.lowes;
    providers.push([lowesProvider.providerKey, lowesProvider]);

    this.providers = new Map<string, CatalogProvider>(providers);

    this.logger.log(
      `Registered providers: ${[...this.providers.keys()].join(', ')}`,
    );
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
    // Skip the BigBox enrichment provider — it's used for enrichment only,
    // not as a primary search source. This avoids duplicate HD results.
    const enabled = Array.from(this.providers.entries())
      .filter(([key, p]) => key !== 'homedepot_bigbox' && p.isEnabled())
      .map(([, p]) => p);
    if (enabled.length === 0) return [];

    const results = await Promise.allSettled(
      enabled.map((p) => p.searchProducts(query, options)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<CatalogSearchResult> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  // -------------------------------------------------------------------------
  // Enriched Search (SerpAPI search → BigBox pricing/availability)
  // -------------------------------------------------------------------------

  /**
   * Search across all providers, then enrich HD results with BigBox data
   * (local pricing, availability status, aisle info, lead times).
   *
   * This is the preferred search method for consumer-facing UIs (mobile map,
   * product finder) where localized data matters.
   */
  async searchWithAvailability(
    query: string,
    zipCode?: string,
    options?: { topN?: number; pageSize?: number },
  ): Promise<CatalogSearchResult[]> {
    const topN = options?.topN ?? 5;
    const pageSize = options?.pageSize ?? 10;

    // 1. Run the normal multi-provider search
    const baseResults = await this.searchAll(query, { zipCode, pageSize });

    // 2. If BigBox is available as a separate enrichment provider, enrich
    //    HD results with localized pricing + availability.
    const bigBoxProvider = this.providers.get('homedepot_bigbox');
    if (!bigBoxProvider || !bigBoxProvider.isEnabled() || !zipCode) {
      return baseResults;
    }

    // Find HD results to enrich
    const hdResult = baseResults.find((r) => r.provider === 'homedepot');
    if (!hdResult || hdResult.products.length === 0) {
      return baseResults;
    }

    // 3. Enrich top N HD products with BigBox product detail (parallel)
    const productsToEnrich = hdResult.products.slice(0, topN);
    const enriched = await Promise.allSettled(
      productsToEnrich.map(async (product) => {
        try {
          const detail = await bigBoxProvider.getProduct(product.productId, zipCode);
          if (!detail) return product;

          // Merge BigBox enrichment into the SerpAPI product.
          // BigBox fields take precedence for pricing/availability/store data.
          return {
            ...product,
            price: detail.price ?? product.price,
            wasPrice: detail.wasPrice ?? product.wasPrice,
            aisle: detail.aisle ?? product.aisle,
            inStock: detail.inStock ?? product.inStock,
            availabilityStatus: detail.availabilityStatus ?? product.availabilityStatus,
            leadTimeDays: detail.leadTimeDays ?? product.leadTimeDays,
            storeName: detail.storeName ?? product.storeName,
            storeAddress: detail.storeAddress ?? product.storeAddress,
            storeCity: detail.storeCity ?? product.storeCity,
            storeState: detail.storeState ?? product.storeState,
            storeZip: detail.storeZip ?? product.storeZip,
            storePhone: detail.storePhone ?? product.storePhone,
            upc: detail.upc ?? product.upc,
            description: detail.description ?? product.description,
          } satisfies CatalogProduct;
        } catch (err) {
          this.logger.warn(
            `BigBox enrichment failed for ${product.productId}: ${err}`,
          );
          return product;
        }
      }),
    );

    // 4. Reassemble the HD result with enriched products
    const enrichedProducts = enriched.map((r, i) =>
      r.status === 'fulfilled' ? r.value : productsToEnrich[i],
    );
    // Append any un-enriched products beyond topN
    const remaining = hdResult.products.slice(topN);

    const enrichedHd: CatalogSearchResult = {
      ...hdResult,
      products: [...enrichedProducts, ...remaining],
    };

    // Replace the HD result in the array
    return baseResults.map((r) =>
      r.provider === 'homedepot' ? enrichedHd : r,
    );
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

  // -------------------------------------------------------------------------
  // BOM → Catalog Search (persisted snapshots)
  // -------------------------------------------------------------------------

  /**
   * Return the most recent DRAFT or LOCKED snapshot for this project+estimate.
   * Returns null if none exists (caller should trigger a fresh scrape).
   */
  async getLatestBomSnapshot(
    projectId: string,
    estimateVersionId: string,
  ) {
    const snapshot = await this.prisma.bomPricingSnapshot.findFirst({
      where: { projectId, estimateVersionId, status: { in: ["DRAFT", "LOCKED"] } },
      orderBy: { createdAt: "desc" },
      include: {
        hits: {
          include: { products: { orderBy: { idx: "asc" } } },
          orderBy: { lineNo: "asc" },
        },
      },
    });
    return snapshot;
  }

  /**
   * Load a specific snapshot by ID.
   */
  async getBomSnapshot(snapshotId: string) {
    return this.prisma.bomPricingSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        hits: {
          include: { products: { orderBy: { idx: "asc" } } },
          orderBy: { lineNo: "asc" },
        },
      },
    });
  }

  /**
   * Load SowItem lines with materialAmount > 0 from an estimate, clean the
   * descriptions, batch-search all enabled catalog providers, persist the
   * results as a BomPricingSnapshot, and append MaterialPriceObservations.
   *
   * Returns up to `limit` results (default 20) to avoid hammering SerpAPI.
   */
  async bomSearch(
    companyId: string,
    projectId: string,
    estimateVersionId: string,
    userId: string | null,
    options?: { zipCode?: string; limit?: number; sowItemIds?: string[]; onProgress?: (msg: string) => void },
  ): Promise<BomSearchResult & { snapshotId: string }> {
    const emit = options?.onProgress ?? (() => {});
    const limit = options?.limit ?? 20;

    // 1. Load SowItem lines that have material cost
    const sowItems = await this.prisma.sowItem.findMany({
      where: {
        estimateVersionId,
        sow: { projectId },
        materialAmount: { gt: 0 },
        ...(options?.sowItemIds?.length ? { id: { in: options.sowItemIds } } : {}),
      },
      select: {
        id: true,
        lineNo: true,
        description: true,
        categoryCode: true,
        materialAmount: true,
        qty: true,
        unit: true,
      },
      orderBy: { materialAmount: "desc" },
    });

    // 2. Deduplicate by search query
    const seen = new Set<string>();
    const searchable: Array<{
      sowItem: (typeof sowItems)[0];
      searchQuery: string;
    }> = [];

    for (const si of sowItems) {
      const q = xactDescToSearchQuery(si.description);
      if (!q) continue;
      const normKey = q.toLowerCase();
      if (seen.has(normKey)) continue;
      seen.add(normKey);
      searchable.push({ sowItem: si, searchQuery: q });
      if (searchable.length >= limit) break;
    }

    emit(`Found ${sowItems.length} BOM lines with materials, ${searchable.length} unique searches`);

    // 3. Search catalogs (sequential to stay within rate limits)
    const hits: BomSearchHit[] = [];
    let searchIdx = 0;
    for (const { sowItem, searchQuery } of searchable) {
      searchIdx++;
      emit(`[${searchIdx}/${searchable.length}] Searching: "${searchQuery}"`);
      try {
        const catalogResults = await this.searchAll(searchQuery, {
          zipCode: options?.zipCode,
          pageSize: 5,
        });
        const productCount = catalogResults.reduce((n, cr) => n + cr.products.length, 0);
        emit(`[${searchIdx}/${searchable.length}] ✓ "${searchQuery}" → ${productCount} products`);

        hits.push({
          sowItemId: sowItem.id,
          lineNo: sowItem.lineNo,
          description: sowItem.description,
          categoryCode: sowItem.categoryCode,
          materialAmount: sowItem.materialAmount,
          qty: sowItem.qty,
          unit: sowItem.unit,
          searchQuery,
          catalogResults,
        });
      } catch (err) {
        this.logger.warn(
          `BOM search failed for "${searchQuery}" (sowItem ${sowItem.id}): ${err}`,
        );
      }
    }

    // 4. Archive any existing DRAFT snapshots for this project+estimate
    await this.prisma.bomPricingSnapshot.updateMany({
      where: {
        projectId,
        estimateVersionId,
        status: "DRAFT",
      },
      data: { status: "ARCHIVED" },
    });

    // 5. Persist snapshot
    const snapshot = await this.prisma.bomPricingSnapshot.create({
      data: {
        companyId,
        projectId,
        estimateVersionId,
        zipCode: options?.zipCode ?? null,
        totalLines: sowItems.length,
        searchableLines: searchable.length,
        status: "DRAFT",
        createdByUserId: userId,
        hits: {
          create: hits.map((hit) => {
            const allProducts = hit.catalogResults.flatMap((cr) => cr.products);
            return {
              sowItemId: hit.sowItemId,
              lineNo: hit.lineNo,
              description: hit.description,
              categoryCode: hit.categoryCode,
              searchQuery: hit.searchQuery,
              materialAmount: hit.materialAmount ?? null,
              qty: hit.qty ?? null,
              unit: hit.unit ?? null,
              products: {
                create: allProducts.slice(0, 10).map((p, idx) => ({
                  idx,
                  provider: p.provider,
                  productId: p.productId,
                  title: p.title,
                  brand: p.brand ?? null,
                  modelNumber: p.modelNumber ?? null,
                  price: p.price ?? null,
                  wasPrice: p.wasPrice ?? null,
                  unit: p.unit ?? null,
                  imageUrl: p.imageUrl ?? null,
                  productUrl: p.productUrl ?? null,
                  rating: p.rating ?? null,
                  inStock: p.inStock ?? null,
                  storeName: p.storeName ?? null,
                  storeAddress: p.storeAddress ?? null,
                  storeCity: p.storeCity ?? null,
                  storeState: p.storeState ?? null,
                  storeZip: p.storeZip ?? null,
                  storePhone: p.storePhone ?? null,
                })),
              },
            };
          }),
        },
      },
    });

    // 6. Append MaterialPriceObservations for trending (fire-and-forget)
    const observations = hits.flatMap((hit) =>
      hit.catalogResults.flatMap((cr) =>
        cr.products
          .filter((p) => p.price != null)
          .map((p) => ({
            companyId,
            provider: p.provider,
            productId: p.productId,
            title: p.title,
            brand: p.brand ?? null,
            searchQuery: hit.searchQuery,
            price: p.price!,
            zipCode: options?.zipCode ?? null,
          })),
      ),
    );

    if (observations.length > 0) {
      this.prisma.materialPriceObservation
        .createMany({ data: observations })
        .catch((err) =>
          this.logger.warn(`Failed to persist price observations: ${err}`),
        );
    }

    this.logger.log(
      `BOM snapshot ${snapshot.id}: ${hits.length} hits, ${observations.length} price observations`,
    );

    return {
      snapshotId: snapshot.id,
      projectId,
      estimateVersionId,
      totalLines: sowItems.length,
      searchableLines: searchable.length,
      hits,
    };
  }

  // -------------------------------------------------------------------------
  // Snapshot Selection & Locking
  // -------------------------------------------------------------------------

  /**
   * Set the selected product index for a specific BOM pricing hit.
   */
  async selectBomHitProduct(hitId: string, selectedProductIdx: number | null) {
    return this.prisma.bomPricingHit.update({
      where: { id: hitId },
      data: { selectedProductIdx },
    });
  }

  /**
   * Lock a snapshot — marks it as LOCKED so prices are frozen.
   */
  async lockBomSnapshot(snapshotId: string) {
    return this.prisma.bomPricingSnapshot.update({
      where: { id: snapshotId },
      data: { status: "LOCKED" },
    });
  }

  // -------------------------------------------------------------------------
  // Price History / Trending
  // -------------------------------------------------------------------------

  /**
   * Get price observations for a search query over time.
   */
  async getPriceHistory(
    companyId: string,
    searchQuery: string,
    options?: { days?: number; provider?: string },
  ) {
    const days = options?.days ?? 90;
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.materialPriceObservation.findMany({
      where: {
        companyId,
        searchQuery: { equals: searchQuery, mode: "insensitive" },
        observedAt: { gte: since },
        ...(options?.provider ? { provider: options.provider } : {}),
      },
      orderBy: { observedAt: "asc" },
    });
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
