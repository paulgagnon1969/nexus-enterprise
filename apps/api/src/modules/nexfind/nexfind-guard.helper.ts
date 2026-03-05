import { Injectable, Logger } from "@nestjs/common";
import { EntitlementService } from "../billing/entitlement.service";

/**
 * Lightweight helper that checks whether the NEXFIND module is enabled
 * for a tenant. Used by fire-and-forget callers (ProjectService,
 * ReceiptInventoryBridgeService) so they can skip NexFIND work early
 * without importing the full billing module.
 */
@Injectable()
export class NexfindGuardHelper {
  private readonly logger = new Logger(NexfindGuardHelper.name);

  constructor(private readonly entitlements: EntitlementService) {}

  /**
   * Returns true if the tenant has the NEXFIND module enabled
   * (via subscription, override, trial, or internal status).
   * Fails open on error so a Redis/DB hiccup doesn't silently
   * disable discovery.
   */
  async isEnabled(companyId: string): Promise<boolean> {
    try {
      return await this.entitlements.isModuleEnabled(companyId, "NEXFIND");
    } catch (err: any) {
      this.logger.warn(
        `NexFIND entitlement check failed (fail-open): ${err?.message}`,
      );
      return true; // fail-open — matches EntitlementService convention
    }
  }
}
