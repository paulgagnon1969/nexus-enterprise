---
cam_id: "FIN-INTL-0003"
module_code: ESTIMATING
title: "NexPRICE — Regional Pricing Intelligence"
mode: FIN
category: INTL
revision: "1.0"
tags: [cam, nexprice, pricing, regional, cost-book, cost-of-living, competitive-advantage, network-effect]
status: draft
created: 2026-03-04
updated: 2026-03-04
author: Warp
website: true
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, accounting]
scores:
  uniqueness: 9
  value: 9
  demonstrable: 8
  defensible: 9
  total: 35
---

# NexPRICE — Regional Pricing Intelligence

## Elevator Pitch

NexPRICE is a regionally-normalized, crowd-sourced pricing engine built into the Nexus ecosystem. Every tenant's real-world purchases — Home Depot receipts, credit card statements, vendor quotes, Xactimate estimates — feed an anonymized global Master Cost Book where prices are normalized by geographic cost-of-living indices. New tenants get instant, localized material pricing for their market. Existing tenants see price drift alerts and regional trend data. No competitor has this because no competitor has the multi-tenant purchase data flywheel.

## The Problem It Solves

Construction material prices vary dramatically by region. A 2×4 stud costs $3.87 in Houston and $5.12 in Manhattan. Today, contractors either:
- Maintain their own cost books manually (labor-intensive, always stale)
- Use Xactimate pricing (insurance-specific, not actual purchase prices)
- Guess based on the last job they bid (error-prone)

There is no centralized, real-time, regionally-accurate material pricing database for restoration/construction.

## How It Works

### Data Collection (Passive — Zero Effort from Users)
Every time any Nexus tenant:
- Imports an HD Pro Xtra CSV → SKUs, descriptions, unit prices, store location captured
- Scans a receipt via OCR → line items, vendor, store ZIP extracted
- Imports an Apple Card / Chase statement → merchant + amount captured
- Updates their cost book manually → new price + region recorded
- Imports an Xactimate estimate → PETL pricing feeds the system

Each of these events triggers a **dual-write**: one to the tenant's own cost book, one (anonymized) to the NEXUS SYSTEM global Master Cost Book.

### Regional Normalization (NexPRICE Engine)
Raw prices are meaningless without geographic context. NexPRICE normalizes every price to a base index (NYC = 100) using cost-of-living multipliers sourced from BLS/C2ER data:

```
normalizedPrice = rawPrice / localMultiplier
```

When a tenant in Phoenix (multiplier 0.76) reports a box of screws at $12.50:
```
normalizedPrice = $12.50 / 0.76 = $16.45 (NYC-equivalent)
```

When a tenant in Atlanta (multiplier 0.78) wants to know what that item costs locally:
```
localizedPrice = $16.45 × 0.78 = $12.83
```

This means every price in the master cost book is universally comparable and instantly localizable.

### Confidence Scoring
Each normalized price carries a confidence tier:
- **HIGH**: 3+ observations, 2+ regions, <15% variance → reliable
- **MEDIUM**: 2 observations or single region → directional
- **LOW**: 1 observation → data point only

Confidence improves automatically as more tenants contribute data.

## Why Competitors Cannot Replicate This

### 1. Network Effect Data Moat
The value of NexPRICE scales with tenant count. Each new tenant:
- Contributes their purchase data (more SKUs, more regions, more accuracy)
- Consumes the pricing data (validates and refines through PM review)

A competitor starting from zero would need years of multi-tenant adoption to build an equivalent dataset. By then, Nexus has millions of price observations across thousands of SKUs.

### 2. Passive Collection
Users don't do extra work. Prices are captured from workflows they already perform (importing CSVs, scanning receipts, updating cost books). This means adoption friction is zero — the data flywheel spins automatically.

### 3. Regional Granularity
Xactimate provides regional pricing for insurance line items, but not for actual construction materials at the SKU level. NexPRICE provides real purchase prices by SKU, by vendor, by ZIP code — something Xactimate, RS Means, and Craftsman don't offer.

### 4. Freshness
Traditional cost databases (RS Means, Craftsman) update annually. NexPRICE updates in real-time with every tenant transaction. A price surge at Home Depot is visible in the master cost book within hours, not months.

## Expected Operational Savings

*Based on a mid-size restoration firm: 3 estimators, 5 PMs, 60 projects/year, $75K avg materials budget.*

| Category | Calculation | Annual Savings |
|----------|-------------|----------------|
| **Cost book maintenance eliminated** | 8 hrs/month manual updates × 12 months @ $55/hr | **$5,280** |
| **Bid accuracy improvement** | 5% pricing error reduced on $4.5M annual materials | **$225,000 exposure reduced** |
| **New-tenant onboarding** | 40 hrs saved on cost book setup per new project market × 2 markets/yr @ $55/hr | **$4,400** |
| **Price drift detection** | 3 mid-project material spikes/yr caught early × avg $2,000 avoided overpay | **$6,000** |
| **Insurance supplement evidence** | 2 supplements/yr supported by price trend data × avg $4,000 | **$8,000** |
| | **Estimated Annual Savings** | **~$23,700** |
| | **Exposure Reduction** | **$225,000/yr** |

