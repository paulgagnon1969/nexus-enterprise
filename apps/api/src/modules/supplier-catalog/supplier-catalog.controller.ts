import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { JwtAuthGuard, getEffectiveRoleLevel } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";
import { SupplierCatalogService } from "./supplier-catalog.service";

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

@Controller("supplier-catalog")
@UseGuards(JwtAuthGuard)
export class SupplierCatalogController {
  constructor(private readonly catalog: SupplierCatalogService) {}

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
}
