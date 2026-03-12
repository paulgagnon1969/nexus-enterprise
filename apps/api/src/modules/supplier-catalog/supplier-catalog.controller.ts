import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { JwtAuthGuard, getEffectiveRoleLevel } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SupplierCatalogService } from "./supplier-catalog.service";
import { BigBoxProvider } from "./bigbox.provider";
import { VendorRegistryService } from "./vendor-registry.service";
import { ShopService } from "./shop.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RequiresModule } from "../billing/module.guard";

function getUser(req: FastifyRequest): AuthenticatedUser {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (!user) throw new ForbiddenException("Authentication required");
  return user;
}

function assertPmOrAbove(user: AuthenticatedUser) {
  const level = getEffectiveRoleLevel({
    globalRole: user.globalRole,
    role: user.role,
    profileCode: user.profileCode,
  });
  if (level < 60) {
    throw new ForbiddenException("PM-level access or higher required");
  }
}

function assertSuperAdmin(user: AuthenticatedUser) {
  if (user.globalRole !== "SUPER_ADMIN") {
    throw new ForbiddenException("SUPER_ADMIN access required");
  }
}

@RequiresModule('BIDDING')
@Controller("supplier-catalog")
@UseGuards(JwtAuthGuard)
export class SupplierCatalogController {
  constructor(
    private readonly catalog: SupplierCatalogService,
    private readonly bigBox: BigBoxProvider,
    private readonly vendorRegistry: VendorRegistryService,
    private readonly shop: ShopService,
    private readonly prisma: PrismaService,
  ) {}

  // -------------------------------------------------------------------------
  // Provider Status
  // -------------------------------------------------------------------------

  /** List all configured providers and their enabled state. */
  @Get("status")
  getStatus(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertPmOrAbove(user);

    return { providers: this.catalog.getProviderStatus() };
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /** Search a single provider.  ?provider=bigbox&q=roofing+nails&zip=80202&page=1 */
  @Get("search")
  async search(
    @Req() req: FastifyRequest,
    @Query("provider") provider: string,
    @Query("q") q: string,
    @Query("zip") zip?: string,
    @Query("page") page?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!provider) throw new BadRequestException("provider is required");
    if (!q || q.trim().length < 2) {
      throw new BadRequestException("Search query (q) must be at least 2 characters");
    }

    return this.catalog.search(provider, q.trim(), {
      zipCode: zip,
      page: page ? Number(page) : undefined,
    });
  }

  /** Search across all enabled providers.  ?q=lumber&zip=80202 */
  @Get("search/all")
  async searchAll(
    @Req() req: FastifyRequest,
    @Query("q") q: string,
    @Query("zip") zip?: string,
    @Query("page") page?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!q || q.trim().length < 2) {
      throw new BadRequestException("Search query (q) must be at least 2 characters");
    }

