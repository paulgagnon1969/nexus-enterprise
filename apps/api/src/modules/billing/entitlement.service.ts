import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { RedisService } from "../../infra/redis/redis.service";

/** Cache TTL for entitlements: 60 seconds. */
const ENTITLEMENT_TTL = 60;

/** Cache key for a company's entitlements. */
const entitlementKey = (companyId: string) => `entitlements:${companyId}`;

/** Cache key for a per-project feature unlock. */
const projectFeatureKey = (companyId: string, projectId: string, featureCode: string) =>
  `project-feature:${companyId}:${projectId}:${featureCode}`;

export interface EntitlementResult {
  moduleCode: string;
  enabled: boolean;
  reason: "subscription" | "override" | "trial" | "none";
}

@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Check if a specific module is enabled for a company.
   * Uses Redis cache with 60s TTL.
   * Fails open (returns true) if entitlement check errors, so a DB/Redis
   * outage doesn't block all gated routes.
   */
  async isModuleEnabled(companyId: string, moduleCode: string): Promise<boolean> {
    try {
      const entitlements = await this.getEntitlements(companyId);
      // If the catalog is empty (not yet seeded), allow everything
      if (entitlements.length === 0) return true;
      const entry = entitlements.find(e => e.moduleCode === moduleCode);
      return entry?.enabled ?? false;
    } catch (err) {
      console.warn(`[EntitlementService] isModuleEnabled failed for ${moduleCode}: ${err}. Allowing access (fail-open).`);
      return true;
    }
  }

  /**
   * Get all entitlements for a company (cached).
   */
  async getEntitlements(companyId: string): Promise<EntitlementResult[]> {
    // Check cache first
    try {
      const cached = await this.redis.getJson<EntitlementResult[]>(entitlementKey(companyId));
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall through to DB
    }

    // Resolve from DB
    const entitlements = await this.resolveEntitlements(companyId);

    // Cache result (best-effort)
    try {
      await this.redis.setJson(entitlementKey(companyId), entitlements, ENTITLEMENT_TTL);
    } catch {
      // Redis unavailable — skip cache
    }

    return entitlements;
  }

  /**
   * Invalidate the entitlement cache for a company (call after module toggle
   * or subscription status change).
   */
  async invalidate(companyId: string): Promise<void> {
    try { await this.redis.del(entitlementKey(companyId)); } catch { /* Redis unavailable */ }
  }

  /**
   * Check if a PER_PROJECT feature is unlocked on a specific project.
   * Returns true if a ProjectFeatureUnlock record exists, or if the
   * company is on an active trial.
   * Fails open on error.
   */
  async isProjectFeatureUnlocked(
    companyId: string,
    projectId: string,
    featureCode: string,
  ): Promise<boolean> {
    try {
      return await this._isProjectFeatureUnlocked(companyId, projectId, featureCode);
    } catch (err) {
      console.warn(`[EntitlementService] isProjectFeatureUnlocked failed: ${err}. Allowing access (fail-open).`);
      return true;
    }
  }

  private async _isProjectFeatureUnlocked(
    companyId: string,
    projectId: string,
    featureCode: string,
  ): Promise<boolean> {
    const cacheKey = projectFeatureKey(companyId, projectId, featureCode);
    let cached: boolean | null | undefined;
    try {
      cached = await this.redis.getJson<boolean>(cacheKey);
    } catch {
      // Redis unavailable
    }
    if (cached !== null && cached !== undefined) return cached;

    // Check active trial first — trial tenants get everything
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { isTrial: true, trialEndsAt: true, trialStatus: true, isInternal: true },
    });

    // Internal tenants permanently bypass all feature checks.
    if (company?.isInternal) {
      try { await this.redis.setJson(cacheKey, true, ENTITLEMENT_TTL); } catch { /* */ }
      return true;
    }

    const isActiveTrial =
      company?.isTrial &&
      company.trialStatus === "ACTIVE" &&
      company.trialEndsAt &&
      company.trialEndsAt > new Date();

    if (isActiveTrial) {
      try { await this.redis.setJson(cacheKey, true, ENTITLEMENT_TTL); } catch { /* */ }
      return true;
    }

    // Check for unlock record
    const unlock = await this.prisma.projectFeatureUnlock.findUnique({
      where: {
        ProjectFeatureUnlock_company_project_feature_key: {
          companyId,
          projectId,
          featureCode,
        },
      },
    });

    const unlocked = !!unlock;
    try { await this.redis.setJson(cacheKey, unlocked, ENTITLEMENT_TTL); } catch { /* */ }
    return unlocked;
  }

  /**
   * Invalidate the project feature unlock cache for a specific project+feature.
   */
  async invalidateProjectFeature(
    companyId: string,
    projectId: string,
    featureCode: string,
  ): Promise<void> {
    try { await this.redis.del(projectFeatureKey(companyId, projectId, featureCode)); } catch { /* */ }
  }

  /**
   * Resolve entitlements from the database.
   *
   * Priority:
   * 1. OrganizationModuleOverride (SUPER_ADMIN force-enable/disable)
   * 2. TenantModuleSubscription (active subscription items)
   * 3. Trial status (if trialing, all modules may be enabled)
   */
  private async resolveEntitlements(companyId: string): Promise<EntitlementResult[]> {
    const [catalog, overrides, subscriptions, company] = await Promise.all([
      this.prisma.moduleCatalog.findMany({ where: { active: true } }),
      this.prisma.organizationModuleOverride.findMany({ where: { companyId } }),
      this.prisma.tenantModuleSubscription.findMany({
        where: { companyId, disabledAt: null },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { isTrial: true, trialEndsAt: true, trialStatus: true, isInternal: true },
      }),
    ]);

    const overrideMap = new Map(overrides.map(o => [o.moduleCode, o.enabled]));
    const subscribedCodes = new Set(subscriptions.map(s => s.moduleCode));

    // Internal (NEXUS-owned) tenants permanently bypass all module checks.
    if (company?.isInternal) {
      return catalog.map(mod => ({
        moduleCode: mod.code,
        enabled: true,
        reason: "override" as const,
      }));
    }

    // Check if company is in an active trial
    const isActiveTrial =
      company?.isTrial &&
      company.trialStatus === "ACTIVE" &&
      company.trialEndsAt &&
      company.trialEndsAt > new Date();

    return catalog.map(mod => {
      // 1. SUPER_ADMIN override takes precedence
      if (overrideMap.has(mod.code)) {
        return {
          moduleCode: mod.code,
          enabled: overrideMap.get(mod.code)!,
          reason: "override" as const,
        };
      }

      // 2. Active subscription item
      if (subscribedCodes.has(mod.code)) {
        return {
          moduleCode: mod.code,
          enabled: true,
          reason: "subscription" as const,
        };
      }

      // 3. Active trial → all modules available
      if (isActiveTrial) {
        return {
          moduleCode: mod.code,
          enabled: true,
          reason: "trial" as const,
        };
      }

      // 4. CORE modules are always enabled
      if (mod.isCore) {
        return {
          moduleCode: mod.code,
          enabled: true,
          reason: "subscription" as const,
        };
      }

      return {
        moduleCode: mod.code,
        enabled: false,
        reason: "none" as const,
      };
    });
  }
}
