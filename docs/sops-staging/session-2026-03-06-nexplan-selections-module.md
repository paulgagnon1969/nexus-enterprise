---
title: "Session Export — NexPLAN Selections Module Design"
module: selections
revision: "1.0"
tags: [sop, session-export, selections, nexplan, cabinets, kitchen, floor-plan, ai]
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# Session Export — 2026-03-06 — NexPLAN Selections Module

## Summary

Live design session that started with a real kitchen and bathroom cabinet layout for a lakefront property renovation, then evolved into the architecture and documentation for a full **NexPLAN Selections Module** within NCC.

## Problems Solved

### 1. Kitchen & Bath Cabinet Layout (BWC Dorian Gray Shaker)

Designed a complete kitchen cabinet layout through 3 revisions for a lakefront property:

- **Lake Wall** (~10' active, right to left): End Corner 36"W → DW 24" → Sink Base 36" → Base 24". Left ~14' open for lake view.
- **Driveway Wall** (15'9" total): Corner (36" on driveway) → Base 36" + Wall 36"H → Range 30" → Base 36" + Wall 36"H → Refrigerator ~36". 14'6" cabinet run.
- **Peninsula** (connected to cabinet #3, extending south): 4× 24"W base cabinets = 8' bar with 12" overhang.
- **Bathrooms ×3**: 30"W Dorian Gray vanity sink base combos.
- **Total**: 14 cabinets + trim accessories.

### 2. Professional Output Documents

Generated two deliverables:
- **eDoc v3**: HTML quotation with SVG floor plan, BWC product image gallery, position key, order summary — carries `ncc:` metadata for Nexus Documents auto-import
- **Quote CSV v3**: BWC-formatted vendor quote sheet

Files saved to `/Volumes/4T Data/WARP TMP/exports/`.

### 3. NexPLAN Module Architecture

Turned the ad-hoc workflow into a formal module design:
- Identified 5 core components: Planning Room, NexPLAN Viewer, Vendor Catalog, Selection Sheet, Selection Board
- Designed 6 Prisma models, full REST API, 4-phase implementation plan
- Placed the module inside the existing **Plans tab** as a sub-section alongside Plan Sheets

## Decisions Made

1. **NexPLAN lives in the Plans tab** — not a new top-level tab. The existing `PlanSheetsTab` becomes a sub-section alongside "Selections".
2. **BWC Dorian Gray Shaker is the seed catalog** — all product data from this session (SKUs, dimensions, images, prices) becomes the first vendor catalog entry.
3. **AI-assisted planning is Phase 2** — Phase 1 is manual product selection + sheet generation (proving the eDoc template works at scale).
4. **CAM scored 36/40** (EST-AUTO-0002) — highest demonstrability (10/10) in the portfolio because the session itself is the demo.
5. **Peninsula uses standard 24"D bases** (not 21"D vanity bases) — provides structural rigidity and more storage.

## Documents Created

| Document | Path | Type |
|----------|------|------|
| Architecture | `docs/architecture/nexplan-selections-module.md` | Architecture doc |
| CAM | `docs/cams/EST-AUTO-0002-nexplan-ai-selections.md` | Competitive Advantage Module |
| SOP | `docs/sops-staging/selections-module-sop.md` | Standard Operating Procedure |
| Plan | Plan ID `15f6c0d8-32e8-4321-8778-f24b6e6cdd4b` | Implementation plan |
| eDoc v3 | `/Volumes/4T Data/WARP TMP/exports/kitchen-bath-quotation-edoc-v3-20260306.html` | Client-facing quotation |
| Quote CSV v3 | `/Volumes/4T Data/WARP TMP/exports/bwc-dorian-gray-quote-v3-20260306.csv` | Vendor quote sheet |
| Session Export | `docs/sops-staging/session-2026-03-06-nexplan-selections-module.md` | This document |

## Lessons Learned

- **The workflow is the product**: The 45-minute AI-assisted cabinet layout session proved the entire value proposition. Productizing it as NexPLAN is a matter of persisting the conversation and templatizing the output.
- **Vendor product images are essential**: The BWC product gallery with real 300×300 thumbnails made the eDoc dramatically more professional than a text-only quote.
- **SVG floor plans are highly effective**: The numbered-position SVG with dimensions communicates the layout unambiguously — better than a photo of a hand-drawn plan.
- **INP matters for the Plans tab**: The project detail page is 36K lines. Any new content in the Plans tab must lazy-load and use transitions per the INP contract.

## CAM Evaluation

**EST-AUTO-0002 — NexPLAN AI-Assisted Selections**

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Uniqueness | 9/10 | No competitor combines AI floor plan analysis + vendor product fitting + eDoc generation |
| Value | 9/10 | 2-4 hours saved per room; directly revenue-producing |
| Demonstrable | 10/10 | This session IS the demo — floor plan → conversation → professional document |
| Defensible | 8/10 | Vendor catalog integration + Nexus ecosystem + conversation persistence = switching cost |
| **Total** | **36/40** | Exceeds CAM threshold (24). Created as `EST-AUTO-0002`. |

## Next Steps

1. **Phase 1 build**: Vendor catalog Prisma models + BWC seed + selection sheet generator API + Plans tab sub-nav
2. **Iterate on eDoc template**: The v3 HTML is the prototype; templatize it for any room/vendor combination
3. **Client sharing**: Wire up Selection Sheet → Collaborator Technology sharing flow
4. **Phase 2**: Planning Room chat interface with OpenAI Vision integration

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial session export |
