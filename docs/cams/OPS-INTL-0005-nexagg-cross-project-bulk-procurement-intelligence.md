---
title: "NexAGG — Cross-Project Bulk Procurement Intelligence"
mode: OPS
category: INTL
revision: "1.0"
status: draft
created: 2026-03-15
updated: 2026-03-15
author: Warp
website: false
scores:
  uniqueness: 10
  value: 9
  demonstrable: 9
  defensible: 9
  total: 93
tags: [sop, procurement, bulk-buying, aggregation, petl, nexagg, operations, admin, executive]
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# NexAGG — Cross-Project Bulk Procurement Intelligence

> *"Twenty jobs. Same metro. Same drywall. Nobody knew. NexAGG knows."*

## The Problem

A restoration company runs 20 active jobs in the Dallas–Fort Worth metro. Every project has an approved PETL with similar materials — drywall, insulation, lumber, trim, fasteners. Each PM creates shopping carts independently: five separate orders for 1/2" drywall sheets from five separate Home Depot trips.

Nobody sees the aggregate. Nobody leverages the volume. The company buys at retail across 20 projects when it could negotiate bulk pricing on a single consolidated order — saving 5–15% on materials that represent 40–50% of project cost.

**Every construction PM platform treats procurement per-project.** There is no system that scans the entire organization's estimate pipeline, detects overlapping material needs across geographic clusters, and surfaces bulk buying opportunities to leadership before a single cart is created.

## The NexAGG Advantage

NexAGG is the first feature in the NexSTACK that sees the **entire tenant's procurement surface**. It operates upstream of NexBUY — detecting bulk opportunities from approved PETL data before anyone creates a shopping cart.

### How It Works

```
Approved PETLs (all active projects)
    ↓
normalizeMaterialKey() — canonical material identity
    ↓
Geographic Clustering — haversine < 50 miles
    ↓
Threshold Detection:
  • ≥ 3 projects need the same material
  • ≥ $5,000 aggregate value per material
  • ≥ 3 qualifying materials per cluster
    ↓
BulkProcurementOpportunity created
    ↓
Notify: PM (in-app + push) · Admin (in-app + push + email) · Executive
    ↓
Review → Approve → Convert to NexBUY (one click)
    ↓
Per-project ShoppingCarts auto-created with project-specific quantities
```

### Four Pillars

**1. Automatic Detection**
Every night at 3 AM, NexAGG scans all tenants with active projects. It fetches every SowItem from every ACTIVE EstimateVersion where `materialAmount > 0`, normalizes descriptions via `normalizeMaterialKey()`, and aggregates across projects within geographic clusters. No manual intervention — the system finds opportunities the organization didn't know existed.

**2. Geographic Intelligence**
Projects are grouped by city/state with a second-pass merge using haversine distance (< 50 miles). A project in Plano and a project in Irving both land in the "dallas-tx" cluster. This ensures logistics make sense — bulk buying only matters when the same delivery truck can serve multiple sites.

**3. Tiered Savings Estimation**
- $5K–$25K aggregate: ~5% estimated savings
- $25K–$100K aggregate: ~10% estimated savings
- $100K+ aggregate: ~15% estimated savings

These are conservative estimates. Real-world bulk negotiation often exceeds these tiers.

**4. One-Click NexBUY Conversion**
When leadership approves an opportunity, NexAGG creates a ShoppingCart per contributing project, pre-populated with project-specific quantities from the opportunity line items. The existing NexBUY consolidated purchasing flow takes over from there — CBA, supplier optimization, receipt tracking.

## Lifecycle

```
DETECTED → NOTIFIED → REVIEWING → APPROVED → PURCHASING → COMPLETED
                                  ↘ DISMISSED (with reason)
```

- **DETECTED**: System found the opportunity. Not yet notified.
- **NOTIFIED**: PMs, Admins, and Executives have been alerted (in-app, push, email).
- **REVIEWING**: Someone opened the opportunity detail view.
- **APPROVED**: Leadership approved the consolidation.
- **PURCHASING**: Converted to NexBUY — ShoppingCarts created per project.
- **COMPLETED**: All materials purchased.
- **DISMISSED**: Leadership decided not to consolidate (reason captured).

Auto-expiration: opportunities not acted on within 30 days are auto-dismissed.

## Notification Pipeline

### PMs
Each PM on a contributing project receives an in-app notification and mobile push:
> "📦 New bulk buy opportunity: Drywall + 7 materials — 12 projects, Dallas Tx"

### Admins + Executives
All OWNER and ADMIN role members receive:
- In-app notification
- Mobile push notification
- **Branded email** with:
  - Stats cards (Total Value, Estimated Savings, Material Count)
  - Top 5 materials table (description, total qty, project count)
  - "Review Opportunity" CTA button → deep link to web dashboard

### Deduplication
- Only notify once per opportunity (DETECTED → NOTIFIED transition)
- Re-notify on significant updates (>20% value increase from new projects/PETLs)

## NexSTACK Position — Layer 5

NexAGG sits at the top of the procurement intelligence stack:

