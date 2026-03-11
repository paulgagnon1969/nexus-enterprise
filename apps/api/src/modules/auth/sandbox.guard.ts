import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService, CACHE_TTL } from "../../infra/redis/redis.service";
import { SANDBOX_RESTRICTED_KEY } from "./sandbox.decorator";
import { GlobalRole } from "./auth.guards";
import type { AuthenticatedUser } from "./jwt.strategy";

const SANDBOX_CACHE_KEY = "sandbox:company-ids";

/**
 * Global guard that blocks endpoints decorated with @SandboxRestricted()
 * when the authenticated user's current company is a sandbox tenant.
 *
 * Registration: APP_GUARD in app.module.ts
 *
 * Flow:
 *  1. Read @SandboxRestricted metadata — if absent, allow through (fast path).
 *  2. Check if request.user exists and has a companyId.
 *  3. Look up sandbox company IDs (Redis-cached, 5-min TTL).
 *  4. If companyId is a sandbox company AND the endpoint is restricted → 403.
 *  5. SUPER_ADMIN always bypasses.
 */
@Injectable()
export class SandboxGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Fast path: if no @SandboxRestricted decorator, allow immediately.
    const reason = this.reflector.getAllAndOverride<string | undefined>(
      SANDBOX_RESTRICTED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!reason) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    // Not yet authenticated — let the route's own auth guard handle it.
    if (!user?.companyId) return true;

    // SUPER_ADMIN bypasses all sandbox restrictions.
    if (user.globalRole === GlobalRole.SUPER_ADMIN) return true;

    // Check if the user's current company is a sandbox tenant.
    const sandboxIds = await this.getSandboxCompanyIds();
    if (!sandboxIds.has(user.companyId)) return true;

    throw new ForbiddenException(reason);
  }

  /**
   * Returns the set of company IDs where isSandbox = true.
   * Cached in Redis for 5 minutes to avoid per-request DB queries.
   */
  private async getSandboxCompanyIds(): Promise<Set<string>> {
    // Try cache first
    const cached = await this.redis.getJson<string[]>(SANDBOX_CACHE_KEY);
    if (cached) return new Set(cached);

    // Cache miss — query DB
    const companies = await this.prisma.company.findMany({
      where: { isSandbox: true },
      select: { id: true },
    });

    const ids = companies.map((c) => c.id);
    await this.redis.setJson(SANDBOX_CACHE_KEY, ids, CACHE_TTL.SHORT);

    return new Set(ids);
  }
}
