---
title: "NexFIND — Supplier Intelligence SOP"
module: nexfind-supplier-intelligence
revision: "1.0"
tags: [sop, operations, intelligence, supplier, nexfind, map, mobile, discovery]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
cam_ref: OPS-INTL-0001
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, field]
---

# NexFIND — Supplier Intelligence

## Purpose
NexFIND builds a living, crowdsourced supplier map that grows automatically from every tenant's daily activity — receipt captures, product searches, driving directions, and project creation. This SOP documents how suppliers are discovered, captured, managed, and shared across the network.

## Who Uses This
- **Field crews** — find nearby suppliers, get directions, capture receipts
- **PMs** — manage the tenant supplier library, review flagged suppliers
- **Estimators** — locate specialty material suppliers for specific projects
- **Admins** — configure discovery radius, manage NexFIND Pro settings

## Workflow

### 1. Automatic Supplier Discovery (on Project Creation)
When a new project is created with an address:
1. NexFIND queries Google Places API for nearby suppliers within the configured radius
2. Results filtered by construction/restoration-relevant categories (lumber, roofing, electrical, plumbing, rental, big-box)
3. Suppliers de-duplicated by `placeId` to prevent duplicates across projects
4. Each supplier stored with: lat/lng, category, address, phone, website, hours
5. Suppliers appear as blue pins (🏪) on the project's mobile map

### 2. Product Search → Supplier Locator
1. On mobile, open the project map → tap the search bar
2. Type a product name (e.g., "standing seam metal roofing panels")
3. NexFIND returns ranked results: proximity → category match → availability → community rating
4. Tap a supplier → see full card (address, phone, hours, distance)
5. Actions: **Get Directions**, **Call**, **Save to Library**, **Flag Closed**

### 3. Automatic Supplier Capture
Suppliers are captured automatically from normal workflows:

| Trigger | What Happens |
|---------|-------------|
| **Get Directions** tapped | Navigation event recorded; supplier auto-added to tenant library |
| **Receipt OCR processed** | Vendor matched via 3-tier engine (store # → geo → fuzzy name); new supplier created if no match |
| **Project created** | Google Places scrape adds nearby suppliers |
| **Manual save** | PM pins a known supplier directly |

### 4. Vendor Matching Engine (3-Tier)
When a receipt is OCR'd, the vendor is matched against existing suppliers:
1. **Store number match** — exact store ID comparison (highest confidence)
2. **Geo-proximity match** — Haversine distance within 200m of known supplier
3. **Fuzzy name match** — ILIKE comparison for partial name matches

If no match at any tier → new `LocalSupplier` record created automatically.

### 5. Supplier Flag/Review Lifecycle
1. Any user can flag a supplier as "Closed" with a reason
2. Pin changes to amber (⚠️)
3. PM receives a review task
4. PM approves (supplier marked closed) or denies (pin restored)

### 6. Map Experience (Mobile)
- **Blue pins** (🏪) — active suppliers
- **Amber pins** (⚠️) — flagged/pending review
- **Toggle on/off** via the filter chip bar
- **Tap a pin** → bottom sheet with full details
- **Cluster view** — pins cluster at zoom-out levels for performance

## Tenant Supplier Library Management

### Adding Suppliers Manually
1. Open the project map → tap **+ Add Supplier**
2. Enter: name, address, category, phone, notes
3. Supplier appears on all project maps in the area

### Editing Supplier Details
1. Tap a supplier pin → tap **Edit**
2. Update: category tags, notes, phone, hours
3. Notes are tenant-private (e.g., "ask for Mike at contractor desk")

### Removing Suppliers
1. Flag as closed (preferred — preserves history)
2. Or delete from the supplier library (admin only)

## NexFIND Network (Multi-Tenant Intelligence)
- Every saved/captured supplier feeds the NEXUS system-wide supplier index (anonymized)
- New tenants in a market get pre-populated supplier pins from the network
- **NexFIND Pro** (paid tier): full network directory, aggregated spending patterns, community notes

## Key Features
- **Zero-effort data collection** — suppliers captured from normal workflows
- **3-tier vendor matching** — prevents duplicate supplier records
- **Network effect** — more tenants = richer supplier data for everyone
- **Category-aware search** — find specialty suppliers by trade
- **Offline-safe** — cached supplier pins available without connectivity

## Related Modules
- [Inline Receipt OCR](inline-receipt-ocr-sop.md) — receipt-to-supplier auto-capture
- [BOM Pricing Pipeline](bom-pricing-pipeline-sop.md) — store locations from BOM search enrich the supplier map
- [Smart Media Upload](smart-media-upload-sop.md) — supplier photos upload reliably from the field

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial SOP — discovery, capture, matching, library management, network intelligence |
