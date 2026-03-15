---
cam_id: EST-AUTO-0002
title: "NexPLAN — AI-Assisted Selections & Planning"
mode: EST
category: AUTO
revision: "1.0"
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
website: false
scores:
  uniqueness: 9
  value: 9
  demonstrable: 10
  defensible: 8
  total: 90
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
tags: [cam, estimating, automation, selections, planning, ai, floor-plan, vendor-catalog, cabinets, finishes]
---

# EST-AUTO-0002: NexPLAN — AI-Assisted Selections & Planning

> *Upload a floor plan. Describe what you want. Get a professional selection package in 5 minutes.*

## Work ↔ Signal
> **The Work**: Upload a floor plan, describe what you want in plain English, get a professional selection package — SVG layout, product gallery, vendor quote sheet — in 5 minutes.
> **The Signal**: Selection packages with real vendor products and validated dimensions demonstrate professional rigor that clients and adjusters can trust. (→ Reputation: estimating quality)

## Elevator Pitch

NexPLAN lets a PM upload a floor plan image, describe layout constraints in plain English ("peninsula off the third cabinet, fridge at the end"), and receive a complete selection package — SVG floor plan with numbered positions, product image gallery with real vendor photos, vendor-formatted quote sheet, and a print-ready eDoc — in a single AI-assisted conversation. No other construction or restoration platform offers AI-driven floor plan analysis with automatic vendor product fitting and professional document generation. The output is a self-contained HTML eDoc that auto-imports into Nexus Documents, creating a fully traceable selection record from concept to installation.

## The Problem

Material and finish selections are one of the most time-consuming, error-prone parts of restoration and construction project management:

- **Scattered tools**: Selections happen across WhatsApp photos, spreadsheets, vendor websites, and hand-drawn floor plans. There is no single source of truth.
- **Manual assembly**: PMs spend 2-4 hours per room assembling a quote — looking up SKUs, verifying dimensions fit, formatting a document, pulling product images from vendor sites.
- **Dimension errors**: Products are selected without validating they physically fit the space. A 36" base cabinet gets ordered for a 30" gap. Returns and reorders cost time and money.
- **No vendor formatting**: Each vendor expects quotes in a different format. PMs reformat the same data multiple times.
- **No project-level view**: There's no way to see all selections across all rooms for a project, track approval status, or monitor budget vs. allowance.

## The NCC Advantage

NexPLAN solves all five problems in a single integrated workflow:

