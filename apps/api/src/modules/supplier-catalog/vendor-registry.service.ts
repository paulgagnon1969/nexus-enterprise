import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { VendorProviderType } from "@prisma/client";

export interface VendorSeed {
  code: string;
  name: string;
  websiteUrl?: string;
  providerType: VendorProviderType;
  isEnabled: boolean;
  scrapeConfig?: Record<string, any>;
  apiConfig?: Record<string, any>;
  rateLimit?: Record<string, any>;
  skuPrefix?: string;
  prefixMap?: Record<string, string[]>;
}

/** Initial vendor seeds — run once via seedVendors(). */
const DEFAULT_VENDORS: VendorSeed[] = [
  {
    code: "RTA",
    name: "RTA Cabinet Store",
    websiteUrl: "https://www.rtacabinetstore.com",
    providerType: "WEB_SCRAPER",
    isEnabled: true,
    scrapeConfig: {
      urlPattern:
        "https://www.rtacabinetstore.com/RTA-Kitchen-Cabinets/item/{sku}",
      priceSelectors: [
        {
          type: "meta",
          pattern: "itemprop=[\"']?price[\"']?\\s+content=[\"']?([\\d.]+)",
        },
        { type: "regex", pattern: 'productValue\\s*:\\s*"([\\d.]+)"' },
      ],
      availabilitySelectors: [],
    },
    rateLimit: { delayMs: 1200, maxRetries: 2 },
  },
  {
    code: "USKITCHEN",
    name: "US Kitchen Cabinet",
    websiteUrl: "https://uskitchencabinet.com",
    providerType: "WEB_SCRAPER",
    isEnabled: true,
    scrapeConfig: {
      sitemapUrls: [
        "https://uskitchencabinet.com/product-sitemap1.xml",
        "https://uskitchencabinet.com/product-sitemap2.xml",
        "https://uskitchencabinet.com/product-sitemap3.xml",
        "https://uskitchencabinet.com/product-sitemap4.xml",
        "https://uskitchencabinet.com/product-sitemap5.xml",
      ],
      priceSelectors: [
        {
          type: "meta",
          pattern: "product:price:amount[\"']\\s+content=[\"']([\\d.]+)",
        },
        { type: "jsonLd", path: "price" },
      ],
      availabilitySelectors: [],
      skuExtraction: { urlSlugSuffix: true },
    },
    rateLimit: { delayMs: 1200, maxRetries: 2 },
    prefixMap: {
      "S-ONB-": ["BS-"],
      "S-MSL-": ["BS-"],
      "NB-": ["DB-"],
    },
  },
  {
    code: "HOMEDEPOT",
    name: "Home Depot",
    websiteUrl: "https://www.homedepot.com",
    providerType: "SERPAPI",
    isEnabled: true,
    apiConfig: { providerKey: "homedepot" },
  },
  {
    code: "LOWES",
    name: "Lowe's",
    websiteUrl: "https://www.lowes.com",
    providerType: "SERPAPI",
    isEnabled: true,
    apiConfig: { providerKey: "lowes" },
  },
];

@Injectable()
export class VendorRegistryService {
  private readonly logger = new Logger(VendorRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Seed default vendors (idempotent — skips existing codes). */
  async seedVendors() {
    let created = 0;
    for (const v of DEFAULT_VENDORS) {
      const existing = await this.prisma.vendorRegistry.findUnique({
        where: { code: v.code },
      });
      if (!existing) {
        await this.prisma.vendorRegistry.create({
          data: {
            code: v.code,
            name: v.name,
            websiteUrl: v.websiteUrl ?? null,
            providerType: v.providerType,
            isEnabled: v.isEnabled,
            scrapeConfig: v.scrapeConfig ?? undefined,
            apiConfig: v.apiConfig ?? undefined,
            rateLimit: v.rateLimit ?? undefined,
            skuPrefix: v.skuPrefix ?? null,
            prefixMap: v.prefixMap ?? undefined,
          },
        });
        created++;
      }
    }
    this.logger.log(`seedVendors: ${created} created, ${DEFAULT_VENDORS.length - created} already existed`);
    return { created, total: DEFAULT_VENDORS.length };
  }

  /** List all vendors (optionally filtered by enabled status). */
  async listVendors(onlyEnabled?: boolean) {
    const where = onlyEnabled ? { isEnabled: true } : {};
    return this.prisma.vendorRegistry.findMany({
      where,
      orderBy: { code: "asc" },
    });
  }

  /** Get a single vendor by code. */
  async getByCode(code: string) {
    return this.prisma.vendorRegistry.findUnique({ where: { code } });
  }

  /** Get a single vendor by id. */
  async getById(id: string) {
    return this.prisma.vendorRegistry.findUnique({ where: { id } });
  }

  /** Update a vendor's configuration. */
  async updateVendor(
    code: string,
    data: {
      name?: string;
      websiteUrl?: string | null;
      isEnabled?: boolean;
      scrapeConfig?: Record<string, any>;
      apiConfig?: Record<string, any>;
      rateLimit?: Record<string, any>;
      skuPrefix?: string | null;
      prefixMap?: Record<string, string[]>;
    },
  ) {
    return this.prisma.vendorRegistry.update({
      where: { code },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.websiteUrl !== undefined && { websiteUrl: data.websiteUrl }),
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        ...(data.scrapeConfig !== undefined && { scrapeConfig: data.scrapeConfig }),
        ...(data.apiConfig !== undefined && { apiConfig: data.apiConfig }),
        ...(data.rateLimit !== undefined && { rateLimit: data.rateLimit }),
        ...(data.skuPrefix !== undefined && { skuPrefix: data.skuPrefix }),
        ...(data.prefixMap !== undefined && { prefixMap: data.prefixMap }),
      },
    });
  }

  /** Create a new vendor. */
  async createVendor(seed: VendorSeed) {
    return this.prisma.vendorRegistry.create({
      data: {
        code: seed.code,
        name: seed.name,
        websiteUrl: seed.websiteUrl ?? null,
        providerType: seed.providerType,
        isEnabled: seed.isEnabled,
        scrapeConfig: seed.scrapeConfig ?? undefined,
        apiConfig: seed.apiConfig ?? undefined,
        rateLimit: seed.rateLimit ?? undefined,
        skuPrefix: seed.skuPrefix ?? null,
        prefixMap: seed.prefixMap ?? undefined,
      },
    });
  }
}
