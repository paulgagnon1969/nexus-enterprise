---
cam_id: OPS-INTG-0001
title: "NexFIND Receipt Bridge — Verified Supplier Network from Purchase Data"
mode: OPS
category: INTG
revision: "1.0"
tags: [cam, nexfind, receipt-ocr, supplier-intelligence, operations, integration, network-effect, verified-data]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
scores:
  uniqueness: 8
  value: 7
  demonstrable: 8
  defensible: 7
  total: 75
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
---

# OPS-INTG-0001: NexFIND Receipt Bridge — Verified Supplier Network from Purchase Data

> *Scraped directories tell you who exists. Receipts tell you who's actually good.*

## Work ↔ Signal
> **The Work**: Every receipt OCR automatically builds a verified supplier map — real vendors, real addresses, confirmed by actual purchases. 3-tier deduplication. Zero data entry.
> **The Signal**: The network's collective purchasing behavior reveals which suppliers are real, where they are, and who uses them — crowdsourced intelligence that grows with every tenant. (→ Market Intelligence: supplier verification)

## Elevator Pitch

Every receipt your crews scan automatically builds a verified supplier map. No manual data entry, no scraped directories — real vendors, real addresses, real phone numbers, confirmed by actual purchases. The more your team buys, the smarter your supplier network gets. NexFIND Receipt Bridge turns your expense tracking into your most valuable operational asset.

## The Problem

Construction supplier data has a trust problem:

1. **Scraped directories are unreliable.** POI databases (Google, Yelp, Mapbox) list businesses that may be closed, relocated, or miscategorized. A "building materials" pin might be a residential contractor's home address.
2. **Manual entry doesn't scale.** Asking project managers to type in supplier details is overhead nobody does consistently.
3. **Institutional knowledge walks out the door.** Your best foreman knows every lumber yard, electrical wholesaler, and specialty shop in three counties — until he retires or moves to a competitor.
4. **New markets start from zero.** When a company expands into a new metro area, crews waste days figuring out where to source materials.

The fundamental issue: **the best supplier data already flows through your company every day — in the form of purchase receipts.** It just gets filed and forgotten.

## The Insight

A receipt is a verified proof of purchase. It contains:
- **Vendor name** (exact legal name, not a guess)
- **Store number** (specific location, not a corporate HQ)
- **Address** (confirmed physical location where materials were actually bought)
- **Phone number** (the direct store line, not a 1-800 number)
- **GPS capture coordinates** (where the crew was standing when they scanned it)
- **Purchase date** (proof the store was open and operational on that date)

This is **ground-truth supplier data** — more reliable than any directory scrape. And your crews are already generating it as a byproduct of expense tracking.

## How It Works

### Data Flow

```
Field Crew                    Receipt OCR                   NexFIND Receipt Bridge
─────────                    ───────────                   ──────────────────────
📸 Scan receipt     →   🔍 Extract vendor metadata   →   📍 Geocode + deduplicate
                        (name, address, store#,           │
                         phone, GPS coords)               ├→ Match existing supplier?
                                                          │   YES → Update visit metadata
                                                          │   NO  → Create new LocalSupplier
                                                          │         (source: "receipt_ocr")
                                                          │
                                                          └→ Sync to GlobalSupplier network
                                                               (anonymized, cross-tenant)
```

### Step-by-Step

1. **Crew scans receipt** — Photo capture on mobile or email forward to the receipt inbox. This is the normal expense tracking workflow; nothing extra required.
2. **Receipt OCR extracts vendor metadata** — AI-powered extraction pulls vendor name, address, store number, phone number, and line items. GPS coordinates captured at scan time.
3. **3-tier deduplication** — The bridge prevents duplicates using a layered matching strategy:
   - **Tier 1: Store number match** — If vendor name + store number match an existing supplier, it's the same location.
   - **Tier 2: Geo-proximity** — If vendor name matches (fuzzy, case-insensitive) and coordinates are within 500m, it's the same location.
   - **Tier 3: New supplier** — No match found → create a new `LocalSupplier` with `source: "receipt_ocr"` and full metadata.
4. **Supplier appears on map** — The verified supplier pin appears on the project map immediately. Marked with a verified badge indicating it came from an actual purchase.
5. **Visit metadata accumulates** — Each subsequent receipt from the same supplier increments the visit count, updates the last-visited date, and links the receipt for spend tracking.
6. **Global network sync** — The supplier (anonymized) is synced to the GlobalSupplier index so other tenants entering the same market benefit from the discovery.

### Verified vs. Discovered Suppliers

NexFIND maintains two quality tiers of supplier data:

