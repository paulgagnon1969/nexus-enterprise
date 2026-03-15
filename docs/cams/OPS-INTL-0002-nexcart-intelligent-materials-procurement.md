---
cam_id: OPS-INTL-0002
title: "NexCART — Intelligent Materials Procurement Engine"
mode: OPS
category: INTL
revision: "1.0"
status: draft
created: 2026-03-12
updated: 2026-03-12
author: Warp
website: false
scores:
  uniqueness: 9
  value: 10
  demonstrable: 8
  defensible: 8
  total: 35
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, field]
tags: [cam, ops, intelligence, procurement, materials, cba, shopping-cart, drawdown, logistics, fraud-detection]
---

# OPS-INTL-0002: NexCART — Intelligent Materials Procurement Engine

> *The estimate says what you need. NexCART tells you where to buy it, how much to carry, and whether the crew actually did.*

## Work ↔ Signal
> **The Work**: PETL-driven shopping carts with CBA price:distance optimization, multi-supplier trip planning, and receipt-reconciled drawdown ledger.
> **The Signal**: Every purchase decision teaches the system about local pricing, supplier reliability, material waste rates, and crew compliance — the deepest materials intelligence layer in the platform. (→ Procurement Intelligence: materials lifecycle)

## Elevator Pitch
NexCART transforms the PETL (Project Estimate Transaction Ledger) from a static cost list into a live procurement engine. It automatically generates shopping carts from estimate line items, normalizes material descriptions into canonical keys, searches live supplier catalogs, scores every option with a Cost-Benefit Analysis that factors in price, travel distance, crew time, and quantity economics — then produces optimized multi-supplier trip plans. After purchase, receipt OCR automatically reconciles what was bought against what was ordered. A project-level drawdown ledger tracks the full chain: need → ordered → purchased → installed. Every deviation is visible.

## Competitive Advantage
No restoration or construction SaaS connects the estimate to the purchase order to the receipt to the installed quantity in a single closed loop. Competitors offer either project management OR procurement tools — never both in the same data model. NexCART's integration with the existing PETL, supplier catalog, and receipt OCR pipeline means the system already knows what materials the project needs, what they cost at nearby suppliers, and what was actually purchased. The drawdown ledger closes the loop by detecting waste, theft, and over-ordering — turning materials management from a cost center into a cultural training tool.

## What It Does

### 1. PETL → Cart Population
When a PM creates a shopping cart for a project (e.g., "Week 3 Framing"), NexCART reads the active PETL estimate, extracts all line items with material content (`materialAmount > 0`), normalizes descriptions into canonical keys (e.g., "R&R 2×4×8 SPF #2 Stud" → `lumber-2x4x8`), consolidates duplicates across rooms, and creates cart items with the total project need quantity.

### 2. Material Normalization
The `normalizeMaterialKey()` utility strips labor/action prefixes (R&R, Remove, Install), extracts dimensional lumber patterns, fastener specs, sheet goods, pipe sizes, wire gauges, and common construction materials into deterministic keys. This enables matching across PETL descriptions, supplier catalogs, and receipt OCR line items — even when naming conventions differ.

