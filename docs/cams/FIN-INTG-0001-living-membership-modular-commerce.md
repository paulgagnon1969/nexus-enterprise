---
cam_id: FIN-INTG-0001
title: "Living Membership — Modular Subscription & Per-Project Feature Commerce"
mode: FIN
category: INTG
revision: "1.0"
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
website: false
scores:
  uniqueness: 8
  value: 8
  demonstrable: 8
  defensible: 6
  total: 30
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
tags: [cam, financial, integration, billing, subscription, stripe, membership, entitlement, per-project, commerce, module-catalog]
---

# FIN-INTG-0001: Living Membership — Modular Subscription & Per-Project Feature Commerce

> *Pay for what you use. Unlock what you need. No wasted seats, no locked tiers.*

## Work ↔ Signal
> **The Work**: Tenants activate per-module subscriptions and per-project feature unlocks via Stripe. Self-service billing with real-time proration. Billing outages never block field work.
> **The Signal**: Which modules each tenant activates reveals real-time demand signals for platform capabilities — the marketplace knows what tools are valued most. (→ Demand: feature demand intelligence)

## Elevator Pitch
Nexus replaces flat-tier SaaS pricing with a modular commerce engine. Companies subscribe to individual NCC modules (Estimating, Scheduling, Financials, etc.) and toggle them on/off from a self-service billing page — Stripe prorates instantly. Premium features like Xactimate Import or Drawings→BOM are unlocked per-project with a one-time charge. A Redis-cached entitlement layer enforces access across every API route using decorator-based guards, with a fail-open safety net so billing outages never block field work. No construction PM tool offers this level of pricing granularity.

## Competitive Advantage
Every major construction PM tool — Procore, Buildertrend, CoConstruct, Jobber — uses tiered pricing: Small/Medium/Large plans with feature bundles. Tenants pay for modules they'll never use or get locked out of ones they need. Nexus flips this model: each functional module is an independent Stripe subscription item. Tenants enable exactly the modules they need and pay only for those. Per-project features add another dimension — a contractor doing one Xactimate job doesn't need a permanent subscription; they unlock the import for $49 on that project alone. The billing page doubles as a product showcase, with each module linked to its CAM document via a "Learn more" modal.

## What It Does

### Module Catalog & Subscription Management
- 13 modules in the catalog across 3 pricing models: MONTHLY, PER_PROJECT, PER_USE
- Self-service billing page at `/settings/billing` where admins toggle modules on/off
- Each toggle creates/removes a Stripe subscription item with automatic proration
- Upcoming invoice preview shows cost impact before committing
- Full invoice history with hosted invoice links from Stripe
- Cancel/reactivate membership at period end

### Per-Project Feature Unlocks
- Premium features (Xact Import $49, Document AI $29, Drawings→BOM $39) are one-time charges per project
- Stripe PaymentIntent charged immediately using the default payment method
- `ProjectFeatureUnlock` record created with audit trail (who unlocked, when, amount charged)
- Feature becomes permanently available on that project

### Entitlement Enforcement
- `@RequiresModule('ESTIMATING')` decorator gates entire controllers or individual handlers
- `@RequiresProjectFeature('XACT_IMPORT')` gates per-project endpoints
- Three global guards execute in order: JWT auth → Module entitlement → Project feature check
- Redis-cached entitlements with 60s TTL — DB is only hit once per minute per tenant
- **Fail-open pattern**: if Redis or Postgres is unreachable, access is allowed so field crews are never blocked by a billing system outage

### Tenant Tier Handling
- **Internal tenants** (NEXUS-owned): all modules permanently unlocked, zero billing
- **Trial tenants**: all modules available during trial window; auto-expires
- **SUPER_ADMIN / SUPPORT roles**: bypass all entitlement checks globally
- **OrganizationModuleOverride**: force-enable or force-disable modules per tenant (admin escalation)

