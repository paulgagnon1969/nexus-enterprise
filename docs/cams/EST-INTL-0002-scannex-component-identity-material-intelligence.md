---
title: "ScanNEX Component Identity & Material Intelligence"
cam_id: EST-INTL-0002
mode: EST
category: INTL
revision: "1.0"
status: draft
created: 2026-03-13
updated: 2026-03-13
author: Warp
score: 36
score_breakdown:
  uniqueness: 9
  value: 10
  demonstrable: 9
  defensible: 8
nexop: ~0.85%
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
tags: [cam, scannex, component-identity, material-intelligence, lidar, vision, bom, estimating, mobile]
---

# EST-INTL-0002 — ScanNEX Component Identity & Material Intelligence

*"Scan a room. Know every baseboard, every crown, every casing — profile, material, finish — before you leave the jobsite."*

## Problem

Restoration estimating requires **two layers** of measurement data:

1. **Geometry** — how many linear/square feet of each surface (ScanNEX already provides this via LiDAR + RoomPlan)
2. **Identity** — *what* is being measured: 3.5" colonial MDF baseboard, 5.25" craftsman oak crown, 4" ranch pine casing

Every competitor that offers LiDAR scanning stops at layer 1. Estimators still return to the field to hand-measure trim profiles, photograph materials, and manually classify components. This adds a half-day per room for a full scope, introduces transcription errors, and delays estimate production by 24-48 hours.

The gap between "87.5 LF of baseboard" and "87.5 LF of 3.5" colonial MDF baseboard, painted, semi-gloss white" is the difference between a generic estimate and a precise, defensible scope.

## NCC Advantage

ScanNEX Component Identity closes the geometry-to-identity gap in a single visit through a three-stage pipeline:

### Stage 1: Passive Detection During Scan
During the RoomPlan LiDAR scan (no extra steps for the field tech):
- **High-res frame capture** — full-resolution JPEG per wall, triggered on new wall detection
- **Vision contour analysis** — `VNDetectContoursRequest` identifies horizontal trim bands (baseboard, crown, chair rail) by aspect ratio and vertical position
- **LiDAR confidence scoring** — accumulated depth confidence map provides a quality metric for the entire session

### Stage 2: Guided Material Walk (30-60 seconds per room)
After the scan completes, the field tech is guided through a checklist of detected components:
- Checklist auto-populates from detected trim bands + doors/windows + surfaces
- One close-up photo per component type (baseboard, crown, casing, flooring, wall surface, ceiling)
- AR overlay hints guide framing ("Get within 6-12 inches")
- Photos stored locally at 0.95 quality for downstream AI analysis

### Stage 3: Enriched BOM Generation
On completion, the system combines geometry data with component profiles to produce estimate-ready line items:
- 9 categories: baseboard, crown, chair rail, door casing, window casing, flooring, wall surface, ceiling, openings
- Each line item includes: quantity, unit, profile description, material, finish, dimension, Xactimate code, confidence
- Example output: "87.5 LF of 3.5" colonial MDF baseboard" instead of "87.5 LF baseboard"

### Future: Server-Side AI Classification
Material Walk photos will be processed by GPT-4o/Gemini Vision to automatically classify:
- Profile style (colonial, ranch, craftsman, modern, ogee, bullnose)
- Material (MDF, pine, oak, poplar, PVC, plaster)
- Finish (painted, stained, primed, raw)
- Color (via color histogram analysis)

## Score: 36/40

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| **Uniqueness** | 9 | No restoration platform combines LiDAR room scanning with component-level trim profile identification. Competitors measure rooms; NCC identifies what's in them. |
| **Value** | 10 | Eliminates the field re-visit for material identification. Turns a 2-visit estimate into a 1-visit estimate. Reduces scope disputes by documenting exact materials at origination. |
| **Demonstrable** | 9 | Highly visual: scan a room, walk through the checklist, see "87.5 LF of 3.5" colonial MDF baseboard" appear in the BOM. Before/after comparison is immediately compelling in demos. |
| **Defensible** | 8 | Multi-layer technical moat: Vision contour classification + LiDAR confidence scoring + guided capture UX + enriched BOM builder. Individual pieces exist in isolation; the integrated pipeline is unique. Server-side AI classification adds depth over time. |

## NexOP Impact: ~0.85%

- Eliminates 0.5-1 field re-visits per project for material identification → labor savings
- Reduces estimate production time by 24-48 hours → faster project starts
- Reduces scope disputes from material misidentification → fewer change orders
- More precise Xactimate line items → better alignment with carrier pricing

## Technical Implementation

### Modified Files
- `apps/mobile/modules/nexus-room-plan/ios/NexusRoomPlanModule.swift` — high-res frame capture, LiDAR confidence accumulation
- `apps/mobile/modules/nexus-room-plan/ios/VisionAnalyzer.swift` — `VNDetectContoursRequest` trim band detection
- `apps/mobile/modules/nexus-room-plan/index.ts` — `TrimBandRaw`, `highResFramePaths`, `lidarConfidence` types
- `apps/mobile/src/scannex/types.ts` — `ComponentType`, `ComponentProfile`, `EnrichedLineItem`, `TrimBandDetection`
- `apps/mobile/src/scannex/roomResultBuilder.ts` — `buildEnrichedBOM()`, `estimateTrimHeightFromBands()`
- `apps/mobile/src/scannex/screens/MaterialWalkScreen.tsx` — guided post-scan capture screen
- `apps/mobile/src/screens/RoomScanScreen.tsx` — `MATERIAL_WALK` mode integration
- `apps/mobile/src/components/RoomScanResultView.tsx` — "Start Material Walk" CTA button

### Data Flow
```
LiDAR Scan
  → High-res frames captured per wall
  → Vision contours detect trim bands
  → LiDAR confidence accumulated
  → ScanNEXRoomResult with trimBands[], highResFramePaths[], lidarConfidence

Material Walk (guided 30-60s)
  → Close-up photos per component type
  → Preliminary ComponentProfiles built (height from trim bands, photo URL)
  → enrichedBOM[] generated via buildEnrichedBOM()

Future: API-side AI
  → Material Walk photos → GPT-4o/Gemini Vision
  → Profile style, material, finish, color classification
  → ComponentProfiles enriched with AI results
  → enrichedBOM regenerated with precise descriptions
```

## Related Modules
- ScanNEX SOP (`docs/sops-staging/mobile-scanning-architecture-decision.md` rev 6.0)
- NexCAD Enhanced Video Assessment (CAM `EST-ACC-0002`)
- NexBRIDGE Video Index & Re-scan (CAM `EST-INTL-0001`)
- Project & Tenant Scan Hub (CAM `OPS-VIS-0003`)
- NexCAD Precision Scan → CAD Pipeline (CAM `TECH-INTG-0001b`)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-13 | Initial release. Capture pipeline enhancements (high-res frames, Vision contours, LiDAR confidence), ComponentProfile + EnrichedLineItem types, buildEnrichedBOM(), MaterialWalkScreen, RoomScanScreen integration |
