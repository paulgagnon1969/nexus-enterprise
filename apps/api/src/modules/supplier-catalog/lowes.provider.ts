import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../infra/redis/redis.service";
import type {
  CatalogProvider,
  CatalogProduct,
  CatalogSearchResult,
  CatalogSearchOptions,
  StoreAvailability,
} from "./catalog-provider.interface";

const AUTH_URL = "https://apim.lowes.com/auth/token";
const TOKEN_CACHE_KEY = "catalog:lowes:token";
// Cache token for 50 minutes (typical OAuth tokens last 60 min)
const TOKEN_CACHE_TTL = 3000;

@Injectable()
export class LowesProvider implements CatalogProvider {
  readonly providerKey = "lowes";
  readonly displayName = "Lowe's";

  private readonly logger = new Logger(LowesProvider.name);
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.clientId = this.config.get<string>("LOWES_CLIENT_ID");
    this.clientSecret = this.config.get<string>("LOWES_CLIENT_SECRET");

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        "LOWES_CLIENT_ID / LOWES_CLIENT_SECRET not set — Lowe's catalog will be disabled.",
      );
    } else {
      this.logger.log("Lowe's IMS credentials configured — auth ready.");
    }
  }

  isEnabled(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  // -------------------------------------------------------------------------
  // OAuth Token Management
  // -------------------------------------------------------------------------

  /** Get a valid access token, refreshing from IMS if needed. */
  async getAccessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) return null;

    // Check Redis cache first
    const cached = await this.redis.getJson<{ access_token: string }>(TOKEN_CACHE_KEY);
    if (cached?.access_token) return cached.access_token;

    try {
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const res = await fetch(AUTH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        this.logger.error(`Lowe's IMS auth failed (${res.status}): ${errText.slice(0, 300)}`);
        return null;
      }

      const data = (await res.json()) as any;
      const token = data.access_token;

      if (!token) {
        this.logger.error("Lowe's IMS response missing access_token");
        return null;
      }

      // Cache with TTL slightly less than the token's expiry
      const expiresIn = data.expires_in ? Math.max(data.expires_in - 120, 60) : TOKEN_CACHE_TTL;
      await this.redis.setJson(TOKEN_CACHE_KEY, { access_token: token }, expiresIn);

      this.logger.log("Lowe's IMS token acquired successfully.");
      return token;
    } catch (err: any) {
      this.logger.error(`Lowe's IMS auth request failed: ${err?.message ?? err}`);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Product APIs — stub until Lowe's product endpoints are available
  // -------------------------------------------------------------------------

  async searchProducts(
    query: string,
    _options?: CatalogSearchOptions,
  ): Promise<CatalogSearchResult> {
    // TODO: Once Lowe's product search API is available, implement here.
    // For now, verify auth is working and return empty.
    if (this.isEnabled()) {
      const token = await this.getAccessToken();
      if (!token) {
        this.logger.warn("Lowe's search skipped — auth failed.");
      }
    }

    return {
      provider: this.providerKey,
      query,
      totalResults: 0,
      page: 1,
      products: [],
    };
  }

  async getProduct(
    _productId: string,
    _zipCode?: string,
  ): Promise<CatalogProduct | null> {
    // TODO: Implement once Lowe's product detail API is available.
    return null;
  }

  async getStoreAvailability(
    productId: string,
    zipCode: string,
  ): Promise<StoreAvailability> {
    // TODO: Implement once Lowe's inventory API is available.
    return {
      provider: this.providerKey,
      productId,
      zipCode,
      stores: [],
    };
  }

  // -------------------------------------------------------------------------
  // Authenticated HTTP helper (for future product API calls)
  // -------------------------------------------------------------------------

  /** Make an authenticated GET request to a Lowe's API endpoint. */
  async authenticatedGet(url: string): Promise<any | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.warn(`Lowe's API ${res.status}: ${body.slice(0, 200)}`);
        return null;
      }

      return res.json();
    } catch (err: any) {
      this.logger.warn(`Lowe's API request failed: ${err?.message ?? err}`);
      return null;
    }
  }
}
