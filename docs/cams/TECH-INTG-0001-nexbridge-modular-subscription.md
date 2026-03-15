---
cam_id: TECH-INTG-0001
title: "NexBRIDGE Modular Subscription — Desktop Feature Marketplace"
mode: TECH
category: INTG
revision: "1.0"
status: draft
created: 2026-03-07
updated: 2026-03-07
author: Warp
website: false
scores:
  uniqueness: 9
  value: 8
  demonstrable: 8
  defensible: 9
  total: 85
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, technology, integration, nexbridge, desktop, subscription, billing, entitlements, tauri, rust, monetization]
---

# TECH-INTG-0001: NexBRIDGE Modular Subscription — Desktop Feature Marketplace

> *A native desktop app where every feature is a revenue switch.*

## Work ↔ Signal
> **The Work**: Tauri/Rust desktop app with per-feature subscription gating via the same Stripe entitlement system as the web platform. Tenants pick exactly the capabilities they need.
> **The Signal**: Desktop feature activation patterns reveal which precision tools are most valued — the marketplace learns what capabilities to prioritize. (→ Demand: desktop tool demand)

## Elevator Pitch

NexBRIDGE Connect is a Tauri/Rust desktop companion app that gives contractors local-compute superpowers — video AI assessment, document scanning, contact sync, asset management — and now AI-assisted floor plan layout via NexPLAN. Each capability is an independently purchasable module gated by the same Stripe-backed entitlement system that powers the NCC web platform. Tenants pick exactly the features they need, prerequisites enforce logical bundling, and a single `@RequiresModule` decorator on the API protects every endpoint. No competitor in construction/restoration offers a native desktop app with per-feature subscription gating, local Rust processing, and seamless cloud sync.

## The Problem

Construction software vendors face a monetization dilemma with desktop/native apps:

- **All-or-nothing licensing**: Traditional desktop tools (Xactimate, Bluebeam) sell monolithic licenses. Users pay for everything even if they only need one feature. This inflates cost and reduces adoption.
- **No recurring revenue from desktop**: Most construction desktop tools are one-time purchases or annual site licenses with no usage-based component. The vendor has no economic signal about which features matter.
- **No feature gating infrastructure**: Adding a new capability to a desktop app means shipping it to everyone or building a custom license server. Most vendors skip the gating and give everything away or gate the entire app.
- **Cloud-only limitations**: Web-only platforms can't process large files locally (4K video, high-res floor plans), can't work offline, and can't leverage local GPU/CPU for AI inference. But building a desktop app historically means giving up cloud billing integration.

## The NCC Advantage

NexBRIDGE solves all four problems with a production-ready architecture:

1. **Per-Feature Module Gating**: Each NexBRIDGE capability maps to a `ModuleCatalog` entry with its own Stripe Product + Price. Tenants enable/disable modules from the NCC web billing page — the desktop app picks up changes within 60 seconds via entitlement polling.

2. **Prerequisite Chains**: Add-on modules (`NEXBRIDGE_ASSESS`, `NEXBRIDGE_NEXPLAN`, `NEXBRIDGE_AI`) declare `prerequisites: ["NEXBRIDGE"]`. The `EntitlementService.checkPrerequisites()` method enforces this before enabling, preventing orphaned subscriptions.

3. **Unified Billing Pipeline**: The same Stripe webhook handler, `TenantModuleSubscription` table, and Redis-cached `EntitlementService` that gates NCC web modules also gates NexBRIDGE features. Zero additional billing infrastructure was needed.

4. **Graceful Degradation**: When a module is disabled, the desktop app doesn't crash or lock out — it hides the nav item and shows an inline `UpsellCard` with pricing and a one-click path to re-enable. The license lifecycle (ACTIVE → GRACE_PERIOD → EXPORT_ONLY → LOCKED) gives tenants 14 days of grace + 30 days of export-only access.

5. **Local Compute Advantage**: NexBRIDGE runs Rust-native processing (FFmpeg video extraction, document conversion, image processing, SQLite vendor catalog) that the web browser cannot match. This local capability is the product differentiator that justifies the subscription — it's not just a web wrapper.

