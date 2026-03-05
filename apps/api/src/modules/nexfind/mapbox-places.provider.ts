import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Construction/restoration-relevant Mapbox POI categories.
 * See: https://docs.mapbox.com/api/search/search-box/#category-search
 */
const CONSTRUCTION_CATEGORIES = [
  "hardware_store",
  "home_improvement_store",
  "building_materials",
  "paint_store",
  "plumber",
  "electrician",
  "roofing_contractor",
  "general_contractor",
];

/**
 * Fallback text queries for specialty suppliers not well-covered by categories.
 */
const FALLBACK_KEYWORDS = [
  "lumber yard",
  "roofing supply",
  "electrical supply",
  "plumbing supply",
  "tool rental",
  "building materials",
  "construction supply",
];

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  category: string | null;
  types: string[];
}

@Injectable()
export class MapboxPlacesProvider {
  private readonly logger = new Logger(MapboxPlacesProvider.name);
  private readonly accessToken: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken =
      this.config.get<string>("MAPBOX_ACCESS_TOKEN") ??
      this.config.get<string>("NEXT_PUBLIC_MAPBOX_TOKEN") ??
      "";
  }

  isConfigured(): boolean {
    return !!this.accessToken;
  }

  /**
   * Discover construction-relevant suppliers near a given coordinate.
   *
   * Uses the Mapbox Search Box API — Category + Text search endpoints.
   * Returns up to `maxResults` unique places, de-duplicated by mapbox_id.
   */
  async searchNearby(
    lat: number,
    lng: number,
    radiusMeters: number = 24_140, // ~15 miles
    maxResults: number = 40,
  ): Promise<PlaceResult[]> {
    if (!this.accessToken) {
      this.logger.warn("MAPBOX_ACCESS_TOKEN not configured — skipping discovery");
      return [];
    }

    const seen = new Map<string, PlaceResult>();

    // ── Pass 1: Category search ──────────────────────────────────────────
    for (const category of CONSTRUCTION_CATEGORIES) {
      if (seen.size >= maxResults) break;

      try {
        const url = new URL("https://api.mapbox.com/search/searchbox/v1/category/" + category);
        url.searchParams.set("access_token", this.accessToken);
        url.searchParams.set("proximity", `${lng},${lat}`);
        url.searchParams.set("limit", "10");
        url.searchParams.set("language", "en");
        // Bounding box: rough square from radius
        const latPad = radiusMeters / 111_000;
        const lngPad = radiusMeters / (111_000 * Math.cos((lat * Math.PI) / 180));
        url.searchParams.set(
          "bbox",
          `${lng - lngPad},${lat - latPad},${lng + lngPad},${lat + latPad}`,
        );

        const res = await fetch(url.toString());

        if (res.ok) {
          const data = (await res.json()) as any;
          for (const feature of data.features ?? []) {
            const result = this.mapFeature(feature);
            if (result && !seen.has(result.placeId)) {
              seen.set(result.placeId, result);
            }
          }
        } else {
          const text = await res.text().catch(() => "");
          this.logger.warn(
            `Mapbox category search '${category}' failed (${res.status}): ${text.slice(0, 200)}`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Mapbox category search '${category}' error: ${err?.message}`);
      }
    }

    this.logger.log(`Mapbox category search: ${seen.size} results near ${lat},${lng}`);

    // ── Pass 2: Text search for specialty suppliers ──────────────────────
    if (seen.size < maxResults) {
      for (const keyword of FALLBACK_KEYWORDS) {
        if (seen.size >= maxResults) break;

        try {
          const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward");
          url.searchParams.set("q", keyword);
          url.searchParams.set("access_token", this.accessToken);
          url.searchParams.set("proximity", `${lng},${lat}`);
          url.searchParams.set("limit", "5");
          url.searchParams.set("language", "en");
          url.searchParams.set("types", "poi");
          // Same bounding box
          const latPad = radiusMeters / 111_000;
          const lngPad = radiusMeters / (111_000 * Math.cos((lat * Math.PI) / 180));
          url.searchParams.set(
            "bbox",
            `${lng - lngPad},${lat - latPad},${lng + lngPad},${lat + latPad}`,
          );

          const res = await fetch(url.toString());

          if (res.ok) {
            const data = (await res.json()) as any;
            for (const feature of data.features ?? []) {
              const result = this.mapFeature(feature);
              if (result && !seen.has(result.placeId)) {
                seen.set(result.placeId, result);
              }
            }
          }
        } catch {
          // Non-fatal; continue with next keyword
        }
      }
    }

    this.logger.log(`Mapbox discovery total: ${seen.size} unique suppliers near ${lat},${lng}`);
    return Array.from(seen.values()).slice(0, maxResults);
  }

  /** Map a Mapbox Search Box GeoJSON feature to our internal PlaceResult. */
  private mapFeature(feature: any): PlaceResult | null {
    const id = feature.properties?.mapbox_id;
    if (!id) return null;

    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;

    const lng = coords[0];
    const lat = coords[1];
    if (lat == null || lng == null) return null;

    const props = feature.properties ?? {};
    const poiCategory = props.poi_category ?? "";
    const poiCategoryIds = props.poi_category_ids ?? [];

    const category = this.inferCategory(poiCategory, poiCategoryIds);

    return {
      placeId: id,
      name: props.name ?? props.name_preferred ?? "Unknown",
      address: props.full_address ?? props.address ?? null,
      phone: props.phone ?? null,
      website: props.website ?? null,
      lat,
      lng,
      category,
      types: Array.isArray(poiCategoryIds) ? poiCategoryIds : [],
    };
  }

  /** Map Mapbox POI categories to human-readable supplier categories. */
  private inferCategory(
    poiCategory: string,
    categoryIds: string[],
  ): string | null {
    const all = [poiCategory, ...categoryIds]
      .map((t) => (typeof t === "string" ? t.toLowerCase() : ""))
      .filter(Boolean);

    if (all.some((t) => t.includes("hardware"))) return "Hardware Store";
    if (all.some((t) => t.includes("home_improvement"))) return "Home Improvement";
    if (all.some((t) => t.includes("lumber"))) return "Lumber Yard";
    if (all.some((t) => t.includes("roofing"))) return "Roofing Supply";
    if (all.some((t) => t.includes("electric"))) return "Electrical Supply";
    if (all.some((t) => t.includes("plumb"))) return "Plumbing Supply";
    if (all.some((t) => t.includes("paint"))) return "Paint Store";
    if (all.some((t) => t.includes("building_material"))) return "Building Materials";
    if (all.some((t) => t.includes("tool"))) return "Tool Rental";
    if (all.some((t) => t.includes("contractor"))) return "Contractor Supply";

    return null;
  }
}