    return this.catalog.searchAll(q.trim(), {
      zipCode: zip,
      page: page ? Number(page) : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Enriched Search (SerpAPI search + BigBox pricing/availability)
  // -------------------------------------------------------------------------

  /**
   * Search all providers with BigBox enrichment for HD results.
   * Returns localized pricing, availability status, aisle, and lead times.
   *
   *  ?q=Hardie+fiber+cement&zip=78133&topN=5
   */
  @Get("search/enriched")
  async searchEnriched(
    @Req() req: FastifyRequest,
    @Query("q") q: string,
    @Query("zip") zip?: string,
    @Query("topN") topN?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!q || q.trim().length < 2) {
      throw new BadRequestException("Search query (q) must be at least 2 characters");
    }

    return this.catalog.searchWithAvailability(q.trim(), zip, {
      topN: topN ? Number(topN) : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // Product Detail
  // -------------------------------------------------------------------------

  /** Get a single product.  ?provider=bigbox&id=12345&zip=80202 */
  @Get("product")
  async getProduct(
    @Req() req: FastifyRequest,
    @Query("provider") provider: string,
    @Query("id") id: string,
    @Query("zip") zip?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!provider) throw new BadRequestException("provider is required");
    if (!id) throw new BadRequestException("id is required");

    const product = await this.catalog.getProduct(provider, id, zip);
    if (!product) throw new BadRequestException("Product not found");
    return product;
  }

  // -------------------------------------------------------------------------
  // Store Availability
  // -------------------------------------------------------------------------

  /** Check in-store availability.  ?provider=bigbox&id=12345&zip=80202 */
  @Get("availability")
  async getAvailability(
    @Req() req: FastifyRequest,
    @Query("provider") provider: string,
    @Query("id") id: string,
    @Query("zip") zip: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!provider) throw new BadRequestException("provider is required");
    if (!id) throw new BadRequestException("id is required");
    if (!zip) throw new BadRequestException("zip is required");

    return this.catalog.getAvailability(provider, id, zip);
  }

  // -------------------------------------------------------------------------
  // Zipcode Management
  // -------------------------------------------------------------------------

  /** List all registered BigBox zipcodes. */
  @Get("zipcodes")
  async listZipcodes(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertPmOrAbove(user);
    const zips = await this.bigBox.listRegisteredZipcodes();
    return { zipcodes: zips };
  }

  /** Register a zipcode for localized pricing. */
  @Get("zipcodes/register")
  async registerZipcode(
    @Req() req: FastifyRequest,
    @Query("zip") zip: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);
    if (!zip) throw new BadRequestException("zip is required");
    await this.bigBox.ensureZipcode(zip);
    return { ok: true, zipcode: zip, message: "Registered — localized results available in ~2 minutes" };
  }

  /** Remove a zipcode from BigBox. */
  @Get("zipcodes/remove")
  async removeZipcode(
    @Req() req: FastifyRequest,
    @Query("zip") zip: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);
    if (!zip) throw new BadRequestException("zip is required");
    await this.bigBox.removeZipcode(zip);
    return { ok: true, zipcode: zip, message: "Zipcode removed" };
  }

  // -------------------------------------------------------------------------
  // BOM → Catalog Search (Snapshot-backed)
  // -------------------------------------------------------------------------

  /**
   * Search supplier catalogs using BOM/SOW line descriptions.
   * Returns an existing snapshot if available; pass ?refresh=true to force
   * a fresh scrape (costs SerpApi credits).
   *
   *  ?projectId=X&estimateVersionId=Y&zip=85001&limit=10&refresh=true
   */
  @Get("bom-search")
  async bomSearch(
    @Req() req: FastifyRequest,
    @Query("projectId") projectId: string,
    @Query("estimateVersionId") estimateVersionId: string,
    @Query("zip") zip?: string,
    @Query("limit") limit?: string,
    @Query("refresh") refresh?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!projectId) throw new BadRequestException("projectId is required");
    if (!estimateVersionId)
      throw new BadRequestException("estimateVersionId is required");
    if (!user.companyId)
      throw new BadRequestException("Company context required");

    // Return existing snapshot unless refresh is requested
    const forceRefresh = refresh === "true" || refresh === "1";
    if (!forceRefresh) {
      const existing = await this.catalog.getLatestBomSnapshot(
        projectId,
        estimateVersionId,
      );
      if (existing) {
        return {
          snapshotId: existing.id,
          projectId: existing.projectId,
          estimateVersionId: existing.estimateVersionId,
          totalLines: existing.totalLines,
          searchableLines: existing.searchableLines,
          status: existing.status,
          createdAt: existing.createdAt,
          hits: existing.hits.map((h) => ({
            id: h.id,
            sowItemId: h.sowItemId,
            lineNo: h.lineNo,
            description: h.description,
            categoryCode: h.categoryCode,
            searchQuery: h.searchQuery,
            materialAmount: h.materialAmount,
            qty: h.qty,
            unit: h.unit,
            selectedProductIdx: h.selectedProductIdx,
            products: h.products,
          })),
        };
      }
    }