**Key insight**: The desktop app becomes a feature marketplace where every Rust module is a revenue line item, gated by the same infrastructure that already handles 15+ NCC web modules.

## Expected Operational Impact

This CAM measures the *platform revenue and adoption* impact, not individual feature value (those are measured by their own CAMs like EST-AUTO-0002 for NexPLAN).

| Category | Impact | What It Represents |
|----------|--------|-------------------|
| **Incremental MRR per tenant** | $29–$116/seat/mo | Range from base-only to full-stack NexBRIDGE |
| **Feature adoption signal** | Real-time | Module enable/disable rates reveal product-market fit per feature |
| **Expansion revenue** | +40-80% ARPU | Tenants who add NexBRIDGE add-ons increase their NCC spend by 40-80% |
| **Reduced churn** | ~15% improvement | Desktop app with local data creates significantly higher switching cost |
| **Trial conversion** | +20% expected | "Try all features" during trial → selective enable at conversion is less intimidating than all-or-nothing |

### Revenue Projection by Adoption

| Tenants with NexBRIDGE | Avg Modules | Avg MRR/Tenant | Annual Platform Revenue |
|---|---|---|---|
| 10 | 2.0 | $58 | $6,960 |
| 50 | 2.5 | $73 | $43,800 |
| 200 | 3.0 | $87 | $208,800 |
| 500 | 3.0 | $87 | $522,000 |

*Conservative: assumes average of 2-3 modules per tenant. Full-stack adoption ($116/seat) at scale would roughly double these numbers.*

## Competitive Landscape

| Competitor | Native Desktop App? | Per-Feature Billing? | Local AI Processing? | Notes |
|---|---|---|---|---|
| Buildertrend | No | No | No | Web-only, monolithic pricing |
| CoConstruct | No | No | No | Web-only |
| Procore | No | Partial (modules) | No | Web modules but no desktop app |
| Xactimate | Yes (desktop) | No | No | Monolithic license, no cloud billing integration |
| Bluebeam | Yes (desktop) | No | No | Per-seat license, no per-feature gating |
| CompanyCam | No | No | No | Mobile-focused, no desktop |
| PlanSwift | Yes (desktop) | No | No | One-time purchase, no recurring per-feature |
| JobNimbus | No | Tiered | No | Web-only with plan tiers, not per-feature |

**No competitor combines**: native desktop app + per-feature Stripe billing + local Rust processing + cloud sync + graceful degradation. The closest analog is Xactimate, which is a monolithic desktop app with no modular billing and no cloud AI integration.

## Use Cases

1. **Selective adoption**: A small firm ($1-2M) starts with `NEXBRIDGE` base ($29/mo) for document scanning. Six months later, they add `NEXBRIDGE_ASSESS` when they start doing video assessments. They never pay for NexPLAN because they don't do finish selections.

2. **Full-stack power user**: A PM at a $10M firm has all four modules. They scan documents, run video assessments on job sites (offline frame extraction), design kitchen layouts with NexPLAN, and use the AI pack for dimension extraction from architectural drawings.

3. **Trial → selective conversion**: A new tenant gets all features during their 14-day trial. At conversion, they see the module picker and enable only what they used. Lower initial commitment → higher conversion rate.

4. **Feature discovery**: An existing NexBRIDGE user sees a locked "NexPLAN" nav item. They click it, see the UpsellCard with "$39/mo" and a description. One click opens the NCC billing page. Module is live within 60 seconds.

5. **Controlled sunset**: A tenant downgrades. The grace period gives them 14 days to export. NexBRIDGE never surprises users with instant data loss.

## Technical Implementation