The bid accuracy exposure reduction is the headline number — a 5% material pricing error on a $500K project is $25K of margin at risk. NexPRICE doesn't eliminate the error entirely but dramatically narrows the variance.

## Monetization

### NexPRICE Seed (One-Time Purchase)
- Bulk download of the full Master Cost Book, localized to the tenant's region
- Thousands of real-world SKUs with HIGH-confidence pricing
- Instant cost book bootstrap — saves weeks of manual data entry
- Price point: premium one-time fee via Stripe (module code: `NEXPRICE_SEED`)

### NexPRICE Sync (Monthly Subscription)
- Ongoing updates: new items, price changes, regional trends
- Price drift alerts: "Lumber prices in your region increased 12% this month"
- Automatic cost book updates with review gates
- Monthly trend reports by category and region
- Price point: monthly recurring via Stripe (module code: `NEXPRICE_SYNC`)

### Revenue Scaling
- Revenue grows linearly with tenant count (more subscribers)
- Cost is near-zero (data is a byproduct of existing workflows)
- Gross margin approaches 100% at scale

## Demonstrability

### Live Demo Flow (90 seconds)
1. Show a new tenant's empty cost book
2. Click "Activate NexPRICE Seed" → Stripe checkout
3. Cost book instantly populates with 5,000+ SKUs, all priced for their ZIP code
4. Open a familiar item (e.g., "Simpson Strong-Tie A35 Framing Angle") → show price, vendor, confidence tier, regional comparison
5. Toggle "NexPRICE Sync" → show a price drift alert: "This item increased 8% across the network in the last 30 days"

### Screenshot-Ready UI Elements
- Cost book with "NexPRICE" column showing localized price + confidence badge
- Regional comparison tooltip: "This item: $4.87 (your region) vs. $5.92 (national avg)"
- Price drift sparkline showing 90-day trend
- "Powered by NexPRICE — 47 contractors contributed to this price" trust signal

## Competitive Landscape

| Capability | Nexus (NexPRICE) | Xactimate | RS Means | Craftsman |
|---|---|---|---|---|
| Real purchase prices by SKU | ✅ | ❌ | ❌ | ❌ |
| Regional normalization (ZIP-level) | ✅ | State-level | City-level | Regional |
| Real-time price updates | ✅ | Quarterly | Annual | Annual |
| Crowd-sourced from real purchases | ✅ | ❌ | ❌ | ❌ |
| Vendor-specific pricing (HD, Lowe's) | ✅ | ❌ | ❌ | ❌ |
| Passive data collection | ✅ | Manual | Manual | Manual |
| SKU-level granularity | ✅ | Line-item | Assembly | Assembly |

## Technical Requirements

- `RegionalCostIndex` model (~400 US ZIP3 regions, annual refresh)
- `HdStoreLocation` lookup (~2,000 stores → ZIP mapping)
- `PriceListItem` fields: `sku`, `regionZip`, `normalizedPrice`, `contributorCount`, `lastSeenPrice`, `lastSeenAt`, `priceObservationCount`
- `CompanyPriceListItem` fields: `sku`, `regionZip`, `localizedPrice`, `globalPriceListItemId`
- `syncToGlobalMaster()` helper called from all price-change paths
- NexPRICE normalization service: region resolution → COL lookup → normalize → upsert
- Stripe `ModuleCatalog` entries: `NEXPRICE_SEED`, `NEXPRICE_SYNC`

## Related CAMs

- `FIN-VIS-0001` — Purchase Reconciliation Audit Chain (the primary data source feeding NexPRICE)
- `FIN-INTL-0002` — Smart Prescreen Learning Loop
- `FIN-AUTO-0001` — Inline Receipt OCR

## Scoring Rationale

- **Uniqueness (9/10)**: No construction SaaS offers crowd-sourced, regionally-normalized, SKU-level material pricing from real purchases. RS Means and Craftsman are static annual publications. Xactimate is insurance-focused.
- **Value (9/10)**: Accurate, localized material pricing directly impacts bid accuracy, profit margins, and estimating speed. A 5% pricing error on materials for a $500K project = $25K margin impact.
- **Demonstrable (8/10)**: Instant cost book population and regional price comparison are highly visual and immediately understood. The "47 contractors contributed" trust signal is compelling. Loses a point because the full value (price trend accuracy) takes time to appreciate.
- **Defensible (9/10)**: The data flywheel is the moat. Every new tenant makes the pricing data better, which attracts more tenants. A competitor would need to rebuild the entire multi-tenant purchase data pipeline AND achieve critical mass adoption. The anonymized aggregation means the data is a platform asset, not something a single tenant can extract.

**Total: 35/40** — Well above CAM threshold (24).

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-04 | Initial CAM — NexPRICE regional pricing intelligence engine |
| 1.1 | 2026-03-04 | Added operational savings section, aligned frontmatter to `scores:` key |
