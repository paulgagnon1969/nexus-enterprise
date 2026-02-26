/**
 * BOM Cabinet Matcher Service
 *
 * Enhanced matching for cabinet BOM lines using specHash for exact product identity.
 * Falls back to keyword matching for non-cabinet items.
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { buildSpecHash, normalizeDimension } from "@repo/database";
import type { DrawingBomLine } from "@prisma/client";

export interface CabinetSpec {
  finish: string | null;
  cabinetType: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
}

export interface BomMatchResult {
  companyPriceListItemId: string;
  confidence: number;
  method: "SPEC_HASH" | "SKU_EXACT" | "KEYWORD";
  unitPrice: number | null;
  catalogItemId?: string;
  vendorQuotes?: Array<{
    vendor: string;
    sku: string;
    price: number;
    url: string;
  }>;
}

@Injectable()
export class BomCabinetMatcherService {
  private readonly logger = new Logger(BomCabinetMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extract cabinet specifications from a BOM line description.
   * Examples:
   *   "White Shaker 24\" Base Cabinet - 24W x 34.5H x 24D"
   *   "36\" Wall Cabinet - Charcoal Black Shaker (36W x 30H x 12D)"
   */
  private extractCabinetSpec(description: string): CabinetSpec | null {
    if (!description) return null;

    // Common cabinet keywords
    const cabinetKeywords = [
      "cabinet",
      "vanity",
      "base",
      "wall",
      "upper",
      "drawer",
      "pantry",
      "lazy susan",
    ];
    const lowerDesc = description.toLowerCase();
    const hasKeyword = cabinetKeywords.some((kw) => lowerDesc.includes(kw));
    if (!hasKeyword) return null;

    // Extract dimensions: "24W x 34.5H x 24D" or "24\"W x 34.5\"H x 24\"D"
    const dimPattern = /(\d+(?:[.\s-]\d+\/\d+|\.?\d*))\s*"?\s*W?\s*[×x]\s*(\d+(?:[.\s-]\d+\/\d+|\.?\d*))\s*"?\s*H?\s*[×x]\s*(\d+(?:[.\s-]\d+\/\d+|\.?\d*))\s*"?\s*D?/i;
    const dimMatch = description.match(dimPattern);

    const width = dimMatch ? normalizeDimension(dimMatch[1]) : null;
    const height = dimMatch ? normalizeDimension(dimMatch[2]) : null;
    const depth = dimMatch ? normalizeDimension(dimMatch[3]) : null;

    // Extract finish/color (common patterns)
    const finishPatterns = [
      "white shaker",
      "charcoal black shaker",
      "black shaker",
      "gray shaker",
      "navy blue shaker",
      "shaker espresso",
      "dove white",
      "charleston white",
      "frameless gloss",
      "slim oak",
    ];
    let finish: string | null = null;
    for (const pattern of finishPatterns) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(description)) {
        finish = pattern
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        break;
      }
    }

    // Extract cabinet type (strip finish and dimensions)
    let cabinetType = description;
    if (finish) {
      cabinetType = cabinetType.replace(new RegExp(finish, "i"), "").trim();
    }
    if (dimMatch) {
      cabinetType = cabinetType.replace(dimPattern, "").trim();
    }
    // Remove leading dimension markers like "24\" " or "36\" H "
    cabinetType = cabinetType.replace(/^\d+["\u2033]\s*[HWD]?\s*/i, "").trim();
    // Remove trailing " - "
    cabinetType = cabinetType.replace(/\s*-\s*$/, "").trim();

    return { finish, cabinetType, width, height, depth };
  }

  /**
   * Match a BOM line to a cost book item using specHash (cabinet-specific).
   */
  async matchCabinetBomLine(
    bomLine: DrawingBomLine,
    companyId: string,
  ): Promise<BomMatchResult | null> {
    const spec = this.extractCabinetSpec(bomLine.description || "");
    if (!spec || !spec.width || !spec.height) {
      this.logger.debug(`No cabinet spec extracted from: ${bomLine.description}`);
      return null;
    }

    // Build specHash
    const specHash = buildSpecHash({
      category: "KIT",
      productType: spec.cabinetType || "",
      width: spec.width,
      height: spec.height,
      depth: spec.depth,
      finish: spec.finish,
    });

    this.logger.debug(`Computed specHash: ${specHash} for ${bomLine.description}`);

    // 1. Try to match via CatalogItem → CompanyPriceListItem
    const catalogItem = await this.prisma.catalogItem.findUnique({
      where: { specHash },
      include: {
        vendorQuotes: {
          include: { vendor: true },
          orderBy: { unitPrice: "asc" },
        },
      },
    });

    if (catalogItem) {
      this.logger.log(`Found CatalogItem ${catalogItem.id} for specHash ${specHash}`);

      // Find matching cost book item (may be linked via sourceVendor or SKU)
      const costBookItem = await this.prisma.companyPriceListItem.findFirst({
        where: {
          companyPriceList: { companyId },
          OR: [
            // Match by SEL if vendor quotes exist
            ...(catalogItem.vendorQuotes
              .filter((vq) => vq.vendorSku)
              .map((vq) => ({
                sel: { equals: vq.vendorSku },
              })) || []),
            // Match by description containing product type
            {
              description: {
                contains: spec.cabinetType || "",
                mode: "insensitive" as const,
              },
            },
          ],
        },
        orderBy: { unitPrice: "asc" },
      });

      if (costBookItem) {
        return {
          companyPriceListItemId: costBookItem.id,
          confidence: 0.95, // High confidence for specHash match
          method: "SPEC_HASH",
          unitPrice: costBookItem.unitPrice,
          catalogItemId: catalogItem.id,
          vendorQuotes: catalogItem.vendorQuotes.map((vq) => ({
            vendor: vq.vendor.name,
            sku: vq.vendorSku || "",
            price: vq.unitPrice || 0,
            url: vq.productUrl || "",
          })),
        };
      }

      // No cost book match, but we have vendor quotes
      if (catalogItem.vendorQuotes.length > 0) {
        this.logger.warn(
          `CatalogItem ${catalogItem.id} found but no CompanyPriceListItem. Tenant may need to share Master BWC items.`,
        );
      }
    }

    // 2. Fallback: try SKU-based exact match
    const sel = bomLine.specification || bomLine.description?.match(/\b[A-Z]{2,3}-[A-Z0-9-]+\b/)?.[0];
    if (sel) {
      const skuMatch = await this.prisma.companyPriceListItem.findFirst({
        where: {
          companyPriceList: { companyId },
          sel: { equals: sel, mode: "insensitive" },
        },
      });

      if (skuMatch) {
        return {
          companyPriceListItemId: skuMatch.id,
          confidence: 0.9,
          method: "SKU_EXACT",
          unitPrice: skuMatch.unitPrice,
        };
      }
    }

    return null;
  }

  /**
   * Batch match cabinet BOM lines for a drawing upload.
   */
  async matchCabinetBomLines(uploadId: string): Promise<{
    matchedCount: number;
    unmatchedCount: number;
    catalogMatches: number;
    skuMatches: number;
  }> {
    const upload = await this.prisma.projectDrawingUpload.findUnique({
      where: { id: uploadId },
      include: { bomLines: true },
    });

    if (!upload) {
      throw new Error("Upload not found");
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    let catalogMatches = 0;
    let skuMatches = 0;

    for (const bomLine of upload.bomLines) {
      const match = await this.matchCabinetBomLine(bomLine, upload.companyId);

      if (match && match.confidence >= 0.7) {
        await this.prisma.drawingBomLine.update({
          where: { id: bomLine.id },
          data: {
            matchedCostBookItemId: match.companyPriceListItemId,
            matchConfidence: match.confidence,
            matchMethod: match.method,
            unitPrice: match.unitPrice,
            totalPrice:
              match.unitPrice != null && bomLine.qty != null
                ? match.unitPrice * bomLine.qty
                : null,
            isMatched: true,
          },
        });
        matchedCount++;

        if (match.method === "SPEC_HASH") catalogMatches++;
        if (match.method === "SKU_EXACT") skuMatches++;
      } else {
        unmatchedCount++;
      }
    }

    await this.prisma.projectDrawingUpload.update({
      where: { id: uploadId },
      data: { matchedBomLines: matchedCount, unmatchedBomLines: unmatchedCount },
    });

    this.logger.log(
      `Cabinet BOM matching for ${uploadId}: ${matchedCount} matched (${catalogMatches} catalog, ${skuMatches} SKU), ${unmatchedCount} unmatched`,
    );

    return { matchedCount, unmatchedCount, catalogMatches, skuMatches };
  }
}
