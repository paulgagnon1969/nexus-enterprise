import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface GeocodingResult {
  latitude: number;
  longitude: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly accessToken: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>("MAPBOX_ACCESS_TOKEN") ?? "";
  }

  /**
   * Forward-geocode a street address into lat/lng using the Mapbox Geocoding API.
   * Returns null if the address cannot be resolved or the service is not configured.
   */
  async geocode(address: {
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  }): Promise<GeocodingResult | null> {
    if (!this.accessToken) {
      this.logger.warn("MAPBOX_ACCESS_TOKEN not configured — skipping geocode");
      return null;
    }

    const parts = [
      address.addressLine1,
      address.city,
      address.state,
      address.postalCode,
      address.country,
    ].filter(Boolean);

    if (parts.length === 0) return null;

    const query = encodeURIComponent(parts.join(", "));
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${this.accessToken}&limit=1&types=address,place,postcode`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.warn(
          `Mapbox geocoding error (${res.status}): ${text.slice(0, 200)}`,
        );
        return null;
      }

      const data = (await res.json()) as any;
      const feature = data?.features?.[0];
      if (!feature?.center || feature.center.length < 2) {
        this.logger.debug(`No geocoding result for: ${parts.join(", ")}`);
        return null;
      }

      // Mapbox returns [longitude, latitude]
      const [longitude, latitude] = feature.center;
      return { latitude, longitude };
    } catch (err: any) {
      this.logger.warn(`Geocoding request failed: ${err?.message ?? err}`);
      return null;
    }
  }

  /** Check if the geocoding service is configured. */
  isConfigured(): boolean {
    return !!this.accessToken;
  }
}