### Payment Methods
- Credit/debit cards via Stripe Elements (SetupIntent flow)
- Bank accounts via Plaid Link → Stripe processor token bridge (ACH)
- Default payment method management with automatic Stripe customer sync

### Stripe Webhook Integration
- Idempotent event processing with `BillingEvent` audit table
- Handles: `payment_intent.succeeded` (module purchase grants), `subscription.updated/deleted`, `invoice.payment_failed`, `payment_method.attached/detached`
- Automatic entitlement cache invalidation on every billing event
- Subscription cancellation auto-disables all non-core modules

## Why It Matters
- **Lower barrier to entry**: a small contractor can start with Core + Scheduling ($49/mo) instead of a $300/mo "Pro" plan
- **Revenue scales with engagement**: as tenants grow, they add modules — ARPU grows organically without sales friction
- **Per-project pricing captures occasional users**: a contractor doing one insurance restoration job pays $49 for Xact Import on that project, not $79/mo forever
- **Self-service reduces support load**: no "please upgrade my plan" tickets — tenants toggle modules themselves
- **Field-first reliability**: fail-open entitlements mean a Redis blip never stops a foreman from logging time
- **CAM-linked catalog**: "Learn more" on each module opens the CAM document in a reader modal — the billing page is also a product education surface

## Demo Script
1. Open **Settings → Billing** as a company admin
2. Show the module catalog: Core (free), Estimating ($79/mo), Scheduling ($49/mo), etc.
3. **Toggle Estimating ON** — watch the cost summary update, show proration in upcoming invoice preview
4. **Toggle it OFF** — watch prorated credit appear
5. Scroll to Per-Project Add-ons — show Xact Import ($49/project), Document AI ($29/project)
6. Open a project → show the "Unlock" prompt for Xact Import
7. Go back to billing → expand Invoice History → show hosted invoice from Stripe
8. (Internal demo) Show a trial tenant: all modules enabled with "Trial — 14 days remaining" banner
9. (Technical demo) Hit a `@RequiresModule('BIDDING')` endpoint without the module → show `403 Module 'BIDDING' is not included in your membership`
10. Enable the module → hit the same endpoint → success

## Technical Differentiators
- **Decorator-based entitlement guards** — `@RequiresModule()` and `@RequiresProjectFeature()` as NestJS decorators, registered as global APP_GUARDs. Zero boilerplate to gate a new controller.
- **Three-tier entitlement resolution**: SUPER_ADMIN override → tenant subscription → trial status → core module fallback
- **Redis-cached with fail-open** — 60s TTL cache; if Redis is down, access is allowed. Billing infrastructure never blocks production work.
- **Plaid→Stripe ACH bridge** — bank account linking through Plaid Link with processor token exchange, giving tenants a card-free payment option
- **Stripe v20 compatible** — handles removal of `current_period_end` from subscription objects, derives period from latest invoice
- **Idempotent webhook processing** — every Stripe event stored with unique constraint; duplicates safely ignored
- **CAM document linking** — `ModuleCatalog.camDocumentId` FK to `SystemDocument` enables "Learn more" reader modals directly on the billing page

## Expected Operational Impact

All impact figures expressed as **percentage of annual revenue**.

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **Reduced plan-mismatch churn** | ~0.25% | Tenants who would have churned from oversized/undersized plans stay longer |
| **Per-project capture** | ~0.15% | Revenue from occasional premium features that flat plans can't monetize |
| **Self-service admin savings** | ~0.05% | Support tickets for plan changes eliminated |
| **Trial-to-paid conversion lift** | ~0.20% | Full module access during trial increases conversion vs. feature-limited trials |
| **Total Living Membership Impact** | **~0.65%** | **Combined revenue retention and expansion** |

### Real-World Extrapolation by Platform Revenue

| NCC Platform ARR | Living Membership Impact (~0.65%) |
|-----------------|----------------------------------|
| **$500K** | **~$3,250** |
| **$1M** | **~$6,500** |
| **$5M** | **~$32,500** |
| **$10M** | **~$65,000** |

