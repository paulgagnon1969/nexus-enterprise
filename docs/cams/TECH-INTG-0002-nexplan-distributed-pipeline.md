---
cam_id: TECH-INTG-0002
title: "NexPLAN Distributed Selection Pipeline — Cross-Surface Coordination for Material Selections"
mode: TECH
category: INTG
revision: "1.0"
status: draft
created: 2026-03-08
updated: 2026-03-08
author: Warp
website: false
scores:
  uniqueness: 8
  value: 8
  demonstrable: 9
  defensible: 7
  total: 80
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
tags: [cam, technology, integration, distributed-pipeline, cross-surface, mobile, desktop, nexbridge, nexplan, selections, real-time-sync, device-origin]
---

# TECH-INTG-0002: NexPLAN Distributed Selection Pipeline — Cross-Surface Coordination for Material Selections

> *Start selections on your phone in the field, refine them at your desk, approve them from anywhere.*

## Work ↔ Signal
> **The Work**: Device-aware, multi-surface coordination (mobile → desktop → web) with unified pipeline tracking. Every action tagged by device origin, pipeline stage, and user.
> **The Signal**: Cross-device workflow completion patterns reveal operational sophistication — the system knows which teams use field-to-desk coordination effectively. (→ Reputation: workflow maturity)

## Elevator Pitch

The NexPLAN Distributed Pipeline enables material selections to flow seamlessly across three surfaces — mobile (field capture), desktop (NexBRIDGE design), and web (review/approval) — with every action tracked by device origin, pipeline stage, and user. A PM walks through a jobsite, creates a planning room from their phone, photographs the space, and picks initial products from the vendor catalog. Back at the office, they refine the layout in NexBRIDGE's desktop tools with full-resolution plan sheets. The estimator reviews and approves from the web dashboard. At every step, the system knows which device initiated each action, where each selection sits in the pipeline, and what's left to complete — across all three surfaces simultaneously. No other construction platform offers device-aware, multi-surface material selection coordination with unified pipeline tracking.

## The Problem

Material selections in restoration and construction suffer from a surface fragmentation problem:

- **Field capture is disconnected from office design**: PMs capture room dimensions and photos on their phones but then have to re-enter everything into a desktop application. Data doesn't flow automatically from field to office.
- **No cross-device continuity**: Starting a selection on mobile and continuing on desktop requires manual handoff — emailing photos, re-uploading floor plans, re-entering constraints. There is no shared state.
- **Pipeline blind spots**: When selections span multiple people and devices, nobody has a unified view of where things stand. Is the kitchen approved? Who captured the bathroom scan? Has the flooring been ordered? The answers live in different apps, email threads, and spreadsheets.
- **No attribution or audit trail**: If a selection was proposed on mobile and approved on web, there's no record of which device or user initiated each state change. For insurance-grade documentation, this traceability is critical.
- **Desktop-only tools bottleneck the workflow**: Design tools that require a full desktop application (CAD, Xactimate) create a bottleneck — PMs can't start meaningful work until they're back at their computer. Field time is wasted on capture-only tasks.

## The NCC Advantage

NexPLAN's distributed pipeline solves this with an architecture-level approach, not a feature-level workaround:

### 1. Device Origin Tracking

Every record in the selections system carries a `deviceOrigin` field (`MOBILE`, `DESKTOP`, `WEB`) and a `sourceType`/`sourceId` pair. When a PM creates a planning room from their phone during a site visit, the system records `deviceOrigin: MOBILE`. When they add products from NexBRIDGE's desktop app, each selection carries `deviceOrigin: DESKTOP`. When the estimator approves from the web dashboard, the status change records `deviceOrigin: WEB`.

This isn't just metadata — it powers:
- **Audit trails**: Every selection sheet shows the full provenance chain: "Created on mobile by John → Products added on desktop by John → Approved on web by Sarah"
- **Workflow analytics**: Management sees which surfaces are used most, where bottlenecks occur, and which PMs are most effective at field capture
- **Insurance documentation**: Carrier-grade evidence of when, where, and how each selection was made

### 2. Pipeline Status Synchronization