| Layer | Module | What It Does |
|-------|--------|-------------|
| 1 | NexCART | Per-project shopping carts from PETL lines |
| 2 | BOM Pricing | Multi-provider price search |
| 3 | NexUNIT | Unit price discrimination ($/SF vs $/roll) |
| 3.5 | NexPRINT | Receipt-verified product fingerprints |
| 4 | NexCBAML | Cost-benefit analysis with omnichannel optimization |
| 4.5 | NexBUY | Group shopping cart + consolidated purchasing |
| **5** | **NexAGG** | **Cross-project bulk procurement intelligence** |

**A competitor cannot build Layer 5 without Layers 1–4.** This is six modules of infrastructure that must exist before cross-project aggregation is even possible.

## API Endpoints

All scoped to tenant via JWT `companyId`. PM+ role for viewing, ADMIN+ for approve/dismiss/convert.

| Method | Path | Action |
|--------|------|--------|
| GET | `/procurement/bulk-opportunities` | List all (filterable by status, cluster) |
| GET | `/procurement/bulk-opportunities/:id` | Full detail with projects + line items |
| PATCH | `/procurement/bulk-opportunities/:id/review` | Mark as REVIEWING |
| PATCH | `/procurement/bulk-opportunities/:id/approve` | Mark as APPROVED |
| PATCH | `/procurement/bulk-opportunities/:id/dismiss` | Dismiss with reason |
| POST | `/procurement/bulk-opportunities/:id/convert` | Convert to NexBUY carts |
| POST | `/procurement/bulk-opportunities/scan` | Manual trigger (admin) |

## Technical Implementation Summary

**Schema** (migration `20260315144425_add_bulk_procurement_opportunities`):
- Enum: `BulkOpportunityStatus` (7 states)
- `BulkProcurementOpportunity` — opportunity with lifecycle, stats, expiry
- `BulkOpportunityProject` — join table with per-project contribution stats
- `BulkOpportunityLineItem` — aggregated materials with per-project breakdown JSON
- `NotificationKind.BULK_PROCUREMENT` added

**Service**: `BulkDetectionService` (~816 lines)
- `detectOpportunities(companyId)` — core detection with geographic clustering + threshold logic
- `buildGeographicClusters()` — two-pass: city/state grouping + haversine merge
- `upsertOpportunity()` — create or update with dedup + fresh line item replacement
- `notifyStakeholders()` — tiered notification (PM in-app+push, Admin in-app+push+email)
- `convertToNexBuy()` — creates per-project ShoppingCarts with project-specific quantities
- `expireStaleOpportunities()` — auto-dismiss after 30 days
- `@Cron('0 3 * * *')` — nightly scan of all tenants

**Email**: `sendBulkOpportunityAlert()` in `EmailService` — branded template with stats cards, materials table, CTA

**Module wiring**: `ProcurementModule` imports `NotificationsModule`, provides `BulkDetectionService` + `EmailService`

## Configurable Thresholds

| Threshold | Default | Purpose |
|-----------|---------|---------|
| MIN_PROJECTS_PER_MATERIAL | 3 | Minimum projects needing the same material |
| MIN_MATERIAL_VALUE_USD | 5,000 | Minimum aggregate value per material |
| MIN_QUALIFYING_MATERIALS | 3 | Minimum materials to form an opportunity |
| CLUSTER_RADIUS_MILES | 50 | Maximum distance for geographic clustering |
| OPPORTUNITY_EXPIRY_DAYS | 30 | Auto-expire after N days with no action |

## Scoring Rationale

### Uniqueness: 10/10
No construction PM platform aggregates estimate line items across projects, clusters by geography, and auto-detects bulk procurement opportunities. Competitors don't even have the normalized material identity layer (normalizeMaterialKey) required to make cross-project matching possible. This is a fundamentally new capability.

### Value: 9/10
Materials are 40–50% of project cost in restoration. A 5–15% bulk discount across a metro-area portfolio is tens of thousands of dollars in real savings per quarter. For a company running 50+ concurrent projects, this is six-figure annual value. The system finds money the organization didn't know it was leaving on the table — and it does it automatically.

### Demonstrable: 9/10
Demo flow: import PETLs for 5+ projects in the same city → hit the manual scan endpoint → admin gets a branded email with stats cards showing total value + estimated savings + top materials → open the detail view showing per-project breakdown → one click converts to NexBUY carts → show the per-project carts pre-populated with project-specific quantities. The email template alone is a "wow" artifact. (Not 10 because the web dashboard isn't built yet — currently API-only.)

### Defensible: 9/10
This is Layer 5 of a 5-layer procurement stack. To replicate NexAGG, a competitor must first build: PETL parsing + material normalization (NexCART), multi-provider price search (BOM Pricing), unit price discrimination (NexUNIT), product fingerprinting (NexPRINT), cost-benefit analysis (NexCBAML), and consolidated purchasing (NexBUY). Then they need geographic clustering, threshold detection, notification infrastructure, and the one-click cart conversion bridge. This is 6+ months of infrastructure.

**Total: 93/100** (U:10 + V:9 + D:9 + Def:9 = 37/40 × 2.5)

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-15 | Initial release — schema, detection service, notification pipeline, API endpoints, NexBUY conversion |
