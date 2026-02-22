import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infra/prisma/prisma.service";

export interface HourlyWeatherData {
  datetime: string;
  temp: number | null;
  precip: number | null;
  precipProb: number | null;
}

export interface WeatherData {
  tempMax: number | null;
  tempMin: number | null;
  temp: number | null;
  feelsLike: number | null;
  humidity: number | null;
  precip: number | null;
  precipProb: number | null;
  windSpeed: number | null;
  windGust: number | null;
  windDir: number | null;
  cloudCover: number | null;
  uvIndex: number | null;
  conditions: string | null;
  description: string | null;
  icon: string | null;
  sunrise: string | null;
  sunset: string | null;
  hours: HourlyWeatherData[];
}

export interface WeatherResult {
  summary: string;
  data: WeatherData;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl =
    "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline";

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = this.config.get<string>("VISUAL_CROSSING_API_KEY");
    if (!this.apiKey) {
      this.logger.warn(
        "VISUAL_CROSSING_API_KEY is not set — weather auto-fill will be disabled",
      );
    }
  }

  /**
   * Fetch weather for a lat/lng on a specific date from Visual Crossing.
   * Returns null if the API key is missing or the request fails.
   */
  async getWeather(
    lat: number,
    lng: number,
    date: string,
  ): Promise<WeatherResult | null> {
    if (!this.apiKey) return null;

    const location = `${lat},${lng}`;
    const url =
      `${this.baseUrl}/${encodeURIComponent(location)}/${date}` +
      `?unitGroup=us&key=${this.apiKey}&include=days,hours&elements=` +
      `tempmax,tempmin,temp,feelslike,humidity,precip,precipprob,` +
      `windspeed,windgust,winddir,cloudcover,uvindex,conditions,description,icon,sunrise,sunset,datetime`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.warn(
          `Visual Crossing API error (${res.status}): ${text.slice(0, 200)}`,
        );
        return null;
      }

      const json = (await res.json()) as any;
      const day = json?.days?.[0];
      if (!day) {
        this.logger.warn("Visual Crossing returned no day data");
        return null;
      }

      const hours: HourlyWeatherData[] = (day.hours ?? []).map((h: any) => ({
        datetime: h.datetime ?? "",
        temp: h.temp ?? null,
        precip: h.precip ?? null,
        precipProb: h.precipprob ?? null,
      }));

      const data: WeatherData = {
        tempMax: day.tempmax ?? null,
        tempMin: day.tempmin ?? null,
        temp: day.temp ?? null,
        feelsLike: day.feelslike ?? null,
        humidity: day.humidity ?? null,
        precip: day.precip ?? null,
        precipProb: day.precipprob ?? null,
        windSpeed: day.windspeed ?? null,
        windGust: day.windgust ?? null,
        windDir: day.winddir ?? null,
        cloudCover: day.cloudcover ?? null,
        uvIndex: day.uvindex ?? null,
        conditions: day.conditions ?? null,
        description: day.description ?? null,
        icon: day.icon ?? null,
        sunrise: day.sunrise ?? null,
        sunset: day.sunset ?? null,
        hours,
      };

      return {
        summary: this.formatSummary(data),
        data,
      };
    } catch (err: any) {
      this.logger.warn(
        `Visual Crossing fetch failed: ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * Fetch weather for a specific date using a location string
   * (address, city, or ZIP code).
   */
  async getWeatherByLocation(
    location: string,
    date: string,
  ): Promise<WeatherResult | null> {
    if (!this.apiKey) return null;

    const url =
      `${this.baseUrl}/${encodeURIComponent(location)}/${date}` +
      `?unitGroup=us&key=${this.apiKey}&include=days,hours&elements=` +
      `tempmax,tempmin,temp,feelslike,humidity,precip,precipprob,` +
      `windspeed,windgust,winddir,cloudcover,uvindex,conditions,description,icon,sunrise,sunset,datetime`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.warn(
          `Visual Crossing location lookup error (${res.status}): ${text.slice(0, 200)}`,
        );
        return null;
      }

      const json = (await res.json()) as any;
      const day = json?.days?.[0];
      if (!day) return null;

      const hours: HourlyWeatherData[] = (day.hours ?? []).map((h: any) => ({
        datetime: h.datetime ?? "",
        temp: h.temp ?? null,
        precip: h.precip ?? null,
        precipProb: h.precipprob ?? null,
      }));

      const data: WeatherData = {
        tempMax: day.tempmax ?? null,
        tempMin: day.tempmin ?? null,
        temp: day.temp ?? null,
        feelsLike: day.feelslike ?? null,
        humidity: day.humidity ?? null,
        precip: day.precip ?? null,
        precipProb: day.precipprob ?? null,
        windSpeed: day.windspeed ?? null,
        windGust: day.windgust ?? null,
        windDir: day.winddir ?? null,
        cloudCover: day.cloudcover ?? null,
        uvIndex: day.uvindex ?? null,
        conditions: day.conditions ?? null,
        description: day.description ?? null,
        icon: day.icon ?? null,
        sunrise: day.sunrise ?? null,
        sunset: day.sunset ?? null,
        hours,
      };

      return {
        summary: this.formatSummary(data),
        data,
      };
    } catch (err: any) {
      this.logger.warn(
        `Visual Crossing location fetch failed: ${err?.message ?? err}`,
      );
      return null;
    }
  }

  /**
   * High-level helper: fetch weather for a project on a given date.
   * Resolves the project's lat/lng or falls back to postal code / city+state.
   */
  async getWeatherForProject(
    projectId: string,
    companyId: string,
    date: string,
  ): Promise<WeatherResult | null> {
    if (!this.apiKey) return null;

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: {
        latitude: true,
        longitude: true,
        postalCode: true,
        city: true,
        state: true,
      },
    });

    if (!project) return null;

    // Prefer lat/lng
    if (project.latitude != null && project.longitude != null) {
      return this.getWeather(project.latitude, project.longitude, date);
    }

    // Fallback: postal code
    if (project.postalCode) {
      return this.getWeatherByLocation(project.postalCode, date);
    }

    // Fallback: city, state
    if (project.city && project.state) {
      return this.getWeatherByLocation(
        `${project.city}, ${project.state}`,
        date,
      );
    }

    this.logger.warn(
      `Project ${projectId} has no geocode or address for weather lookup`,
    );
    return null;
  }

  /**
   * Build a human-readable one-line summary suitable for `weatherSummary`.
   * Example: "72°F Hi / 58°F Lo, Partly Cloudy, Wind 12 mph, Precip 0.1 in, Humidity 65%"
   */
  formatSummary(data: WeatherData): string {
    const parts: string[] = [];

    if (data.tempMax != null && data.tempMin != null) {
      parts.push(`${Math.round(data.tempMax)}°F Hi / ${Math.round(data.tempMin)}°F Lo`);
    }

    if (data.conditions) {
      parts.push(data.conditions);
    }

    if (data.windSpeed != null) {
      parts.push(`Wind ${Math.round(data.windSpeed)} mph`);
    }

    if (data.precip != null && data.precip > 0) {
      parts.push(`Precip ${data.precip} in`);
    }

    if (data.humidity != null) {
      parts.push(`Humidity ${Math.round(data.humidity)}%`);
    }

    return parts.join(", ") || "Weather data unavailable";
  }

  /**
   * Check if the weather service is configured (API key present).
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}