- **Discovered suppliers** (`source: "mapbox"`) — Found via Mapbox POI search when a project is created. Useful for coverage but unverified. May be closed, relocated, or irrelevant.
- **Verified suppliers** (`source: "receipt_ocr"`) — Created from actual purchase receipts. Confirmed operational, correct address, correct phone, with purchase history attached.

Verified suppliers are weighted higher in search results, displayed with a trust badge, and are the only suppliers shared to the GlobalSupplier network by default.

## Technical Architecture

### Key Components

- **`receipt-inventory-bridge.service.ts`** — Orchestrates the receipt → supplier pipeline. After OCR completes, calls `NexfindService.upsertFromReceiptData()`.
- **`NexfindService.upsertFromReceiptData()`** — Handles the 3-tier deduplication and LocalSupplier upsert. Fire-and-forget from the receipt flow (non-blocking).
- **`NexfindService.syncToGlobal()`** — Promotes verified LocalSuppliers to the GlobalSupplier index. De-duplicates by `placeId` or creates new entries for receipt-sourced suppliers.
- **`MapboxPlacesProvider`** — Handles POI discovery for the initial project-triggered scrape. Replaced Google Places (deprecated) with Mapbox Search Box API.

### Database Models

- **`LocalSupplier`** — Tenant-scoped supplier record. Fields: name, address, phone, website, lat, lng, category, source, savedVia, placeId, status, metadata (visitCount, lastNavigatedAt, etc.).
- **`GlobalSupplier`** — System-wide anonymized supplier record. Fields: name, address, phone, lat, lng, category, placeId, source, tenantCount. Used for cross-tenant network intelligence.

### Module Gating

The Receipt Bridge is independently gated from base NexFIND:

- **`RECEIPT_OCR`** ($29/mo) — Prerequisite. Enables receipt scanning and OCR extraction.
- **`NEXFIND_RECEIPT`** ($9/mo) — Add-on. Enables the receipt → supplier bridge. **Requires `RECEIPT_OCR` as a prerequisite.** If a tenant tries to enable `NEXFIND_RECEIPT` without `RECEIPT_OCR`, the system returns the missing prerequisite.
- **`NEXFIND`** ($19/mo) — Independent. Enables Mapbox-powered POI discovery on project creation. Does NOT require Receipt OCR.

Prerequisite validation is enforced at the API level via `EntitlementService.checkPrerequisites()` and the module grant endpoint.

## Expected Operational Impact

Impact figures expressed as **percentage of annual revenue** (NexOP format):

- **Verified supplier data quality** (~0.08%) — Crews go to the right store on the first try instead of discovering a listing is closed/wrong.
- **Reduced new-market ramp time** (~0.04%) — Network-seeded verified suppliers eliminate research when entering unfamiliar cities.
- **Purchase frequency intelligence** (~0.06%) — Most-visited suppliers surface first, reducing decision time on every material run.
- **Spend consolidation visibility** (~0.05%) — Seeing which suppliers get the most business enables vendor negotiation leverage.
- **Zero data entry overhead** (~0.03%) — No manual supplier management required; the system builds itself.
- **Total Receipt Bridge Impact: ~0.26%**

### Extrapolation by Tenant Size

- $1M revenue → ~$2,600/yr savings
- $2M revenue → ~$5,200/yr savings
- $5M revenue → ~$13,000/yr savings
- $10M revenue → ~$26,000/yr savings

*At $9/mo ($108/yr), the module pays for itself after ~2 verified supplier captures at any company size.*

## The Flywheel

The Receipt Bridge creates a compounding data advantage:

```
More receipts scanned
       ↓
More verified suppliers in the index
       ↓
Better supplier search results + map coverage
       ↓
More value for the user → higher retention
       ↓
More tenants on Nexus
       ↓
Richer GlobalSupplier network
       ↓
Better supplier data for NEW tenants entering any market
       ↓
Stronger competitive moat (data can't be replicated without the user base)
```

This flywheel has no equivalent in any construction SaaS product. It converts a routine expense-tracking task into a strategic data asset.

## Competitive Landscape

- **Procore** — Supplier directory is 100% manual entry. No receipt integration. No geo-intelligence. No network effect.
- **Buildertrend** — Has expense tracking with receipt photos but zero connection to supplier data. Receipts are filed and forgotten.
- **CoConstruct** — No supplier features at all. Vendor management is a line item in a budget.
- **JobNimbus** — Basic vendor list (name + phone). No map, no auto-capture, no intelligence.
- **Fieldwire** — Task management only. No procurement or supplier features.
- **CompanyCam** — Photo documentation. Has geo-tagged photos but no supplier intelligence.