Each planning room carries a `pipelineStatus` JSON that tracks completion across four stages: `captured` (room documented), `designed` (products fitted), `reviewed` (AI review passed), `approved` (stakeholder sign-off). The status updates in real-time regardless of which surface triggers the change.

The mobile app shows pipeline progress as colored dots — green for complete, yellow for in-progress, gray for not started. A PM glancing at their phone in the field instantly knows which rooms still need attention, without opening a desktop application.

### 3. Three-Surface Architecture

**Mobile (Expo/React Native)**:
- `SelectionsScreen` — lists planning rooms with pipeline dots, source badges, cost rollups
- `SelectionDetailScreen` — card-based selection list with status actions (Approve → Ordered → Installed)
- `ProductPickerScreen` — searchable vendor catalog with category filters and one-tap add
- Connects to existing field tools: RoomScan → PlanningRoom bridge, photo capture, Object Capture

**Desktop (NexBRIDGE / Tauri + Rust)**:
- Full-resolution plan sheet overlay with snap-to-grid product placement
- AI-assisted layout with dimensional validation in the Rust computation layer
- Offline-capable with sync-on-reconnect for jobsite trailers with spotty connectivity

**Web (Next.js)**:
- Selection Board: project-level kanban/table showing all rooms and selections
- Selection Sheet viewer with approval workflows
- Budget vs. allowance tracking across all rooms
- Vendor quote export and eDoc management

### 4. Unified API Layer

All three surfaces share a single NestJS API with identical endpoints:
- `GET/POST /projects/:id/planning-rooms` — room CRUD
- `GET/POST /projects/:id/planning-rooms/:roomId/selections` — selection management
- `PATCH /projects/:id/selections/:selectionId` — status transitions
- `POST /projects/:id/planning-rooms/:roomId/generate-sheet` — eDoc generation
- `GET /vendor-catalogs/:id/products` — catalog search with category/text filters

The API enforces consistent business logic regardless of surface: the same validation, the same status machine, the same authorization. A selection approved on mobile has the exact same authority as one approved on web.

### 5. AI Review Across Surfaces

The AI review service runs five checks on every selection set:
- **Dimensional fit**: Does this 36" cabinet actually fit the 34" wall gap?
- **Completeness**: Are there empty positions in the layout?
- **Budget compliance**: Is the room total within the project allowance?
- **Clearance validation**: Do doors and drawers have adequate clearance?
- **Vendor consistency**: Are all products from the same catalog/finish line?

Results are scored 0-100 with letter grades and stored as `aiReview` JSON on the planning room. The review runs server-side — it doesn't matter which surface triggered it. Mobile users see the same grade as desktop users.

### 6. Vendor Catalog Integration

The pipeline includes a structured vendor catalog system starting with BWC Dorian Gray Shaker (60 SKUs across base, wall, corner, vanity, and accessory cabinets). Each product carries:
- Real dimensions (width, height, depth in inches)
- Real pricing
- Category classification for filtering
- SKU for vendor ordering