*Impact increases as tenant base grows — modular pricing attracts a wider range of company sizes than tier-locked plans.*

## Competitive Landscape

| Competitor | Modular Pricing? | Per-Project? | Self-Service Toggle? | Entitlement Guards? | Trial Auto-Unlock? |
|------------|-----------------|-------------|---------------------|--------------------|--------------------|
| Procore | No — tiered | No | No | N/A | Partial |
| Buildertrend | No — tiered | No | No | N/A | No |
| CoConstruct | No — tiered | No | No | N/A | No |
| Jobber | No — tiered | No | Partial (add-ons) | N/A | No |
| Nexus NCC | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |

## Scoring Rationale

- **Uniqueness (8/10)**: No construction PM tool offers per-module + per-project pricing. The closest analog is Shopify's app marketplace, but that's third-party — Nexus modules are first-party with integrated entitlement enforcement.
- **Value (8/10)**: Directly impacts revenue (captures more tenant types, reduces churn from plan mismatch) and UX (self-service, no support tickets). Per-project pricing opens a market segment that subscription-only can't reach.
- **Demonstrable (8/10)**: Toggle a module, watch the price change, see the invoice preview update in real time. Unlock a feature on one project. Very visual, very tangible.
- **Defensible (6/10)**: Stripe and Plaid APIs are available to everyone. The defensibility is in the full vertical integration: decorator guards on every route, Redis-cached fail-open entitlements, trial/internal auto-handling, CAM-linked catalog, per-project unlock records with audit trail.

**Total: 30/40** — Exceeds CAM threshold (24).

## Related CAMs

- `FIN-AUTO-0001` — Inline Receipt OCR (gated by FINANCIALS module entitlement)
- `EST-SPD-0001` — Redis Price List Caching (gated by ESTIMATING module)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (gated by ESTIMATING + DRAWINGS_BOM per-project unlock)
- `CLT-COLLAB-0001` — Client Tenant Tier Collaboration (trial tenants use this system)
- `FIN-INTL-0003` — NexPRICE Regional Pricing (per-project feature unlock candidate)

## Expansion Opportunities
- **Usage-based billing (PER_USE)** — pricing model already in the enum; future modules like AI queries or API calls can meter usage
- **Module bundles** — "Restoration Pack" = Estimating + Documents + Xact Import at a discount
- **Annual billing discount** — already partially implemented (Supplier Index uses yearly interval)
- **Stripe Customer Portal** — embedded portal for self-service card updates and invoice downloads
- **In-app upgrade prompts** — when a user hits a gated feature, show "Unlock this module" inline instead of just a 403
- **Tiered pricing within modules** — e.g., Estimating Basic vs. Estimating Pro with different price points
- **Referral credits** — give tenants billing credits for referring new customers

## Key Files

- `apps/api/src/modules/billing/billing.service.ts` — Stripe subscription management, module toggle, per-project unlocks
- `apps/api/src/modules/billing/entitlement.service.ts` — Redis-cached entitlement resolution
- `apps/api/src/modules/billing/module.guard.ts` — `@RequiresModule()` decorator and global guard
- `apps/api/src/modules/billing/project-feature.guard.ts` — `@RequiresProjectFeature()` decorator and global guard
- `apps/api/src/modules/billing/membership.controller.ts` — Self-service membership API
- `apps/api/src/modules/billing/stripe-webhook.controller.ts` — Idempotent Stripe event processing
- `apps/api/src/modules/billing/billing.module.ts` — Global guard registration (JWT → Module → ProjectFeature)
- `apps/web/app/settings/billing/page.tsx` — Self-service billing UI
- `apps/api/src/scripts/seed-module-catalog.ts` — Module catalog + Stripe product/price seeding
- `packages/database/prisma/schema.prisma` — ModuleCatalog, TenantSubscription, TenantModuleSubscription, ProjectFeatureUnlock models

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial release |
