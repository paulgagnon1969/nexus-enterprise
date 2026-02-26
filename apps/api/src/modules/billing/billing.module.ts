import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { StripeProvider } from "./stripe.provider";
import { PlaidProvider } from "./plaid.provider";
import { BillingService } from "./billing.service";
import { EntitlementService } from "./entitlement.service";
import { ModuleGuard } from "./module.guard";
import { ProjectFeatureGuard } from "./project-feature.guard";
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
    ProjectFeatureGuard,
    // Register as global guards so @RequiresModule / @RequiresProjectFeature
    // work on any controller without needing @UseGuards() everywhere.
    { provide: APP_GUARD, useExisting: ModuleGuard },
    { provide: APP_GUARD, useExisting: ProjectFeatureGuard },
  ],
  controllers: [
    BillingController,
    MembershipController,
    StripeWebhookController,
  ],
  exports: [BillingService, EntitlementService, ModuleGuard, ProjectFeatureGuard],
})
export class BillingModule {}