### 3. CBA Engine — Price:Distance Optimization
For each cart item, the CBA engine searches all enabled supplier catalog providers (Home Depot, Lowe's, local suppliers), then scores each option with:
- **Total item price** (unit price × quantity)
- **Travel cost** (round-trip mileage at IRS rate)
- **Time cost** (crew hourly rate × travel time at estimated speed)
- **All-in cost** (sum of above)
- **Net benefit** (savings vs. worst option)

The engine also recommends quantity adjustments — "Buy 40 instead of 20 at Home Depot to save $127 total, covering 80% of remaining project need."

### 4. Multi-Supplier Trip Optimizer
Given CBA results across all items and suppliers, the optimizer enumerates all feasible supplier subsets (1-stop, 2-stop, 3-stop) and assigns each item to the cheapest supplier in each subset. Returns ranked trip plans with total cost, travel cost, time cost, and unfulfilled items.

Tractable for ≤5 suppliers (max 26 subsets of size ≤3). Handles the real-world scenario: "Should the crew make one trip to Home Depot or split between HD and Lowe's?"

### 5. Cart Lifecycle & Horizons
Carts have horizons (TODAY, THIS_WEEK, TWO_WEEKS, CUSTOM) that control how much of the project need to load. A foreman creating a "today" cart gets just what's needed for that day's work. The PM creating a "this week" cart gets a larger batch. Quantity deductions roll down from project need automatically.

### 6. Receipt Reconciliation Bridge
When a RECEIPT_EXPENSE daily log is processed through OCR, the NexCART reconciliation bridge:
- Normalizes each receipt line item description
- Matches against open cart items by `normalizedKey`
- Updates `purchasedQty` on matched cart items
- Updates the drawdown ledger with actual purchase quantities

This happens automatically — zero manual data entry.

### 7. Material Drawdown Ledger
A project-level running balance per normalized material tracks:
- **Total project need** — from PETL
- **Total ordered** — from all cart items
- **Total purchased** — from receipt reconciliation
- **Total installed** — from completed PETL lines (100%)
- **Variance** — purchased − needed (positive = waste/overstock)

PMs see at a glance: "We needed 500 2×4s. We ordered 520. Receipts show 540 purchased. 20 units unaccounted for."

## Why It Matters

- **Cultural alignment**: The system teaches field crews the "right path" — buy what the estimate says, from the best supplier, in the right quantity. Deviations are visible, not punitive, creating a culture of accountability.
- **Waste detection**: Variance tracking catches over-ordering before it becomes a habit. A foreman who consistently purchases 15% more than ordered gets coaching, not blame.
- **Fraud prevention**: Receipt reconciliation ensures actual purchases match cart orders. A receipt for $800 at Home Depot when the cart called for $200 raises a flag.
- **Trip optimization**: Saving even 30 minutes per material run on a project with 20 runs = 10 hours saved. At $45/hour loaded crew rate, that's $450 per project.
- **Quantity economics**: CBA recommendations prevent the "buy just what I need today" trap that causes 3 trips when 1 would suffice.

## Expected Operational Impact

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **Trip optimization savings** | ~0.30% | Fewer trips, shorter routes, right supplier first time |
| **Waste/over-order reduction** | ~0.45% | Drawdown variance detection catches over-purchasing |
| **Quantity batch savings** | ~0.15% | CBA-recommended bulk buys vs. multiple small purchases |
| **Fraud/theft deterrence** | ~0.10% | Receipt reconciliation catches unauthorized purchases |
| **Total NexCART Impact** | **~1.00%** | **Combined procurement intelligence as a share of revenue** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | NexCART Impact (~1.00%) |
|---------------|------------------------|
| **$1M** | **~$10,000** |
| **$2M** | **~$20,000** |
| **$5M** | **~$50,000** |
| **$10M** | **~$100,000** |
| **$50M** | **~$500,000** |

## Competitive Landscape

| Competitor | Shopping Cart from Estimate? | CBA Price:Distance? | Multi-Supplier Optimizer? | Receipt Reconciliation? | Drawdown Ledger? |
|------------|-----|-----|-----|-----|-----|
| Procore | No | No | No | No | No |
| Buildertrend | No | No | No | No | No |
| CoConstruct | No | No | No | No | No |
| CompanyCam | No | No | No | No | No |
| JobNimbus | No | No | No | No | No |
| Fieldwire | No | No | No | No | No |

No competitor connects estimate → cart → supplier pricing → receipt → installed quantity in a closed loop.

## Demo Script
1. **PETL → Cart**: Open a project with an active estimate. Click "Create Shopping Cart" → "Populate from PETL." Show 47 material lines consolidated into 23 cart items by normalized key.
2. **CBA Analysis**: Click "Run CBA." Show the spinner, then results: each item scored across HD and Lowe's with all-in cost breakdown. Show a quantity recommendation: "Buy 40 2×4s at HD ($3.28/ea, 2.1 mi) instead of 20 at Lowe's ($3.89/ea, 4.7 mi) — saves $47.20."
3. **Trip Plan**: Show the optimizer output: "Plan A: 1 stop at HD — $847 total (items + $18 travel + $14 time). Plan B: 2 stops (HD + Lowe's) — $822 total. Plan C: Lowe's only — $901."
4. **Purchase & Receipt**: Field crew buys materials. Snap a receipt photo. Show OCR auto-matching 8 of 12 line items to cart items, updating purchasedQty.
5. **Drawdown**: Show the project drawdown ledger — green (on track), yellow (over-ordered by <10%), red (over-ordered by >10% or receipt mismatch).

## Technical Implementation

### Data Model
- `ShoppingCart` — project-level cart with status (DRAFT → READY → IN_PROGRESS → COMPLETED), horizon, and label
- `ShoppingCartItem` — material line with normalizedKey, projectNeedQty, cartQty, recommendedQty, purchasedQty, CBA winner fields
- `ShoppingCartPricingSnapshot` — per-item per-supplier pricing captured during CBA (price, distance, travel cost, time cost, net benefit)
- `MaterialDrawdownLedger` — project-level running balance per material (need, ordered, purchased, installed, variance)

### API Endpoints
- `POST /procurement/carts` — create cart
- `POST /procurement/carts/:id/populate-from-petl` — auto-populate from PETL
- `POST /procurement/carts/:id/run-cba` — search suppliers, score, optimize
- `POST /procurement/carts/:id/items/:itemId/record-purchase` — manual purchase recording
- `GET /procurement/drawdown?projectId=` — project drawdown ledger

### Integration Points
- **Supplier Catalog** — searches all enabled providers (SerpAPI/BigBox for HD, SerpAPI for Lowe's)
- **Receipt OCR** — auto-reconciliation hook in the receipt promotion pipeline
- **PETL** — reads SowItems with materialAmount > 0 from the active estimate version
- **Material Normalization** — shared utility in `@repo/database` used by cart population, CBA search, and receipt reconciliation

## Scoring Rationale

- **Uniqueness (9/10):** No construction/restoration SaaS has a closed-loop estimate → cart → supplier CBA → receipt → drawdown system. This is genuinely novel.
- **Value (10/10):** Materials are typically 40–50% of project cost. A 1% improvement in procurement efficiency translates directly to margin. The cultural alignment aspect (teaching crews the "right path") creates compounding value.
- **Demonstrable (8/10):** Shopping cart + CBA scoring + trip plans + drawdown ledger are all highly visual. Receipt reconciliation happens automatically. The optimizer output is a compelling demo moment.
- **Defensible (8/10):** The integration depth (PETL + supplier catalog + OCR + drawdown) creates a system-level moat. Each component is useful alone; together they create intelligence no competitor can replicate without rebuilding the entire stack.

## Position in the NexSTACK Procurement Pipeline

NexCART is **Layer 1** of a four-layer procurement stack:

1. **PETL → Shop** (OPS-INTL-0002 NexCART — this CAM) — Estimate line items auto-populate shopping carts with normalized material keys
2. **Scrape for Shop** (EST-INTG-0001 BOM Pricing) — Multi-provider catalog search across HD, Lowe's, Amazon
3. **Unit Price Discrimination** (EST-ACC-0003 NexUNIT) — Converts retail packaging prices to project estimate units
4. **Shopping Aggregator** (OPS-AUTO-0002 NexBUY) — Cross-project consolidated purchasing with per-project allocation

## Related CAMs

- `EST-ACC-0003` — NexUNIT: Unit Price Discrimination Engine (Layer 3 — normalizes retail prices to project estimate units during CBA)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (Layer 2 — supplier catalog search feeds CBA)
- `OPS-AUTO-0002` — NexBUY: Group Shopping Cart (Layer 4 — cross-project consolidation)
- `OPS-INTL-0001` — NexFIND Supplier Intelligence (supplier discovery feeds CBA search)
- `OPS-INTG-0001` — NexFIND Receipt Bridge (receipt OCR feeds drawdown reconciliation)
- `FIN-AUTO-0001` — Inline Receipt OCR (OCR pipeline triggers NexCART reconciliation)
- `FIN-ACC-0002` — Zero-Loss Receipt Capture (ensures every purchase creates a bill)
- `FIN-VIS-0001` — Purchase Reconciliation Audit Chain (audit trail for CBA decisions)

## Expansion Opportunities

- **Mobile Cart UI** — field crews create and manage carts from the mobile app, scan barcodes at the store
- **Supplier bidding integration** — send cart to local suppliers for competitive quotes
- **AI material substitution** — suggest equivalent products when preferred item is unavailable
- **Predictive ordering** — ML model predicts material needs based on project phase and historical patterns
- **Installed quantity tracking** — field crews mark materials as installed by room, feeding the drawdown ledger
- **Waste analytics dashboard** — cross-project waste patterns by material type, crew, and supplier
- **Auto-reorder** — when drawdown shows depletion below threshold, auto-generate a new cart

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-12 | Initial release — full backend implementation deployed to production |