    // Fresh scrape (non-streaming fallback)
    return this.catalog.bomSearch(
      user.companyId,
      projectId,
      estimateVersionId,
      user.userId,
      {
        zipCode: zip,
        limit: limit ? Number(limit) : undefined,
      },
    );
  }

  /**
   * SSE streaming endpoint for BOM search.
   * Sends progress events during the scrape, then a final "done" event
   * with the full snapshot payload.
   *
   *  ?projectId=X&estimateVersionId=Y&zip=85001&limit=10
   */
  @Get("bom-search/stream")
  async bomSearchStream(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Query("projectId") projectId: string,
    @Query("estimateVersionId") estimateVersionId: string,
    @Query("zip") zip?: string,
    @Query("limit") limit?: string,
    @Query("sowItemIds") sowItemIdsRaw?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!projectId) throw new BadRequestException("projectId is required");
    if (!estimateVersionId)
      throw new BadRequestException("estimateVersionId is required");
    if (!user.companyId)
      throw new BadRequestException("Company context required");

    // Set up SSE headers on the raw Node response
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const sendEvent = (event: string, data: unknown) => {
      raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Parse optional comma-separated sowItemIds
      const sowItemIds = sowItemIdsRaw
        ? sowItemIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      const result = await this.catalog.bomSearch(
        user.companyId,
        projectId,
        estimateVersionId,
        user.userId,
        {
          zipCode: zip,
          limit: limit ? Number(limit) : undefined,
          sowItemIds,
          onProgress: (msg: string) => sendEvent("progress", { message: msg }),
        },
      );
      sendEvent("done", result);
    } catch (err: any) {
      sendEvent("error", { message: err?.message ?? "Search failed" });
    } finally {
      raw.end();
    }
  }

  /** Load a specific snapshot by ID. */
  @Get("bom-snapshot/:id")
  async getBomSnapshot(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    const snapshot = await this.catalog.getBomSnapshot(id);
    if (!snapshot) throw new NotFoundException("Snapshot not found");
    return snapshot;
  }

  /** Select a product for a BOM pricing hit. */
  @Patch("bom-hit/:hitId/select")
  async selectBomHitProduct(
    @Req() req: FastifyRequest,
    @Param("hitId") hitId: string,
    @Body() body: { selectedProductIdx: number | null },
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (body.selectedProductIdx !== null && typeof body.selectedProductIdx !== "number") {
      throw new BadRequestException("selectedProductIdx must be a number or null");
    }

    return this.catalog.selectBomHitProduct(hitId, body.selectedProductIdx);
  }

  /** Lock a snapshot (freeze prices for PO creation). */
  @Patch("bom-snapshot/:id/lock")
  async lockBomSnapshot(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    const snapshot = await this.catalog.getBomSnapshot(id);
    if (!snapshot) throw new NotFoundException("Snapshot not found");
    if (snapshot.status === "LOCKED") return snapshot;
    if (snapshot.status !== "DRAFT") {
      throw new BadRequestException("Only DRAFT snapshots can be locked");
    }

    return this.catalog.lockBomSnapshot(id);
  }

  /** Get price history for a search query over time. */
  @Get("price-history")
  async getPriceHistory(
    @Req() req: FastifyRequest,
    @Query("query") query: string,
    @Query("days") days?: string,
    @Query("provider") provider?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!query) throw new BadRequestException("query is required");
    if (!user.companyId) throw new BadRequestException("Company context required");

    return this.catalog.getPriceHistory(user.companyId, query, {
      days: days ? Number(days) : undefined,
      provider,
    });
  }

  // -------------------------------------------------------------------------
  // CostBook Comparison
  // -------------------------------------------------------------------------

  /** Compare a catalog product's price against the company CostBook.
   *  ?provider=bigbox&id=12345&zip=80202
   */
  @Get("compare")
  async compareWithCostBook(
    @Req() req: FastifyRequest,
    @Query("provider") provider: string,
    @Query("id") id: string,
    @Query("zip") zip?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!provider) throw new BadRequestException("provider is required");
    if (!id) throw new BadRequestException("id is required");
    if (!user.companyId) throw new BadRequestException("Company context required");

    return this.catalog.compareWithCostBook(provider, id, user.companyId, zip);
  }

  // =========================================================================
  // Procurement Intelligence — Vendor Registry
  // =========================================================================

  /** List all vendors in the registry. ?enabledOnly=true */
  @Get("vendors")
  async listVendors(
    @Req() req: FastifyRequest,
    @Query("enabledOnly") enabledOnly?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);
    const onlyEnabled = enabledOnly === "true" || enabledOnly === "1";
    const vendors = await this.vendorRegistry.listVendors(onlyEnabled);
    return { vendors };
  }

  /** Get a single vendor by code. */
  @Get("vendors/:code")
  async getVendor(
    @Req() req: FastifyRequest,
    @Param("code") code: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);
    const vendor = await this.vendorRegistry.getByCode(code.toUpperCase());
    if (!vendor) throw new NotFoundException(`Vendor ${code} not found`);
    return vendor;
  }

  /** Seed default vendors (idempotent). SUPER_ADMIN only. */
  @Post("vendors/seed")
  async seedVendors(@Req() req: FastifyRequest) {
    const user = getUser(req);
    assertSuperAdmin(user);
    return this.vendorRegistry.seedVendors();
  }

  /** Create a new vendor. SUPER_ADMIN only. */
  @Post("vendors")
  async createVendor(
    @Req() req: FastifyRequest,
    @Body() body: {
      code: string;
      name: string;
      websiteUrl?: string;
      providerType: string;
      isEnabled?: boolean;
      scrapeConfig?: Record<string, any>;
      apiConfig?: Record<string, any>;
      rateLimit?: Record<string, any>;
      skuPrefix?: string;
      prefixMap?: Record<string, string[]>;
    },
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    if (!body.code || !body.name || !body.providerType) {
      throw new BadRequestException("code, name, and providerType are required");
    }
    return this.vendorRegistry.createVendor({
      ...body,
      providerType: body.providerType as any,
      isEnabled: body.isEnabled ?? true,
    });
  }

  /** Update vendor config. SUPER_ADMIN only. */
  @Patch("vendors/:code")
  async updateVendor(
    @Req() req: FastifyRequest,
    @Param("code") code: string,
    @Body() body: Record<string, any>,
  ) {
    const user = getUser(req);
    assertSuperAdmin(user);
    const existing = await this.vendorRegistry.getByCode(code.toUpperCase());
    if (!existing) throw new NotFoundException(`Vendor ${code} not found`);
    return this.vendorRegistry.updateVendor(code.toUpperCase(), body);
  }

  // =========================================================================
  // Procurement Intelligence — Catalog & Comparison Grid
  // =========================================================================

  /** Browse catalog items. ?category=CABINET&search=shaker&limit=50&offset=0 */
  @Get("catalog")
  async listCatalogItems(
    @Req() req: FastifyRequest,
    @Query("category") category?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    const where: Record<string, any> = {};
    if (category) where.category = category.toUpperCase();
    if (search) {
      where.description = { contains: search, mode: "insensitive" };
    }

    const take = Math.min(Number(limit) || 50, 200);
    const skip = Number(offset) || 0;

    const [items, total] = await Promise.all([
      this.prisma.catalogItem.findMany({ where, take, skip, orderBy: { description: "asc" } }),
      this.prisma.catalogItem.count({ where }),
    ]);

    return { items, total, limit: take, offset: skip };
  }

  /** Comparison grid — POST array of catalogItemIds, returns vendor quote matrix. */
  @Post("catalog/compare")
  async comparisonGrid(
    @Req() req: FastifyRequest,
    @Body() body: { catalogItemIds: string[] },
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);

    if (!body.catalogItemIds?.length) {
      throw new BadRequestException("catalogItemIds[] is required");
    }
    return this.shop.getComparisonGrid(body.catalogItemIds);
  }

  // =========================================================================
  // Procurement Intelligence — Shop (live scrape / quote refresh)
  // =========================================================================

  /** Shop for a single catalog item across all enabled vendors. */
  @Post("catalog/:id/shop")
  async shopForItem(
    @Req() req: FastifyRequest,
    @Param("id") id: string,
    @Body() body: { zipCode?: string },
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);
    return this.shop.shopForItem(id, { zipCode: body.zipCode });
  }

  /** Shop for a BOM — finds linked CatalogItems and refreshes quotes. */
  @Post("catalog/shop-bom")
  async shopForBom(
    @Req() req: FastifyRequest,
    @Body() body: {
      projectId: string;
      estimateVersionId: string;
      zipCode?: string;
      catalogItemIds?: string[];
    },
  ) {
    const user = getUser(req);
    assertPmOrAbove(user);
    if (!body.projectId || !body.estimateVersionId) {
      throw new BadRequestException("projectId and estimateVersionId are required");
    }
    return this.shop.shopForBom(body.projectId, body.estimateVersionId, {
      zipCode: body.zipCode,
      catalogItemIds: body.catalogItemIds,
    });
  }
}
