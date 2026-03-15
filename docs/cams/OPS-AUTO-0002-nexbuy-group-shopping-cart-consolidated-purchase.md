---
cam_id: OPS-AUTO-0002
title: "NexBUY — Group Shopping Cart & Consolidated Purchase"
mode: OPS
category: AUTO
revision: "1.1"
status: draft
created: 2026-03-14
updated: 2026-03-15
author: Warp
website: false
scores:
  uniqueness: 8
  value: 9
  demonstrable: 9
  defensible: 7
  total: 33
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, field]
tags: [cam, ops, automation, procurement, materials, consolidated-purchase, group-cart, bulk-ordering, nexbuy]
---

# OPS-AUTO-0002: NexBUY — Group Shopping Cart & Consolidated Purchase

> *Five projects need 2×4s. One purchase order. One trip. Every site gets exactly what it needs.*

## Work ↔ Signal
> **The Work**: Tenant-wide shopping cart visibility with multi-select consolidated purchasing — enabling bulk orders across projects while maintaining per-project material allocation tracking.
> **The Signal**: Cross-project purchase consolidation reveals bulk purchasing patterns, supplier concentration opportunities, and material demand curves across the entire operation. (→ Procurement Intelligence: organizational buying power)

## Elevator Pitch
NexBUY gives operations managers a single view of every active shopping cart across every project in the company. Instead of each PM placing independent orders — 100 2×4s here, 80 there, 120 at the next site — NexBUY lets them select multiple carts, hit "Consolidated Purchase," and instantly see a unified materials list with per-project allocation breakdowns. The crew buys 500 2×4s at bulk pricing and drops 100 at each of 5 sites. Every project's ledger still knows exactly what it received. The organizational buying power that large GCs take for granted — now available to any company running Nexus.

