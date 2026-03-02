---
cam_id: "OPS-INTL-0001"
title: "NexFIND — Crowdsourced Supplier Discovery & Network Intelligence"
mode: OPS
category: INTL
score:
  uniqueness: 9
  value: 9
  demonstrable: 9
  defensible: 8
  total: 35
status: draft
created: 2026-03-02
updated: 2026-03-02
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, field]
---

# OPS-INTL-0001: NexFIND — Crowdsourced Supplier Discovery & Network Intelligence

## Competitive Advantage
Every restoration and construction company faces the same problem: a crew is on-site, needs a specific product, and has no idea which nearby supplier carries it. They waste time calling around, driving to the wrong store, or defaulting to the same big-box retailer regardless of price or availability. **NexFIND** solves this by building a living, crowdsourced supplier map that grows automatically from every tenant's daily activity — receipt captures, product searches, driving directions, and manual saves. The more companies on Nexus, the richer the supplier network becomes for everyone. No competitor in restoration or construction SaaS has a multi-tenant supplier intelligence network with passive data capture.

## What It Does

### 1. Project-Triggered Supplier Discovery
When a new project is created with an address, NexFIND automatically scrapes nearby suppliers within a configurable radius. This seeds the map with known big-box stores (Home Depot, Lowe's, etc.) **and** local specialty suppliers (lumber yards, roofing distributors, electrical wholesalers, plumbing supply houses, rental yards).

- Uses Google Places API (Nearby Search) with construction/restoration-relevant category filters
- Results are de-duplicated by `placeId` to prevent duplicates across projects
- Each discovered supplier is stored with lat/lng, category, address, phone, website, and hours
- Suppliers appear as pins on the project's mobile map immediately

### 2. Product Search → Supplier Locator
A field crew member searches for a specific product (e.g., "3/4 inch OSB sheathing"). NexFIND returns:

- **Known suppliers in the area** that are likely to carry it (category-matched from the supplier index)
- **Live product availability** from integrated big-box providers (via existing BOM pricing engine)
- **Distance and drive time** from the project site to each supplier
- Results ranked by: proximity → category match → availability confidence → community rating

The user taps a supplier → sees the full card (address, phone, hours, products, community notes) → taps "Get Directions" → native maps opens.

### 3. Automatic Supplier Capture — Directions
When a user taps "Get Directions" to any supplier (discovered or searched), NexFIND:

- Records the navigation event (user, timestamp, project context)
- If the supplier is not yet in the tenant's saved library → auto-adds it
- Captures the supplier as a `LocalSupplier` record with full metadata

### 4. Automatic Supplier Capture — Receipts
When a receipt is photographed and OCR-processed (existing Inline Receipt OCR — FIN-AUTO-0001), NexFIND:

- Extracts vendor name, address, store number, phone from OCR data *(already implemented)*
- Matches against existing suppliers via the 3-tier matching engine (store number → geo-proximity → fuzzy name) *(already implemented)*
- If no match → creates a new `LocalSupplier` record automatically from the receipt data
- Links the receipt to the supplier for spending analytics

### 5. Tenant Supplier Library
Each tenant (company) maintains their own saved supplier library:

- **Auto-saved suppliers** appear from receipt captures, direction taps, and project scrapes
- **Manually added suppliers** — PMs can pin a supplier they know about
- **Flag/review lifecycle** — any user can flag a supplier as closed; PM reviews and approves/denies *(already implemented)*
- **Category tagging** — suppliers tagged by trade (Lumber, Roofing, Electrical, Plumbing, Paint, Rental, etc.)
- **Notes and ratings** — tenant-private notes ("ask for Mike at the contractor desk", "delivery takes 3 days")

### 6. The NexFIND Network — Multi-Tenant Intelligence
This is the core differentiator and the network-effect moat:

- Every saved/captured supplier is added to the **NEXUS system-wide supplier index** (anonymized — no tenant data exposed)
- When Tenant B enters a new market where Tenant A already operates, Tenant B's map is **pre-populated** with verified supplier locations from the network
- **Automatic sharing rule:** a supplier is shared back to a tenant only when that tenant explicitly saves it (directions, receipt, or manual add). Tenants never see the full network index — they see suppliers relevant to their projects
- **Paid tier: NexFIND Pro** — tenants who subscribe get access to the full network supplier directory for any zip code, including community-contributed notes, spending patterns (aggregated/anonymized), and category intelligence
- The network grows passively: every receipt scanned, every set of directions requested, every project created adds signal

### 7. Map Experience (Mobile)
Supplier pins render on the existing Mapbox map alongside project pins:

- **Blue pins** (🏪) = active suppliers *(already implemented)*
- **Amber pins** (⚠️) = flagged/pending review *(already implemented)*
- **Toggle on/off** via the filter chip bar *(already implemented)*
- **Tap a pin** → bottom sheet with name, category, address, phone, hours, distance
- **Actions from callout:** Get Directions, Call, Save to Library, Flag Closed
- **Search overlay:** type a product name → supplier results overlay on the map with ranked pins

## Why It Matters

- **Time savings**: field crews stop wasting 30–60 minutes per trip figuring out where to buy materials. Average restoration project has 15–25 material runs — that's 7.5–25 hours saved per project.
- **Network effect moat**: every tenant that joins Nexus makes the supplier network more valuable for all tenants. Competitors would need thousands of paying customers generating receipt/location data to replicate.
- **Passive data capture**: no one has to manually enter suppliers. The system learns from normal daily activity — receipts, searches, navigation.
- **Local knowledge at scale**: a 3-person crew in a new city gets the benefit of every other Nexus crew that has ever worked there. "Institutional knowledge" becomes "network knowledge."
- **Revenue opportunity**: NexFIND Pro (full network access) is a natural paid add-on that funds the data infrastructure while creating vendor-side marketplace potential.

## Demo Script
1. **Project auto-discovery:** Create a new project in Denver, CO. Show the map — supplier pins auto-appear within 15 miles (Home Depot, Lowe's, ABC Supply, local lumber yards).
2. **Product search:** On mobile, open the project map. Tap the search bar and type "standing seam metal roofing panels." Show the ranked supplier list: ABC Supply (2.3 mi), Home Depot (3.1 mi), Peterson Metals (4.8 mi).
3. **Directions capture:** Tap "Get Directions" on Peterson Metals. Show native maps launching. Return to Nexus — Peterson Metals is now in the tenant's supplier library with a "Saved via Directions" source tag.
4. **Receipt capture:** Photograph a receipt from Peterson Metals. Show OCR auto-filling the daily log. Show the supplier card update — it now has the store number, phone, and a linked receipt.
5. **Network effect:** Switch to a different tenant account that has a project 5 miles away. Show that Peterson Metals appears as a suggested supplier (added by the network), even though this tenant has never been there.
6. **Flag lifecycle:** Tap a supplier → "Flag Closed" → enter reason. Show the PM receiving the review task. Approve → pin turns red and grays out.

## Technical Differentiators

- **3-tier vendor matching engine** — store number → geo-proximity (200m Haversine) → fuzzy name ILIKE. Already production-tested through receipt OCR pipeline. Prevents duplicates without requiring perfect data.
- **Dual-layer data model** — `LocalSupplier` (tenant-scoped, company-owned) + system-wide index (planned). Tenants own their data; the network index is an anonymized aggregate.
- **Google Places de-duplication** — unique constraint on `(companyId, placeId)` prevents duplicate supplier records across multiple project scrapes in the same market.
- **Zero-effort data collection** — receipt OCR, direction taps, and project creation all feed the supplier index as side effects of normal workflows. No dedicated "add a supplier" workflow required (though one exists for manual entry).
- **Existing map infrastructure** — Mapbox GL with clustered ShapeSource, status-colored pins, animated bottom-sheet callouts, and filter chips. NexFIND layers on top of proven code.
- **Audit trail** — every flag, approval, denial, and auto-capture is logged via the audit service. Full lifecycle visibility for compliance.

## Scoring Rationale

- **Uniqueness (9/10):** No restoration/construction SaaS has a multi-tenant crowdsourced supplier network. Procore, Buildertrend, and JobNimbus have no equivalent. This is genuinely novel.
- **Value (9/10):** Material procurement is the #2 time sink for field crews after travel. Knowing exactly where to go and what's available saves real hours and dollars on every project.
- **Demonstrable (9/10):** Map pins, product search, live directions, receipt auto-capture — every feature is visual and can be demoed in under 5 minutes on a phone.
- **Defensible (8/10):** Network effect creates a data moat. Each new tenant enriches the supplier index. A competitor would need to build the same user base generating the same passive data — that takes years, not code.

## Expansion Opportunities

- **NexFIND Pro (Paid Tier)** — Full network directory access, aggregated spending analytics, vendor-comparison reports by zip code
- **Vendor Marketplace** — Suppliers pay to appear as "Featured" in search results. Restoration suppliers advertise directly to active project crews.
- **Price Intelligence** — Cross-reference receipt OCR data across tenants (anonymized) to build price benchmarks by product, region, and season
- **Delivery Tracking** — Integrate with supplier delivery APIs to show real-time ETA of ordered materials on the project map
- **Inventory Integration** — When a crew gets directions to a supplier, pre-generate a pick list from the project's material requirements
- **Supplier Ratings** — Tenant crews rate suppliers on speed, price, stock reliability. Aggregate ratings visible to NexFIND Pro subscribers.
- **Offline Map Tiles** — Cache supplier pins for areas around active projects so the map works in low-connectivity job sites
