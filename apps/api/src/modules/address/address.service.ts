import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AddressService {
  constructor(private readonly config: ConfigService) {}

  async lookupZip(zip: string) {
    const trimmed = (zip || "").trim();
    if (!trimmed) {
      throw new BadRequestException("ZIP/postal code is required");
    }

    const authId = this.config.get<string>("SMARTY_AUTH_ID");
    const authToken = this.config.get<string>("SMARTY_AUTH_TOKEN");
    const baseUrl =
      this.config.get<string>("SMARTY_US_ZIP_URL") ??
      "https://us-zipcode.api.smarty.com/lookup";

    if (!authId || !authToken) {
      throw new BadRequestException("Address lookup is not configured");
    }

    const url = `${baseUrl}?auth-id=${encodeURIComponent(
      authId,
    )}&auth-token=${encodeURIComponent(authToken)}&zipcode=${encodeURIComponent(
      trimmed,
    )}`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new BadRequestException(
        `Address lookup failed (${res.status}) ${text}`,
      );
    }

    const data = (await res.json()) as any[];
    const first = data[0];
    if (!first || !Array.isArray(first.city_states) || !first.city_states[0]) {
      throw new BadRequestException("No city/state found for that ZIP");
    }

    const city = first.city_states[0].city;
    const state = first.city_states[0].state_abbreviation;
    const county = first.city_states[0].county_fips
      ? first.city_states[0].county_fips
      : null;

    return {
      zip: trimmed,
      city,
      state,
      county,
    };
  }
}