## Competitive Advantage
No restoration or construction project management tool provides cross-project shopping cart consolidation with per-project material tracking. Competitors treat procurement as project-scoped — each PM is an island. NexBUY breaks that silo by operating at the tenant level, aggregating demand across the entire operation. The consolidation engine normalizes materials by canonical key (the same normalization that powers NexCART's CBA engine), so "R&R 2×4×8 SPF #2 Stud" from Project A and "Install 2×4 8ft Stud" from Project B resolve to the same line item. Combined with NexCBAML's price:distance optimization, this creates a procurement pipeline no competitor can replicate without rebuilding the entire stack.

## What It Does

### 1. Tenant-Wide Cart Visibility
The Group Cart screen shows every shopping cart across every project in the company — not just the user's current project. Each row shows project name, cart label, item count, status, last updated date, and who created it. Filter chips toggle between open carts (DRAFT, READY, IN_PROGRESS) and all carts (including COMPLETED). Pull-to-refresh and long-press multi-select entry.

### 2. Multi-Select Cart Consolidation
Users enter select mode (tap "Select" or long-press any cart), choose any combination of carts across any projects, and see a live count: "3 carts · 3 projects." The "Consolidated Purchase →" button triggers the consolidation engine.

### 3. Material Aggregation by Normalized Key
The consolidation API collects every item from the selected carts, groups them by `normalizedKey` (the canonical material identifier from NexCART), and sums quantities. A project ordering 100 2×4s and another ordering 80 produces a single consolidated line: "180 2×4×8 SPF."

### 4. Per-Project Allocation Breakdown
Every consolidated line item expands to show exactly which projects need what quantity. This is the critical differentiator from a simple "add all items together" approach — the organization knows the total order, but each project's allocation is preserved. When the delivery truck arrives at a site, the crew knows exactly what's theirs.

### 5. Best-Known Pricing & Supplier Intelligence
Consolidated lines carry forward the best known price and supplier from CBA results run on individual carts. The consolidated view shows estimated total cost, best supplier per material, and quantity-adjusted pricing. This feeds directly into NexCBAML's bulk pricing tiers.

### 6. Cart Status Lifecycle
Carts progress through DRAFT → READY → IN_PROGRESS → COMPLETED. The Group Cart defaults to showing open carts (the active purchasing pipeline) but retains full history. Completed carts remain accessible for audit, reconciliation, and pattern analysis.

### 7. Receipt Origin Tracking
When a purchase is made from a shopping cart, the receipt daily log captures its origin (`MANUAL` or `SHOPPING_CART`) and links back to the specific cart via `shoppingCartId`. This linkage flows through to the `ProjectBill`, creating a complete audit chain: Cart → Receipt → Bill. From the Cart Detail screen, two action buttons let users create either a standard receipt ("🧾 Receipt" — `MANUAL` origin) or a cart-linked receipt ("🛒 Receipt Shopping Cart" — `SHOPPING_CART` origin with cart linkage). This enables reconciliation of what was ordered vs. what was actually purchased.

### 8. Role-Based Access (PM+ Only)
The Group Cart tile is gated to PM, EXECUTIVE, OWNER, and ADMIN roles. Field crew see per-project Shopping Lists but not the tenant-wide consolidated view. This ensures the consolidated purchasing workflow is managed by operations leadership while individual project procurement remains accessible to all.

## Why It Matters

- **Bulk purchasing power**: A 5-project company buying 2×4s individually pays retail 5 times. Consolidated ordering unlocks contractor pricing tiers, volume discounts, and delivery minimums.
- **Trip reduction**: Instead of 5 separate material runs to the same supplier, one consolidated run serves all projects. At $45/hour loaded crew rate and 1 hour per run, that's $180 saved per consolidated trip.
- **Supply chain visibility**: Operations managers see the company's entire material demand pipeline — not just one project at a time. Enables strategic supplier negotiations and forward purchasing.
- **Per-project integrity**: Despite consolidation, every project's material ledger remains accurate. The drawdown system (NexCART) tracks what each project ordered vs. what it received.
- **Cultural alignment**: Teaches PMs to think organizationally, not just per-project. The "I'll just run to Home Depot" mentality is replaced by "Let me check the Group Cart first."

## Expected Operational Impact

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **Volume discount capture** | ~0.20% | Bulk pricing tiers unlocked by consolidated quantities |
| **Trip consolidation savings** | ~0.15% | Fewer material runs across fewer projects |
| **Supplier negotiation leverage** | ~0.10% | Aggregate demand visibility enables better terms |
| **Total NexBUY Impact** | **~0.45%** | **Combined cross-project procurement coordination** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | NexBUY Impact (~0.45%) |
|---------------|------------------------|
| **$1M** | **~$4,500** |
| **$2M** | **~$9,000** |
| **$5M** | **~$22,500** |
| **$10M** | **~$45,000** |
| **$50M** | **~$225,000** |

Impact scales superlinearly — larger operations with more concurrent projects capture proportionally more consolidation opportunity.

## Competitive Landscape

| Competitor | Cross-Project Cart View? | Multi-Cart Consolidation? | Per-Project Allocation? | Material Normalization? |
|------------|-----|-----|-----|-----|
| Procore | No | No | No | No |
| Buildertrend | No | No | No | No |
| CoConstruct | No | No | No | No |
| CompanyCam | No | No | No | No |
| JobNimbus | No | No | No | No |
| Fieldwire | No | No | No | No |

No competitor operates procurement at the tenant level. All are project-scoped.

## Demo Script
1. **Tenant-wide view**: Open the Group Cart from the mobile tile grid. Show 8 active shopping carts across 5 different projects — all visible in one list. Toggle "All" to show 15 total (including completed).
2. **Multi-select**: Long-press to enter select mode. Select 3 carts from 3 different projects. Bottom bar shows "3 carts · 3 projects."
3. **Consolidate**: Tap "Consolidated Purchase →." Show the summary cards: 3 carts, 3 projects, 47 materials, $12,400 estimated total.
4. **Drill down**: Expand a lumber line — "180 2×4×8 SPF @ $3.28 = $590.40." Show per-project breakdown: Project Alpha: 100, Project Bravo: 50, Project Charlie: 30.
5. **Value proposition**: "Instead of 3 PMs making 3 trips and paying $3.89/ea retail, one consolidated order at contractor tier pricing saves $110 on this single material — across the 47 items, total savings are $1,200 on this batch alone."

## Technical Implementation

### API Endpoints
- `GET /procurement/carts/all` — tenant-wide cart listing (company-scoped via JWT). Includes project name, city, state, item count, creator name. Accepts `status` query param to filter by cart status. Defaults to open statuses (DRAFT, READY, IN_PROGRESS).
- `POST /procurement/consolidate` — accepts `{ cartIds: string[] }`. Aggregates items by `normalizedKey` across all selected carts. Returns consolidated lines with per-project allocations, best known pricing, supplier info, and summary totals (cartCount, projectCount, totalItems, totalEstimatedCost).

### Data Flow
1. User opens Group Cart → `GET /procurement/carts/all` returns all company carts
2. User selects carts and taps Consolidate → `POST /procurement/consolidate` with selected cart IDs
3. API loads all items from selected carts, joins project names
4. Groups by `normalizedKey`, sums quantities, picks best price/supplier
5. Returns `ConsolidatedPurchase` with lines and allocations

### Mobile Screens
- `GroupShoppingCartScreen.tsx` — two-mode React Native screen
  - Mode 1 (Cart List): FlatList with status filter chips, multi-select via long-press or Select button, "Consolidated Purchase" bottom bar
  - Mode 2 (Consolidated View): Summary cards + expandable material lines with per-project allocation breakdown
- `ShoppingCartDetailScreen.tsx` — per-cart detail view with line items, stats bar (items/purchased/est. total), and dual receipt action buttons (Manual vs. Shopping Cart origin)
- Navigation: `GroupShoppingCart` and `ShoppingCartDetail` routes in ProjectsStack. Accessible via "🛍️ Group Cart" tile (PM+ role-gated) in DailyLogsScreen tile grid.
- Role gating: `UserRoleContext` propagates the user's company role from `AppNavigator` → `DailyLogsScreen`. The `PM_PLUS_ROLES` set (`OWNER`, `ADMIN`, `PM`, `EXECUTIVE`) controls tile visibility.

### Schema Additions (v1.1)
- `ReceiptOrigin` enum: `MANUAL` | `SHOPPING_CART` — tracks how a receipt was created
- `DailyLog.receiptOrigin` / `DailyLog.shoppingCartId` — links receipt logs to originating cart
- `ProjectBill.receiptOrigin` — propagated from DailyLog during bill creation for audit trail
- Migration: `20260314161351_add_receipt_origin_and_cart_linkage`

### Integration Points
- **NexCART** (OPS-INTL-0002) — shares the `normalizedKey` material canonicalization and cart data model
- **NexCBAML** (OPS-INTL-0003) — consolidated quantities feed into CBA bulk pricing tier calculations
- **NexFIND** (OPS-INTL-0001) — best supplier info from the supplier intelligence network
- **Receipt Bridge** (OPS-INTG-0001) — consolidated purchase receipts reconcile back to individual project carts
- **Receipt Origin Tracking** — `DailyLog.receiptOrigin` + `shoppingCartId` → `ProjectBill.receiptOrigin` creates a complete Cart → Receipt → Bill audit chain

## Scoring Rationale

- **Uniqueness (8/10):** Cross-project procurement consolidation doesn't exist in restoration/construction SaaS. Enterprise ERPs have this, but not at the field-crew level with mobile-first UX. Not quite 9 because the concept of consolidated purchasing is well-understood in supply chain — the innovation is bringing it to the project management layer.
- **Value (9/10):** Direct material cost savings via volume pricing, plus significant time savings from trip consolidation. Impact scales with company size and concurrent project count. Not 10 because smaller operators with 1-2 projects see minimal benefit.
- **Demonstrable (9/10):** Highly visual — select carts, tap consolidate, see aggregated materials with per-project breakdowns. The "before/after" of 5 separate orders vs. 1 consolidated order is immediately compelling. Mobile-first demo works in any meeting.
- **Defensible (7/10):** The consolidation logic itself is straightforward. The moat is integration depth — it requires NexCART's normalization, the CBA engine, supplier intelligence, and receipt reconciliation to deliver full value. A standalone consolidation tool without these layers is just a spreadsheet.

## Position in the NexSTACK Procurement Pipeline

NexBUY is **Layer 4** of a four-layer procurement stack:

1. **PETL → Shop** (OPS-INTL-0002 NexCART) — Estimate line items auto-populate shopping carts with normalized material keys
2. **Scrape for Shop** (EST-INTG-0001 BOM Pricing) — Multi-provider catalog search across HD, Lowe's, Amazon
3. **Unit Price Discrimination** (EST-ACC-0003 NexUNIT) — Converts retail packaging prices to project estimate units
4. **Shopping Aggregator** (OPS-AUTO-0002 NexBUY — this CAM) — Cross-project consolidated purchasing with per-project allocation

## Related CAMs

- `OPS-INTL-0002` — NexCART (Layer 1 — PETL-driven carts and normalization that NexBUY aggregates across)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (Layer 2 — supplier prices that flow into consolidated cost estimates)
- `EST-ACC-0003` — NexUNIT: Unit Price Discrimination Engine (Layer 3 — ensures quantities are in correct project units before aggregation)
- `OPS-INTL-0003` — NexCBAML: Cost-Benefit Analysis Materials Logistics (CBA feeds consolidated pricing)
- `OPS-INTL-0001` — NexFIND: Supplier Intelligence Network (supplier data for consolidated lines)
- `OPS-INTG-0001` — NexFIND Receipt Bridge (receipt reconciliation for consolidated purchases)
- `OPS-AUTO-0001` — Group Task Cascading Completion (pattern: cross-project coordination)
- `FIN-VIS-0001` — Purchase Reconciliation Audit Chain (audit trail for bulk orders)

## Expansion Opportunities

- **Consolidated PO generation** — generate formal purchase orders from consolidated lines, ready for supplier submission
- **Delivery scheduling** — coordinate delivery windows across project sites based on consolidated order
- **Recurring consolidation** — weekly/bi-weekly auto-consolidation of all open carts with notification to operations manager
- **Supplier bidding** — send consolidated material list to multiple suppliers for competitive quotes
- **Cross-tenant consolidation** — NCC marketplace enables multiple companies to consolidate orders for even larger volume discounts (NexNET procurement)
- **Predictive consolidation** — ML model predicts upcoming material needs across projects and suggests preemptive consolidated orders

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
|| 1.0 | 2026-03-14 | Initial release — tenant-wide cart listing, multi-select consolidation, per-project allocation, mobile Group Cart screen |
|| 1.1 | 2026-03-15 | Added receipt origin tracking (MANUAL/SHOPPING_CART), cart-to-bill audit chain, ShoppingCartDetailScreen with dual receipt buttons, PM+ role gating via UserRoleContext, schema migration for ReceiptOrigin enum |
