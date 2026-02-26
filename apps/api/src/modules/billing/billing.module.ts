import { Module } from "@nestjs/common";
import { StripeProvider } from "./stripe.provider";
import { PlaidProvider } from "./plaid.provider";
import { BillingService } from "./billing.service";
import { EntitlementService } from "./entitlement.service";
import { ModuleGuard } from "./module.guard";
import { BillingController } from "./billing.controller";
import { MembershipController } from "./membership.controller";
import { StripeWebhookController } from "./stripe-webhook.controller";

@Module({
  providers: [
    StripeProvider,
    PlaidProvider,
    BillingService,
    EntitlementService,
    ModuleGuard,
  ],
  controllers: [
    BillingController,
    MembershipController,
    StripeWebhookController,
  ],
  exports: [BillingService, EntitlementService, ModuleGuard],
})
export class BillingModule {}
