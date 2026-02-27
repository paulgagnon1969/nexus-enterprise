import { Global, Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { StripeProvider } from "./stripe.provider";
import { PlaidProvider } from "./plaid.provider";
import { BillingService } from "./billing.service";
import { EntitlementService } from "./entitlement.service";
import { ModuleGuard } from "./module.guard";
import { ProjectFeatureGuard } from "./project-feature.guard";
import { GlobalJwtAuthGuard } from "./global-jwt-auth.guard";
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
    // Global guards execute in registration order:
    // 1. GlobalJwtAuthGuard — populates request.user (skips @Public() routes)
    // 2. ModuleGuard — checks module entitlements
    // 3. ProjectFeatureGuard — checks per-project feature unlocks
    { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
    { provide: APP_GUARD, useExisting: ModuleGuard },
    { provide: APP_GUARD, useExisting: ProjectFeatureGuard },
  ],
  controllers: [
    BillingController,
    MembershipController,
    StripeWebhookController,
  ],
  exports: [BillingService, EntitlementService, ModuleGuard, ProjectFeatureGuard, PlaidProvider],
})
export class BillingModule {}