1. **AI Floor Plan Analysis**: Upload a photo or scan of a floor plan. OpenAI Vision extracts dimensions, identifies walls, doors, windows, and appliance locations. The PM doesn't need to manually measure or digitize the drawing.
2. **Natural Language Layout Design**: The PM describes what they want in plain English. The AI proposes a layout using real vendor products with real dimensions, respecting wall lengths and clearances.
3. **Automatic Vendor Product Fitting**: Products are selected from a structured vendor catalog (starting with BWC Dorian Gray Shaker, expanding to HD, Lowe's, CliqStudios, etc.). The AI validates that each product physically fits its assigned position.
4. **Professional Selection Sheet Generation**: One click generates a complete HTML eDoc with SVG floor plan, product image gallery, position key, order summary, and pricing. The eDoc carries `ncc:` metadata for auto-import into Nexus Documents.
5. **Vendor-Specific Quote Export**: CSV exports formatted for each vendor's ordering system (BWC, HD Pro Desk, etc.).
6. **Selection Board**: Project-level kanban/table showing all selections across all rooms with status tracking (proposed → approved → ordered → delivered → installed) and budget monitoring.

**Key insight**: Selections are a spatial problem (products must fit the room), a catalog problem (products come from specific vendors with specific SKUs), and a documentation problem (the output must be professional and traceable). NexPLAN treats it as all three simultaneously.

## Expected Operational Impact

All impact figures are expressed as a **percentage of annual revenue** so they scale naturally across company sizes.

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **PM time savings** | ~0.30% | 2-4 hours per room × ~5 rooms/project eliminated through AI-assisted layout |
| **Order accuracy improvement** | ~0.15% | Fewer returns/reorders from dimension validation and correct SKU selection |
| **Selection cycle compression** | ~0.10% | Faster client approvals from professional documents; reduces project float |
| **Budget control** | ~0.05% | Selection Board prevents over-budget purchasing via real-time tracking |
| **Total NexPLAN Impact** | **~0.60%** | **Combined labor, accuracy, speed, and budget control as a share of revenue** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | Est. Selections Cost | NexPLAN Impact (~0.60%) |
|---------------|---------------------|------------------------|
| **$1M** | ~$40K | **~$6,000** |
| **$2M** | ~$80K | **~$12,000** |
| **$5M** | ~$200K | **~$30,000** |
| **$10M** | ~$400K | **~$60,000** |
| **$50M** | ~$1.6M | **~$300,000** |

*Compounds with EST-INTG-0001 (BOM Pricing) — vendor pricing data from BOM searches feeds directly into selection cost estimates, creating a closed-loop material cost optimization pipeline.*

## Competitive Landscape

| Competitor | Has This? | Notes |
|------------|-----------|-------|
| Buildertrend | No | Has a "Selections" feature but it's a flat checklist — no floor plans, no AI, no vendor integration |
| CoConstruct | No | Selection sheets are manual form builders — no spatial awareness or vendor catalogs |
| Procore | No | No selections module at all; procurement is PO-focused, not design-focused |
| Xactimate | No | Estimates materials from line items, but no visual floor plan layout or vendor product fitting |
| Houzz Pro | Partial | Has a mood board / selections tool but no AI layout, no floor plan analysis, no vendor quote export |
| CompanyCam | No | Photo documentation only |
| Cedreo / HomeByMe | Partial | 3D room design tools exist but they are standalone apps with no project management integration, no vendor catalogs with real SKUs, and no eDoc generation |

## Use Cases

1. **Kitchen cabinet layout**: PM uploads floor plan photo, describes the layout in conversation ("L-shaped with peninsula, fridge at the end"), AI fits BWC cabinets to the space, generates SVG plan + product gallery + BWC quote sheet.
2. **Bathroom vanity selections**: PM creates a room for each bathroom, picks vanity combos from the catalog, generates a consolidated selection sheet showing all 3 bathrooms.
3. **Client presentation**: PM shares the generated eDoc with the homeowner via Collaborator Technology. Client sees professional floor plan with product photos and pricing — approves or requests changes inline.
4. **Insurance supplement evidence**: Selection Sheet documents exactly which products were chosen with vendor pricing, supporting supplement requests with carrier-grade documentation.
5. **Multi-vendor comparison**: PM runs the same layout against BWC and HD catalogs, compares total cost, presents both options to the client.

## Technical Implementation

```
Frontend: Inside PLANS tab as "Selections" sub-section
  - Plans tab wrapper with sub-nav: Plan Sheets | Selections
  - Lazy-loaded SelectionsSection component
  - Planning Room chat with image upload
  - Inline eDoc viewer for Selection Sheets

API: apps/api/src/selections/ (NestJS module)
  - REST endpoints for rooms, messages, selections, sheets
  - OpenAI Vision integration for floor plan analysis
  - HTML eDoc + CSV generation engine

Database: 6 new Prisma models
  - PlanningRoom, PlanningMessage
  - VendorCatalog, VendorProduct
  - Selection, SelectionSheet

Seed data: BWC Dorian Gray Shaker catalog (~60 SKUs)
```

## Scoring Rationale

- **Uniqueness (9/10)**: No construction/restoration platform combines AI floor plan analysis + natural language layout design + real vendor product fitting + automated eDoc generation. Buildertrend and CoConstruct have basic selection checklists; Houzz Pro has mood boards. None approach the spatial-aware, AI-driven workflow NexPLAN offers. The closest analogs are consumer-grade 3D room designers (Cedreo, HomeByMe) which lack project management integration and real vendor SKU catalogs.

- **Value (9/10)**: Eliminates 2-4 hours of manual work per room. For a typical restoration project with 5 rooms of selections, that's 10-20 hours of PM time per project. The dimension validation alone prevents costly ordering errors. The professional eDoc output accelerates client approvals and supports insurance supplement negotiations. This directly impacts revenue by compressing project timelines and reducing waste.

- **Demonstrable (10/10)**: This is one of the most visually compelling features in the entire NCC portfolio. The demo IS the feature — upload a floor plan, have a conversation, watch the AI generate a professional floor plan with product photos in real time. The before/after is dramatic: 4 hours of manual spreadsheet work vs. 5 minutes of conversation. The SVG floor plan, product image gallery, and vendor quote sheet are immediately impressive artifacts.

- **Defensible (8/10)**: The combination of vendor catalog integration (structured SKU data with real dimensions), Nexus ecosystem integration (auto-import into Documents, status tracking in Selection Board, budget monitoring), AI conversation persistence (PM can return and iterate on layouts over time), and eDoc metadata system creates significant switching cost. Individual pieces (AI chat, floor plan tools) exist elsewhere, but the integrated pipeline from conversation → validated layout → professional document → project tracking is unique to NCC.

**Total: 36/40** — Exceeds CAM threshold (24). Highest demonstrability score in the portfolio.

## Related CAMs

- `EST-INTG-0001` — Multi-Provider BOM Pricing (vendor pricing feeds into selection cost estimates)
- `EST-SPD-0001` — Redis Price List Caching (price list data enriches vendor catalog pricing)
- `CLT-COLLAB-0001` — Client Tenant Tier Collaboration (selection eDocs shared via Collaborator Technology)
- `FIN-VIS-0001` — Purchase Reconciliation (ordered selections flow into reconciliation)

## Expansion Opportunities

- **3D visualization** — render the floor plan layout as a 3D room view using Three.js
- **Template library** — save proven layouts (e.g., "Standard L-Kitchen") as reusable templates
- **Vendor API integration** — real-time pricing and availability from HD Pro, Lowe's Pro, specialty vendors
- **Material schedule generation** — auto-generate a delivery schedule based on installation order
- **Client self-service selections** — homeowner can browse pre-approved catalog and make selections within budget constraints
- **Photo-to-selection** — PM photographs installed finishes in another project; AI identifies products and creates a selection from the photo

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial draft — full CAM from live kitchen/bath layout session |
