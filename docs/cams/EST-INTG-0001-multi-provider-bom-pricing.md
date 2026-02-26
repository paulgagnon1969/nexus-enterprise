---
title: "Estimating - Multi-Provider BOM Pricing Pipeline"
cam_id: "EST-INTG-0001"
mode: estimating
category: integration
status: draft
competitive_score: 8
value_score: 9
created: 2026-02-26
session_ref: "session-2026-02-26-bom-pricing-fullscreen.md"
tags: [cam, estimating, integration, bom, pricing, serpapi, home-depot, lowes, materials]

# Visibility Control
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]

# Website Config (only used when visibility.public: true)
website:
  section: features
  priority: 85
  headline: "Real-Time Material Pricing from Multiple Suppliers"
  summary: "NCC searches Home Depot and Lowe's simultaneously, streams results live, and captures store locations — turning your BOM into an actionable purchasing plan in seconds."
---

# Multi-Provider BOM Pricing Pipeline

## The Problem

Restoration contractors must price thousands of material line items from Xactimate estimates against current retail availability. The typical process:

- **Manual lookup**: Open Home Depot / Lowe's websites in separate tabs, search each item, copy-paste prices into a spreadsheet. For a 200-line BOM, this takes 3–5 hours.
- **Single-supplier tools**: Some platforms query one retailer. Contractors still manually check a second source for price comparison.
- **No store awareness**: Online prices don't reflect which local store has the item. POs get sent to the wrong location.
- **No history**: Prices are recorded once. When materials spike mid-project, there's no baseline to reference for insurance negotiation.

## The NCC Advantage

NCC's BOM Pricing Pipeline solves all four problems in a single workflow:

1. **Multi-Provider Search**: Home Depot and Lowe's are queried simultaneously for every selected material line. Results appear side-by-side.
2. **SSE Streaming**: Results stream to the browser in real time as each line completes. No waiting for the entire batch — users see progress immediately.
3. **Store Location Capture**: Each result includes the store name, full address, and phone number. POs can reference the exact pickup location.
4. **Snapshot Persistence**: Every search run is saved as a timestamped snapshot. Re-run weekly to track price movement. Historical snapshots are never overwritten.
5. **Smart Query Normalization**: Xactimate descriptions contain Unicode dimension markers (feet: `'`, `'`, `′`; inches: `"`, `"`, `″`), codes, and abbreviations. NCC normalizes these into clean search queries that return accurate retail matches.

**Key insight**: Material pricing is a multi-supplier, time-sensitive, location-aware problem. NCC treats it as such — not as a simple product lookup.

## Business Value

- **Time saved**: 200-line BOM priced in ~3 minutes (streaming) vs. 3–5 hours manual. At 2 projects/week, that's **8–10 hours/week saved per PM**.
- **Cost savings**: Side-by-side pricing reveals supplier deltas of 5–15% on common materials. On a $50K materials budget, that's **$2,500–$7,500 per project**.
- **Insurance leverage**: Snapshot history provides timestamped evidence of price increases for supplement negotiations.
- **PO accuracy**: Store locations on pricing records eliminate wrong-store deliveries and pickup errors.

## Competitive Landscape

| Competitor | Has This? | Notes |
|------------|-----------|-------|
| Buildertrend | No | No integrated material pricing |
| CoConstruct | No | Manual cost entry only |
| Procore | Partial | Procurement module exists but no real-time multi-supplier search |
| Xactimate | No | Pricing is from Xactware's internal database, not live retail |
| CompanyCam | No | Photo documentation only, no materials |
| JobNimbus | No | CRM-focused, no BOM pricing |

## Use Cases

1. **Pre-construction pricing**: PM imports Xactimate estimate, selects all BOM lines, runs batch search. In 3 minutes, has HD + Lowe's prices with store locations for the entire project.
2. **Mid-project re-pricing**: Materials spike due to supply chain disruption. PM re-runs search, compares new snapshot to original. Difference report supports insurance supplement request.
3. **Supplier negotiation**: PM sees Lowe's is consistently 8% cheaper on lumber for a project. Negotiates bulk discount with local Lowe's store using the captured store contact info.
4. **PO generation** (planned): Selected pricing results feed directly into purchase orders with pre-populated store addresses.

## Technical Implementation

```
Providers:
  - Home Depot: SerpAPI home_depot engine (primary), BigBox API (fallback)
  - Lowe's: SerpAPI google_shopping engine, filtered by source

Streaming: Server-Sent Events (SSE) via GET /bom-search/stream
Storage: BomPricingProduct (per-line, per-supplier) + BomPricingSnapshot (per-run)
Normalization: Unicode-aware regex for Xactimate dimension markers
```

## Scoring Breakdown

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Uniqueness | 8 | No competitor offers live multi-supplier pricing with streaming + store locations |
| Value | 9 | Saves hours/week per PM, reveals $2.5K–$7.5K savings per project |
| Demonstrable | 9 | Extremely visual — streaming progress, side-by-side prices, store maps |
| Defensible | 6 | SerpAPI is accessible, but the full pipeline (normalization, snapshots, SSE, multi-provider fallback) is complex |
| **Total** | **32/40** | Exceeds 24-point CAM threshold |

## Related Features

- [Redis Price List Caching](./EST-SPD-0001-redis-price-list-caching.md) — complementary speed optimization for internal price lists
- [BOM Pricing Pipeline SOP](../sops-staging/bom-pricing-pipeline-sop.md) — user-facing workflow documentation

## Session Origin

Discovered in: `docs/sops-staging/session-2026-02-26-bom-pricing-fullscreen.md`

Built during the Feb 26, 2026 session as a complete end-to-end pipeline: SSE streaming, multi-provider search (HD + Lowe's), store location capture, snapshot persistence, and pre-search material selection UI.
