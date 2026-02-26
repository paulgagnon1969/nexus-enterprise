import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { StripeProvider } from "./stripe.provider";
import { PlaidProvider } from "./plaid.provider";
import { BillingService } from "./billing.service";
import { EntitlementService } from "./entitlement.service";
import { ModuleGuard } from "./module.guard";
import { BillingController } from "./billing.controller";
import { MembershipController } from "./membership.controller";
import { StripeWebhookController } from "./stripe-webhook.controller";

@Global()
@Module({
  providers: [
    StripeProvider,
    PlaidProvider,
    BillingService,
    EntitlementService,
    ModuleGuard,
    // Register as a global guard so @RequiresModule works on any controller
    // without needing @UseGuards(ModuleGuard) everywhere.
    { provide: APP_GUARD, useExisting: ModuleGuard },
  ],
  controllers: [
    BillingController,
    MembershipController,
    StripeWebhookController,
  ],
  exports: [BillingService, EntitlementService, ModuleGuard],
})
export class BillingModule {}
