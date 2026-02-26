import { Controller, Get, Query, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guards";
import { PrismaService } from "../../infra/prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("catalog")
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search catalog items (cabinets, materials).
   * GET /catalog/search?q=white+shaker+base&category=KIT&limit=50
   */
  @Get("search")
  async searchCatalog(
    @Query("q") query?: string,
    @Query("category") category?: string,
    @Query("productType") productType?: string,
    @Query("finish") finish?: string,
    @Query("limit") limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const where: any = { isActive: true };

    if (category) where.category = category;
    if (productType) {
      where.productType = { contains: productType, mode: "insensitive" as const };
    }
    if (finish) {
      where.finish = { contains: finish, mode: "insensitive" as const };
    }
    if (query) {
      where.OR = [
        { description: { contains: query, mode: "insensitive" as const } },
        { productType: { contains: query, mode: "insensitive" as const } },
        { finish: { contains: query, mode: "insensitive" as const } },
      ];
    }

    const items = await this.prisma.catalogItem.findMany({
      where,
      take: limit,
      orderBy: { description: "asc" },
      include: {
        vendorQuotes: {
          include: { vendor: true },
          orderBy: { unitPrice: "asc" },
          take: 5,
        },
      },
    });

    return {
      count: items.length,
      items: items.map((item) => ({
        id: item.id,
        specHash: item.specHash,
        category: item.category,
        productType: item.productType,
        description: item.description,
        unit: item.unit,
        dimensions: {
          width: item.width,
          height: item.height,
          depth: item.depth,
        },
        finish: item.finish,
        vendorQuotes: item.vendorQuotes.map((vq) => ({
          vendor: vq.vendor.name,
          vendorCode: vq.vendor.code,
          sku: vq.vendorSku,
          price: vq.unitPrice,
          inStock: vq.inStock,
          url: vq.productUrl,
          scrapedAt: vq.scrapedAt,
        })),
        bestPrice: item.vendorQuotes[0]?.unitPrice || null,
        bestVendor: item.vendorQuotes[0]?.vendor.name || null,
      })),
    };
  }

  /**
   * Get catalog item by ID with all vendor quotes.
   * GET /catalog/items/:itemId
   */
  @Get("items/:itemId")
  async getCatalogItem(@Param("itemId") itemId: string) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: {
        vendorQuotes: {
          include: { vendor: true },
          orderBy: { unitPrice: "asc" },
        },
      },
    });

    if (!item) {
      return null;
    }

    return {
      id: item.id,
      specHash: item.specHash,
      category: item.category,
      productType: item.productType,
      description: item.description,
      unit: item.unit,
      dimensions: {
        width: item.width,
        height: item.height,
        depth: item.depth,
      },
      finish: item.finish,
      vendorQuotes: item.vendorQuotes.map((vq) => ({
        id: vq.id,
        vendor: {
          id: vq.vendor.id,
          code: vq.vendor.code,
          name: vq.vendor.name,
          websiteUrl: vq.vendor.websiteUrl,
        },
        sku: vq.vendorSku,
        price: vq.unitPrice,
        wasPrice: vq.wasPrice,
        currency: vq.currency,
        inStock: vq.inStock,
        stockQty: vq.stockQty,
        leadTimeDays: vq.leadTimeDays,
        productUrl: vq.productUrl,
        imageUrl: vq.imageUrl,
        scrapedAt: vq.scrapedAt,
        expiresAt: vq.expiresAt,
      })),
    };
  }

  /**
   * Get vendor quotes for a specific catalog item.
   * GET /catalog/items/:itemId/quotes
   */
  @Get("items/:itemId/quotes")
  async getVendorQuotes(@Param("itemId") itemId: string) {
    const quotes = await this.prisma.vendorQuote.findMany({
      where: { catalogItemId: itemId },
      include: { vendor: true },
      orderBy: { unitPrice: "asc" },
    });

    return {
      catalogItemId: itemId,
      count: quotes.length,
      quotes: quotes.map((vq) => ({
        id: vq.id,
        vendor: {
          id: vq.vendor.id,
          code: vq.vendor.code,
          name: vq.vendor.name,
          websiteUrl: vq.vendor.websiteUrl,
        },
        sku: vq.vendorSku,
        price: vq.unitPrice,
        wasPrice: vq.wasPrice,
        inStock: vq.inStock,
        productUrl: vq.productUrl,
        imageUrl: vq.imageUrl,
        scrapedAt: vq.scrapedAt,
      })),
    };
  }

  /**
   * Browse cabinet catalog by color/finish.
   * GET /catalog/cabinets?finish=white+shaker&limit=100
   */
  @Get("cabinets")
  async browseCabinets(
    @Query("finish") finish?: string,
    @Query("type") type?: string,
    @Query("limit") limitStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    const where: any = {
      category: "KIT",
      isActive: true,
    };

    if (finish) {
      where.finish = { contains: finish, mode: "insensitive" as const };
    }
    if (type) {
      where.productType = { contains: type, mode: "insensitive" as const };
    }

    const items = await this.prisma.catalogItem.findMany({
      where,
      take: limit,
      orderBy: [
        { finish: "asc" },
        { productType: "asc" },
        { width: "asc" },
      ],
      include: {
        vendorQuotes: {
          include: { vendor: true },
          orderBy: { unitPrice: "asc" },
          take: 3,
        },
      },
    });

    // Group by finish for easier browsing
    const byFinish = new Map<string, any[]>();
    for (const item of items) {
      const finishKey = item.finish || "(No Finish)";
      const arr = byFinish.get(finishKey) || [];
      arr.push({
        id: item.id,
        productType: item.productType,
        description: item.description,
        dimensions: {
          width: item.width,
          height: item.height,
          depth: item.depth,
        },
        bestPrice: item.vendorQuotes[0]?.unitPrice || null,
        bestVendor: item.vendorQuotes[0]?.vendor.name || null,
        availableVendors: item.vendorQuotes.length,
      });
      byFinish.set(finishKey, arr);
    }

    return {
      totalItems: items.length,
      finishes: Array.from(byFinish.entries()).map(([finish, items]) => ({
        finish,
        count: items.length,
        items,
      })),
    };
  }
}
