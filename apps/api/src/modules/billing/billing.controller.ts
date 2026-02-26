import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { JwtAuthGuard } from "../auth/auth.guards";
import { AuthenticatedUser } from "../auth/jwt.strategy";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // --- Payment Methods ---

  @Post("setup-intent")
  createSetupIntent(@Req() req: any) {
    return this.billing.createSetupIntent(req.user as AuthenticatedUser);
  }

  @Get("payment-methods")
  listPaymentMethods(@Req() req: any) {
    return this.billing.listPaymentMethods(req.user as AuthenticatedUser);
  }

  @Post("payment-methods/:id/default")
  setDefaultPaymentMethod(@Req() req: any, @Param("id") id: string) {
    return this.billing.setDefaultPaymentMethod(req.user as AuthenticatedUser, id);
  }

  @Delete("payment-methods/:id")
  detachPaymentMethod(@Req() req: any, @Param("id") id: string) {
    return this.billing.detachPaymentMethod(req.user as AuthenticatedUser, id);
  }

  // --- Plaid (bank account linking) ---

  @Post("plaid/link-token")
  createPlaidLinkToken(@Req() req: any) {
    return this.billing.createPlaidLinkToken(req.user as AuthenticatedUser);
  }

  @Post("plaid/exchange")
  exchangePlaidToken(
    @Req() req: any,
    @Body() body: { publicToken: string; accountId: string },
  ) {
    return this.billing.exchangePlaidToken(
      req.user as AuthenticatedUser,
      body.publicToken,
      body.accountId,
    );
  }
}
