import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Construction/restoration-relevant place types for Google Places API (New). */
const CONSTRUCTION_PLACE_TYPES = [
  "hardware_store",
  "home_improvement_store",
  "electrician",
  "plumber",
  "painter",
  "roofing_contractor",
  "general_contractor",
  "building_materials_store",
];

/**
 * Fallback: broader text-search keywords when type-based search returns few
 * results. These are queried as a second pass.
 */
const FALLBACK_KEYWORDS = [
  "lumber yard",
  "roofing supply",
  "electrical supply",
  "plumbing supply",
  "paint store",
  "tool rental",
  "building materials",
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
export class GooglePlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>("GOOGLE_PLACES_API_KEY") ?? "";
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Discover construction-relevant suppliers near a given coordinate.
   *
   * Uses the Google Places API (New) — Nearby Search endpoint.
   * Returns up to `maxResults` unique places, de-duplicated by placeId.
   */
  async searchNearby(
    lat: number,
    lng: number,
    radiusMeters: number = 24_140, // ~15 miles
    maxResults: number = 40,
  ): Promise<PlaceResult[]> {
    if (!this.apiKey) {
      this.logger.warn("GOOGLE_PLACES_API_KEY not configured — skipping discovery");
      return [];
    }

    const seen = new Map<string, PlaceResult>();

    // ── Pass 1: Type-based nearby search ─────────────────────────────────
    try {
      const body = {
        includedTypes: CONSTRUCTION_PLACE_TYPES,
        maxResultCount: Math.min(maxResults, 20),
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
      };

      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.apiKey,
            "X-Goog-FieldMask":
              "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.types,places.primaryType",
          },
          body: JSON.stringify(body),
        },
      );

      if (res.ok) {
        const data = (await res.json()) as any;
        for (const place of data.places ?? []) {
          const result = this.mapPlace(place);
          if (result && !seen.has(result.placeId)) {
            seen.set(result.placeId, result);
          }
        }
        this.logger.log(`Places type search: ${seen.size} results near ${lat},${lng}`);
      } else {
        const text = await res.text().catch(() => "");
        this.logger.warn(`Places API type search failed (${res.status}): ${text.slice(0, 300)}`);
      }
    } catch (err: any) {
      this.logger.warn(`Places type search error: ${err?.message}`);
    }

    // ── Pass 2: Text-based search for specialty suppliers ────────────────
    if (seen.size < maxResults) {
      for (const keyword of FALLBACK_KEYWORDS) {
        if (seen.size >= maxResults) break;

        try {
          const body = {
            textQuery: keyword,
            maxResultCount: 5,
            locationBias: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: radiusMeters,
              },
            },
          };

          const res = await fetch(
            "https://places.googleapis.com/v1/places:searchText",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": this.apiKey,
                "X-Goog-FieldMask":
                  "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.location,places.types,places.primaryType",
              },
              body: JSON.stringify(body),
            },
          );

          if (res.ok) {
            const data = (await res.json()) as any;
            for (const place of data.places ?? []) {
              const result = this.mapPlace(place);
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

    this.logger.log(`Places discovery total: ${seen.size} unique suppliers near ${lat},${lng}`);
    return Array.from(seen.values()).slice(0, maxResults);
  }

  /** Map a Google Places API (New) result to our internal shape. */
  private mapPlace(place: any): PlaceResult | null {
    const placeId = place.id;
    if (!placeId) return null;

    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (lat == null || lng == null) return null;

    const category = this.inferCategory(
      place.primaryType ?? "",
      place.types ?? [],
    );

    return {
      placeId,
      name: place.displayName?.text ?? "Unknown",
      address: place.formattedAddress ?? null,
      phone: place.nationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
      lat,
      lng,
      category,
      types: place.types ?? [],
    };
  }

  /** Map Google place types to a human-readable supplier category. */
  private inferCategory(primaryType: string, types: string[]): string | null {
    const all = [primaryType, ...types].map((t) => t.toLowerCase());

    if (all.some((t) => t.includes("hardware"))) return "Hardware Store";
    if (all.some((t) => t.includes("home_improvement"))) return "Home Improvement";
    if (all.some((t) => t.includes("lumber"))) return "Lumber Yard";
    if (all.some((t) => t.includes("roofing"))) return "Roofing Supply";
    if (all.some((t) => t.includes("electric"))) return "Electrical Supply";
    if (all.some((t) => t.includes("plumb"))) return "Plumbing Supply";
    if (all.some((t) => t.includes("paint"))) return "Paint Store";
    if (all.some((t) => t.includes("building_materials"))) return "Building Materials";
    if (all.some((t) => t.includes("tool"))) return "Tool Rental";
    if (all.some((t) => t.includes("contractor"))) return "Contractor Supply";

    return null;
  }
}