The catalog is surface-agnostic: mobile users browse the same products as desktop users, with the same search and category filters. The seed system supports adding new vendor lines (HD Pro, Lowe's Pro, CliqStudios) by running a script — no code changes needed.

## Expected Operational Impact

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **Field-to-office handoff elimination** | ~0.20% | 1-2 hours per room of re-entry work eliminated by cross-surface data flow |
| **Pipeline visibility** | ~0.10% | Fewer dropped balls — selections don't stall because someone didn't know it was their turn |
| **Multi-device flexibility** | ~0.08% | PMs can do meaningful selection work from any surface, not just desktop |
| **Attribution / audit trail** | ~0.07% | Faster dispute resolution, better insurance documentation |
| **Total Distributed Pipeline Impact** | **~0.45%** | **Combined labor, coordination, and documentation savings** |

### Real-World Extrapolation

| Annual Revenue | Distributed Pipeline Impact (~0.45%) |
|---------------|--------------------------------------|
| **$1M** | **~$4,500** |
| **$2M** | **~$9,000** |
| **$5M** | **~$22,500** |
| **$10M** | **~$45,000** |
| **$50M** | **~$225,000** |

*Compounds with EST-AUTO-0002 (AI Selections) — the AI analysis and eDoc generation multiply the value of the distributed pipeline by ensuring high-quality output regardless of which surface initiates the work.*

## Competitive Landscape

| Competitor | Multi-Surface Selections? | Device Origin Tracking? | Pipeline Sync? | Unified API? |
|-----------|--------------------------|------------------------|---------------|-------------|
| Buildertrend | Web + limited mobile | No | No | No |
| CoConstruct | Web only | No | No | N/A |
| Procore | Web + mobile (view only) | No | No | Partial |
| Xactimate | Desktop only | No | No | No |
| CompanyCam | Mobile capture → web view | No | No | Partial |
| Monday.com | Web + mobile | No | No | Yes |
| Cedreo | Desktop only | No | No | No |

**No competitor** offers selections that flow across three distinct surfaces (mobile, native desktop, web) with per-action device attribution, pipeline stage tracking, and a shared vendor catalog. Buildertrend comes closest with web + mobile but their mobile app is view/capture only for selections — you can't browse a vendor catalog or advance a selection's status from the phone. Xactimate is desktop-only, making field capture impossible without a separate tool.

## Technical Implementation

```
Architecture:
  ┌─────────────┐    ┌──────────────┐    ┌──────────┐
  │   Mobile    │    │  NexBRIDGE   │    │   Web    │
  │  (Expo RN)  │    │ (Tauri/Rust) │    │(Next.js) │
  └──────┬──────┘    └──────┬───────┘    └────┬─────┘
         │                  │                  │
         └──────────┬───────┴──────────┬───────┘
                    │                  │
              ┌─────▼──────────────────▼──────┐
              │      NestJS Selections API     │
              │   (auth, validation, business)  │
              └─────────────┬─────────────────┘
                            │
              ┌─────────────▼─────────────────┐
              │    Prisma / PostgreSQL          │
              │ PlanningRoom, Selection,        │
              │ VendorCatalog, SelectionSheet   │
              │ + deviceOrigin, pipelineStatus  │
              └────────────────────────────────┘

Prisma Models (6 new):
  PlanningRoom   — rooms with pipelineStatus JSON, deviceOrigin enum
  PlanningMessage — conversation thread per room
  VendorCatalog  — vendor line metadata (BWC, HD, etc.)
  VendorProduct  — individual SKUs with dimensions and pricing
  Selection      — product placement with position, quantity, status
  SelectionSheet — generated eDoc HTML + CSV with ncc: metadata

Enums:
  DeviceOrigin: MOBILE | DESKTOP | WEB
  SelectionStatus: PROPOSED | APPROVED | ORDERED | DELIVERED | INSTALLED | REJECTED
  PlanningRoomStatus: ACTIVE | ARCHIVED
  RoomType: KITCHEN | BATHROOM | BEDROOM | LIVING | LAUNDRY | GARAGE | OTHER

Mobile Navigation:
  ProjectsStack → Selections → SelectionDetail → ProductPicker
  DailyLogsScreen.onOpenSelections → navigates into selections flow
  RoomScan → PlanningRoom bridge (field capture feeds design pipeline)

Status Machine:
  PROPOSED → APPROVED → ORDERED → DELIVERED → INSTALLED
       └──────→ REJECTED (from any pre-INSTALLED state)
  Each transition records: userId, deviceOrigin, timestamp
```

## Use Cases

1. **Field-to-office kitchen flow**: PM walks into the kitchen on a site visit, opens the mobile app, creates a "Master Kitchen" planning room. Takes photos, creates a rough product list from the BWC catalog on their phone (base cabinets, sink base, wall cabinets). Back at the office, opens NexBRIDGE, refines the layout on the full-resolution floor plan with snap-to-grid placement. The AI review catches a 36" cabinet assigned to a 33" gap — swaps it for a 33" automatically. PM generates the selection sheet — the eDoc shows "Created on mobile → Designed on desktop → AI reviewed" in the audit trail.

2. **Distributed team approval**: PM creates selections on mobile. Estimator reviews on web, checks budget compliance, approves. Superintendent confirms material delivery on mobile, marks "DELIVERED." Office manager marks "INSTALLED" from the web dashboard after receiving the installer's sign-off. Every touchpoint is tracked by device and user.

3. **Multi-project vendor ordering**: Purchasing manager opens the web Selection Board, filters all rooms across 5 projects with status "APPROVED", exports a consolidated BWC order CSV with quantities aggregated by SKU. One vendor order covers selections from 5 different PMs who worked on 5 different devices.

4. **Insurance documentation**: Adjuster requests evidence of material selections. PM generates selection sheets for all rooms — each sheet includes device origin, timestamps, approval chain, AI review grade, and vendor pricing. The documentation was created as a natural byproduct of the workflow, not assembled after the fact.

5. **Offline jobsite trailer**: PM on a rural jobsite with no cell service opens NexBRIDGE desktop in the trailer. Creates planning rooms and adds products from the locally-cached vendor catalog. When connectivity returns, the desktop app syncs to the API. Mobile and web surfaces immediately see the new rooms with `deviceOrigin: DESKTOP`.

## Scoring Rationale

- **Uniqueness (8/10)**: Multi-surface distributed pipelines exist in enterprise software (Salesforce, Figma) but not in construction/restoration. The combination of mobile field capture → native desktop design → web approval, with per-action device attribution and unified pipeline tracking, is novel in this industry. Buildertrend and Procore have web + mobile but neither offers a native desktop surface or device-level tracking. Xactimate is desktop-only with no field capture capability.

- **Value (8/10)**: The field-to-office handoff is one of the most common time sinks in construction project management. PMs routinely spend 1-2 hours per room re-entering data captured in the field. The pipeline visibility eliminates dropped-ball scenarios where selections stall because nobody knew it was their turn to act. For companies managing 20+ active projects, the coordination savings alone justify the feature.

- **Demonstrable (9/10)**: The demo tells a compelling story across devices. Start on the phone — create a room, pick products, see pipeline dots turn green. Switch to the desktop — same room appears instantly, refine the layout. Switch to the web — approve the selections, see the full audit trail showing all three devices. The cross-surface continuity is immediately visible and impressive. Pipeline status dots and device origin badges make the distributed nature tangible.

- **Defensible (7/10)**: The concept of "same data on multiple devices" is not defensible by itself — that's table stakes for modern software. The defensibility comes from the depth of integration: device origin as a first-class schema concept (not just metadata), pipeline status as a structured JSON with four tracked stages, AI review running server-side across all surfaces, vendor catalog with real dimensional data for validation, and eDoc generation with full provenance chain. A competitor would need to build the native desktop app (Tauri/Rust), the mobile app (Expo), the web dashboard, and the unified API with device-aware models — a multi-year engineering effort.

**Total: 32/40** — Exceeds CAM threshold (24).

## Related CAMs

- `EST-AUTO-0002` — NexPLAN AI-Assisted Selections (the AI analysis layer that powers design on any surface)
- `TECH-INTG-0001` — NexBRIDGE Modular Subscription (the desktop surface in the distributed pipeline)
- `OPS-VIS-0001` — Intelligent Feature Discovery (how admins learn about the distributed pipeline)
- `CLT-COLLAB-0001` — Client Tenant Tier Collaboration (selections shared with clients via Collaborator Technology)
- `FIN-VIS-0001` — Purchase Reconciliation (ordered selections flow into financial tracking)

## Expansion Opportunities

- **Real-time collaboration**: Multiple users editing the same planning room simultaneously with live cursors (WebSocket-based)
- **Push notifications on status change**: PM gets a mobile push when their selection is approved on web, or when a delivery is confirmed
- **Offline-first mobile**: Cache vendor catalog and pending selections locally; sync on reconnect with conflict resolution
- **NexBRIDGE ↔ Mobile handoff**: Deep link from NexBRIDGE desktop to the mobile app for "scan this room" capture flows
- **Pipeline analytics dashboard**: Company-level view of selection pipeline velocity — average time per stage, bottleneck identification, per-PM metrics
- **Vendor portal**: Vendors receive real-time visibility into ordered selections, can update delivery ETAs, reducing phone calls and email follow-ups
- **Photo-to-product matching**: PM photographs an existing installation; AI identifies the vendor/SKU from the image and creates a matching selection

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-08 | Initial draft — distributed pipeline architecture from NexPLAN mobile integration session |