```
Billing Pipeline (unchanged — reused from NCC web):
  ModuleCatalog → Stripe Products/Prices → TenantModuleSubscription
  EntitlementService (Redis-cached, 60s TTL, fail-open)
  @RequiresModule('CODE') decorator on API controllers
  Stripe webhook → invalidate cache → NexBRIDGE picks up change

New Module Codes:
  NEXBRIDGE           — $29/mo (base: contacts, docs, assets)
  NEXBRIDGE_ASSESS    — $29/mo (video assessment, requires NEXBRIDGE)
  NEXBRIDGE_NEXPLAN   — $39/mo (selections, requires NEXBRIDGE)
  NEXBRIDGE_AI        — $19/mo (local AI, requires NEXBRIDGE)

Client Gating:
  GET /billing/entitlements → { modules: [...], features: { nexbridge, assess, nexplan, ai } }
  useAuth().hasFeature('NEXBRIDGE_ASSESS') → boolean
  Nav items with requiresModule hide when module not enabled
  Routes render UpsellCard for locked features
  UpsellCard → opens NCC Settings → Membership in browser

License Lifecycle (per device):
  X-License-Status header on every API response
  ACTIVE → GRACE_PERIOD (14d) → EXPORT_ONLY (30d) → LOCKED
```

## Scoring Rationale

- **Uniqueness (9/10)**: No construction/restoration platform offers a native desktop app with per-feature Stripe-integrated billing, local Rust processing, and seamless cloud sync. Procore has web modules but no desktop app. Xactimate has a desktop app but no modular billing. This is a novel combination that creates a new product category — the "desktop feature marketplace" for construction software.

- **Value (8/10)**: The modular subscription model directly increases ARPU ($29-$116/seat/mo incremental revenue), provides real-time product-market fit signals (which modules do tenants enable?), and reduces churn through desktop data stickiness. The value is primarily revenue/business model innovation rather than direct operational savings (those come from the individual feature CAMs).

- **Demonstrable (8/10)**: The demo flow is clean: show a locked feature → click UpsellCard → enable in NCC → feature appears in NexBRIDGE within 60 seconds. The before/after of "locked nav item → working feature" is satisfying. Slightly less visual than BOM streaming or NexPLAN floor plans, but the business model innovation is equally compelling to investors/partners.

- **Defensible (9/10)**: This is the highest defensibility score in the portfolio. The moat is multi-layered:
  - **Rust processing layer**: FFmpeg, image processing, document conversion, SQLite — months of engineering to replicate
  - **Entitlement infrastructure**: ModuleCatalog + Stripe integration + Redis caching + prerequisite chains + graceful degradation — this is a full billing platform
  - **Desktop data gravity**: Local SQLite databases, cached vendor catalogs, processed documents — switching means losing local state
  - **Ecosystem lock-in**: NexBRIDGE syncs to NCC Documents, Assessments, Contacts — the desktop app is woven into the cloud platform
  - A competitor would need to build: a Tauri app + Rust backend + Stripe billing integration + entitlement service + license lifecycle + cloud sync — and then still be behind on features

**Total: 34/40** — Exceeds CAM threshold (24). Highest defensibility score in the portfolio.

## Related CAMs

- `EST-AUTO-0002` — NexPLAN AI-Assisted Selections (feature within NexBRIDGE, gated by `NEXBRIDGE_NEXPLAN`)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (web feature that feeds into NexPLAN vendor catalog)
- `CLT-COLLAB-0001` — Client Tenant Tier Collaboration (NexBRIDGE outputs shared via Collaborator Technology)
- `FIN-ACC-0002` — Zero-Loss Receipt Capture (NexBRIDGE document scanning feeds receipt pipeline)

## Expansion Opportunities

- **Usage-based pricing**: Track API calls per module (e.g., Gemini analysis calls for NEXBRIDGE_ASSESS) and offer a pay-per-use tier alongside monthly
- **Team licensing**: Bulk pricing for firms that want all seats on the same tier ($99/seat for full stack when buying 10+)
- **Module marketplace**: Third-party developers build NexBRIDGE modules (e.g., a specialty vendor catalog plugin) and sell through the same billing infrastructure
- **Offline license tokens**: For job sites with no internet — short-lived tokens that grant module access without API verification
- **White-label**: The modular architecture supports white-labeling for franchise networks (each franchisee gets their own module configuration)
- **Hardware bundles**: Partner with drone/camera manufacturers — buy a DJI Mini → get 3 months of NEXBRIDGE_ASSESS included

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-07 | Initial draft — modular subscription model for NexBRIDGE Connect |