**No competitor converts receipt data into supplier intelligence.** This is a genuinely novel integration.

## Business Model & Upsell Strategy

### Pricing Tiers

1. **NexFIND Lite** (free) — View suppliers on the project map. Manual add only.
2. **NexFIND Discovery** ($19/mo) — Auto-discover nearby suppliers via Mapbox when projects are created.
3. **Receipt OCR** ($29/mo) — Scan receipts for expense tracking and line-item extraction.
4. **NexFIND Receipt Bridge** ($9/mo, requires Receipt OCR) — Auto-register verified suppliers from every receipt. The power add-on.

### Natural Upsell Path

Tenants who subscribe to Receipt OCR get a monthly usage summary:
> "You scanned 47 receipts this month from 12 unique vendors. Enable NexFIND Receipt Bridge ($9/mo) to automatically build your supplier map from this data."

This is a frictionless upsell — the user is already generating the data. The add-on just activates the intelligence layer.

### Revenue Projection

If 30% of Receipt OCR subscribers ($29/mo) also enable Receipt Bridge ($9/mo):
- 100 Receipt OCR tenants → 30 Receipt Bridge tenants → $270/mo incremental MRR
- 500 tenants → 150 bridges → $1,350/mo
- 1,000 tenants → 300 bridges → $2,700/mo

Small per-tenant revenue, but near-zero marginal cost (the code runs as a side effect of existing OCR processing).

## Demo Script

1. **Setup:** Open mobile app, logged in as a PM for a Texas-based restoration company.
2. **Scan receipt:** Tap Daily Logs → New Receipt. Photograph a Home Depot receipt.
3. **OCR extraction:** Show the auto-filled vendor name ("Home Depot #6574"), address ("1234 Main St, New Braunfels, TX 78130"), phone, and line items.
4. **Map view:** Navigate to the Map tab. Point out the new blue verified pin at Home Depot's exact location.
5. **Tap the pin:** Bottom sheet shows vendor name, store number, address, phone, "1 visit", last purchase date. Verified badge visible.
6. **Second receipt:** Scan a receipt from a local lumber yard (e.g., "Hill Country Lumber, 890 River Rd"). Show it appearing as a second verified pin.
7. **Search:** Type "lumber" in the map search. Hill Country Lumber appears first (verified, 0.5 mi) above a Lowe's (discovered, 3.2 mi).
8. **Network effect (if multi-tenant demo):** Switch to a different tenant account with a project nearby. Show that Hill Country Lumber appears as a network-suggested supplier — verified by another Nexus company.

## Scoring Rationale

- **Uniqueness (8/10):** No construction SaaS converts receipt data into supplier intelligence. The concept of "verified via purchase" is novel in this space. Loses 2 points because the individual components (OCR, maps, supplier lists) exist elsewhere — it's the integration that's unique.
- **Value (7/10):** Saves real time and money on material procurement. Not as transformative as core estimating or scheduling, but a consistent daily-use efficiency gain. Strong for field-heavy companies.
- **Demonstrable (8/10):** Scan receipt → pin appears on map is a visceral demo moment. Easy to show in under 60 seconds. Loses 2 points because the network effect (the strongest value prop) is hard to demo without real multi-tenant data.
- **Defensible (7/10):** The data moat grows with each tenant, but the technical implementation is reproducible by a well-funded competitor. The defensibility is in the data, not the code.

## Related CAMs

- **`OPS-INTL-0001`** — NexFIND: Crowdsourced Supplier Discovery & Network Intelligence (parent CAM)
- **`FIN-AUTO-0001`** — Inline Receipt OCR (the prerequisite module that feeds receipt data)
- **`FIN-INTL-0003`** — NexPRICE Regional Pricing (receipt pricing data feeds the regional price engine)
- **`EST-INTG-0001`** — Multi-Provider BOM Pricing (supplier locations from BOM search enrich the map)

## Future Extensions

- **Verified supplier badge on map** — Distinct pin style for receipt-verified vs. discovered suppliers
- **Spend analytics per supplier** — Total spend, average ticket, frequency charts on the supplier card
- **Supplier recommendations** — "Companies like yours also buy from..." based on anonymized network data
- **Price comparison alerts** — "You paid $X at Store A. Store B (2 mi away) typically charges $Y for the same category."
- **Auto-generated preferred vendor list** — Monthly report of top suppliers by spend, auto-suggested for bid packages
- **Receipt-to-BOM reconciliation** — Match receipt line items against project BOM to track material procurement progress

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial detailed CAM — Receipt Bridge concept, architecture, business model, flywheel, competitive analysis |
