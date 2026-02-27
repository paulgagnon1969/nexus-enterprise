import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { Public } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("membership")
export class MembershipController {
  constructor(private readonly billing: BillingService) {}

  /** Full module catalog with prices (public — no auth required). */
  @Public()
  @Get("catalog")
  getCatalog() {
    return this.billing.getModuleCatalog();
  }

  /** Current subscription + all modules with enabled/disabled state. */
  @Get("current")
  getCurrentMembership(@Req() req: any) {
    return this.billing.getCurrentMembership(req.user as AuthenticatedUser);
  }

  /** Enable a module → adds Stripe subscription item with proration. */
  @Post("modules/enable")
  enableModule(@Req() req: any, @Body("moduleCode") moduleCode: string) {
    return this.billing.enableModule(req.user as AuthenticatedUser, moduleCode);
  }

  /** Disable a module → removes Stripe subscription item with proration credit. */
  @Post("modules/disable")
  disableModule(@Req() req: any, @Body("moduleCode") moduleCode: string) {
    return this.billing.disableModule(req.user as AuthenticatedUser, moduleCode);
  }

  /** Preview of next invoice (cost impact before toggling). */
  @Get("upcoming-invoice")
  getUpcomingInvoice(@Req() req: any) {
    return this.billing.getUpcomingInvoice(req.user as AuthenticatedUser);
  }

  /** Full Stripe invoice history with itemized line items. */
  @Get("invoices")
  listInvoices(@Req() req: any) {
    return this.billing.listInvoices(req.user as AuthenticatedUser);
  }

  /** Cancel entire membership at end of current billing period. */
  @Post("cancel")
  cancelMembership(@Req() req: any) {
    return this.billing.cancelMembership(req.user as AuthenticatedUser);
  }

  /** Undo a pending cancellation. */
  @Post("reactivate")
  reactivateMembership(@Req() req: any) {
    return this.billing.reactivateMembership(req.user as AuthenticatedUser);
  }

  // ───────────────────────────────────────────────
  // Per-Project Feature Unlocks
  // ───────────────────────────────────────────────

  /** Unlock a per-project feature (one-time charge). */
  @Post("project-features/unlock")
  unlockProjectFeature(
    @Req() req: any,
    @Body("projectId") projectId: string,
    @Body("featureCode") featureCode: string,
  ) {
    return this.billing.unlockProjectFeature(
      req.user as AuthenticatedUser,
      projectId,
      featureCode,
    );
  }

  /** List feature unlocks for a specific project. */
  @Get("project-features/:projectId")
  getProjectFeatureUnlocks(
    @Req() req: any,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.billing.getProjectFeatureUnlocks(
      user.companyId,
      req.params.projectId,
    );
  }
}
