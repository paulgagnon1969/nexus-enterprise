import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("membership")
export class MembershipController {
  constructor(private readonly billing: BillingService) {}

  /** Full module catalog with prices (public — no auth required). */
  @Get("catalog")
  getCatalog() {
    return this.billing.getModuleCatalog();
  }

  /** Current subscription + all modules with enabled/disabled state. */
  @UseGuards(JwtAuthGuard)
  @Get("current")
  getCurrentMembership(@Req() req: any) {
    return this.billing.getCurrentMembership(req.user as AuthenticatedUser);
  }

  /** Enable a module → adds Stripe subscription item with proration. */
  @UseGuards(JwtAuthGuard)
  @Post("modules/enable")
  enableModule(@Req() req: any, @Body("moduleCode") moduleCode: string) {
    return this.billing.enableModule(req.user as AuthenticatedUser, moduleCode);
  }

  /** Disable a module → removes Stripe subscription item with proration credit. */
  @UseGuards(JwtAuthGuard)
  @Post("modules/disable")
  disableModule(@Req() req: any, @Body("moduleCode") moduleCode: string) {
    return this.billing.disableModule(req.user as AuthenticatedUser, moduleCode);
  }

  /** Preview of next invoice (cost impact before toggling). */
  @UseGuards(JwtAuthGuard)
  @Get("upcoming-invoice")
  getUpcomingInvoice(@Req() req: any) {
    return this.billing.getUpcomingInvoice(req.user as AuthenticatedUser);
  }

  /** Full Stripe invoice history with itemized line items. */
  @UseGuards(JwtAuthGuard)
  @Get("invoices")
  listInvoices(@Req() req: any) {
    return this.billing.listInvoices(req.user as AuthenticatedUser);
  }

  /** Cancel entire membership at end of current billing period. */
  @UseGuards(JwtAuthGuard)
  @Post("cancel")
  cancelMembership(@Req() req: any) {
    return this.billing.cancelMembership(req.user as AuthenticatedUser);
  }

  /** Undo a pending cancellation. */
  @UseGuards(JwtAuthGuard)
  @Post("reactivate")
  reactivateMembership(@Req() req: any) {
    return this.billing.reactivateMembership(req.user as AuthenticatedUser);
  }
}
