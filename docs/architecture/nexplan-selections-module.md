# NexPLAN — Selections & Planning Module Architecture

## Overview

NexPLAN is the AI-assisted selections and planning module within NCC. It turns the manual process of choosing finishes, fixtures, and materials (cabinets, flooring, countertops, appliances, plumbing fixtures) into a repeatable, AI-driven workflow that produces professional Selection Sheets in minutes instead of hours.

**Origin:** The module was conceived after a live session where AI analyzed a floor plan image, discussed layout constraints in natural language, fit vendor products to the space using real catalog dimensions, and output an SVG floor plan + product gallery + vendor quote CSV — all as a self-contained HTML eDoc. NexPLAN productizes that workflow.

## Where It Lives

### Frontend — Inside the Plans Tab

NexPLAN does **not** get its own top-level tab. It lives inside the existing **PLANS** tab on the project detail page (`apps/web/app/projects/[id]/page.tsx`).

**Current state:**
- The PLANS tab renders `PlanSheetsTab` (`plan-sheets-tab.tsx`), which manages PDF plan sheet uploads, processing, and viewing.

**Target state:**
- The PLANS tab renders a new wrapper component `PlansTab` with a sub-navigation strip:
  - **Plan Sheets** — the existing `PlanSheetsTab` functionality, extracted into `PlanSheetsSection`
  - **Selections** — the new NexPLAN module, rendered by `SelectionsSection`
- The sub-nav uses the same INP-safe pattern as other tabs in the project detail page (`setSubTab` wrapped in `startUiTransition`).

**File structure:**
```
apps/web/app/projects/[id]/
├── plans-tab.tsx             # NEW — wrapper with sub-nav
├── plan-sheets-tab.tsx       # EXISTING — renamed to plan-sheets-section.tsx
├── plan-sheet-viewer.tsx     # EXISTING — unchanged
├── selections-section.tsx    # NEW — selections landing (room list + selection board)
├── planning-room.tsx         # NEW — chat interface for a single room
├── selection-sheet-viewer.tsx # NEW — renders generated HTML eDoc inline
└── vendor-catalog-picker.tsx # NEW — product picker from vendor catalog
```

### API — NestJS Module

New module at `apps/api/src/selections/` following existing NestJS patterns:

```
apps/api/src/selections/
├── selections.module.ts
├── selections.controller.ts    # REST endpoints
├── selections.service.ts       # Business logic
├── planning-room.service.ts    # AI chat + artifact generation
├── vendor-catalog.service.ts   # Catalog CRUD + product search
├── selection-sheet.service.ts  # HTML eDoc + CSV generation
└── dto/
    ├── create-room.dto.ts
    ├── create-selection.dto.ts
    └── generate-sheet.dto.ts
```

### Database — Prisma Models

New models in `packages/database/prisma/schema.prisma`:

**PlanningRoom** — a named planning context within a project (e.g., "Kitchen", "Master Bath")
- `id`, `projectId`, `name`, `description`, `floorPlanUrl`, `status` (active/archived), `createdAt`, `updatedAt`
- Has many `PlanningMessage`, has many `Selection`

**PlanningMessage** — a single message in the Planning Room conversation
- `id`, `roomId`, `role` (user/assistant/system), `content` (markdown), `artifacts` (JSON array — paths to SVG, HTML, CSV outputs), `createdAt`

**VendorCatalog** — a vendor product line
- `id`, `vendorName`, `productLine`, `vendorUrl`, `isActive`, `createdAt`
- Has many `VendorProduct`

**VendorProduct** — a single SKU from a vendor catalog
- `id`, `catalogId`, `sku`, `name`, `category` (enum: BASE, WALL, CORNER, VANITY, ACCESSORY, TRIM, APPLIANCE)
- `width`, `height`, `depth` (inches, decimal)
- `imageUrl`, `productPageUrl`, `price`, `priceDiscounted`
- `metadata` (JSON — door style, finish, features, notes)

**Selection** — a product placement within a room
- `id`, `roomId`, `projectId`, `vendorProductId`, `position` (integer, 1-based), `quantity`
- `status` (enum: PROPOSED, APPROVED, ORDERED, DELIVERED, INSTALLED)
- `notes`, `customizations` (JSON)

**SelectionSheet** — a generated output document
- `id`, `roomId`, `projectId`, `htmlContent`, `csvContent`, `version`, `generatedAt`
- `documentId` (FK to Nexus Document for eDoc integration)

## Core Workflows

### 1. Quick Selection (No AI — Phase 1)

PM manually picks products from the vendor catalog for each position in a room:

```
PM opens Plans tab → Selections sub-tab → "New Room"
  → Names room ("Kitchen"), optionally uploads floor plan image
  → Opens vendor catalog picker
  → Selects products for each position (e.g., Position 1 = Base End Corner 36")
  → Clicks "Generate Sheet"
  → System produces HTML eDoc (SVG plan + product gallery + pricing)
  → eDoc auto-imports into Nexus Documents under the project
```

### 2. AI-Assisted Planning (Phase 2)

PM uploads a floor plan and discusses the layout with the AI:

```
PM opens Plans tab → Selections sub-tab → "New Room"
  → Uploads floor plan image
  → AI extracts dimensions and room geometry (OpenAI Vision)
  → PM describes constraints: "peninsula off cabinet #3", "fridge at the end"
  → AI proposes layout as structured JSON (position → product mapping)
  → PM reviews, adjusts via conversation
  → PM clicks "Generate Plan" → SVG floor plan + eDoc rendered inline
  → PM approves → Selection Sheet saved, eDoc created in Nexus Documents
```

### 3. Selection Board (Phase 4)

Project-level overview of all selections across all rooms:

```
PM opens Plans tab → Selections sub-tab → "Selection Board"
  → Table/kanban: Room × Position × Product × Status
  → Filter by status (proposed/approved/ordered/installed)
  → Budget tracker: running total vs allowance
  → Export: combined project selection package (all rooms, PDF + CSV)
```

## API Endpoints

### Rooms
- `GET /projects/:projectId/planning-rooms` — list rooms
- `POST /projects/:projectId/planning-rooms` — create room
- `GET /projects/:projectId/planning-rooms/:roomId` — room detail with messages
- `PATCH /projects/:projectId/planning-rooms/:roomId` — update room
- `DELETE /projects/:projectId/planning-rooms/:roomId` — archive room

### Messages (Planning Room Chat)
- `POST /projects/:projectId/planning-rooms/:roomId/messages` — send message (user or trigger AI)
- `GET /projects/:projectId/planning-rooms/:roomId/messages` — list messages

### Selections
- `GET /projects/:projectId/selections` — all selections for project (Selection Board)
- `POST /projects/:projectId/planning-rooms/:roomId/selections` — add selection to room
- `PATCH /projects/:projectId/selections/:selectionId` — update status/notes
- `DELETE /projects/:projectId/selections/:selectionId` — remove selection

### Selection Sheets
- `POST /projects/:projectId/planning-rooms/:roomId/generate-sheet` — generate HTML eDoc + CSV
- `GET /projects/:projectId/selection-sheets` — list all sheets for project
- `GET /projects/:projectId/selection-sheets/:sheetId` — get sheet HTML

### Vendor Catalog
- `GET /vendor-catalogs` — list catalogs
- `GET /vendor-catalogs/:catalogId/products` — list products (filterable by category)
- `GET /vendor-catalogs/:catalogId/products/:productId` — product detail

## INP / Performance Considerations

The project detail page is ~36K lines with 4 `useTransition` hooks. Adding NexPLAN content within the Plans tab must follow the INP contract:

- The `SelectionsSection` component must lazy-load (`React.lazy` or dynamic import) to avoid increasing the initial bundle of the Plans tab.
- Sub-tab switches between "Plan Sheets" and "Selections" must wrap `setSubTab` in `startUiTransition`.
- The Planning Room chat should virtualize long message lists.
- Selection Sheet HTML rendering should use an `<iframe>` or `dangerouslySetInnerHTML` within a memoized component to avoid re-renders of the parent.

## Seed Data

Initial vendor catalog: **BWC Dorian Gray Shaker** — seeded from the products used in the kitchen/bath layout session. Seed script at `packages/database/src/seeds/vendor-bwc-dorian-gray.ts`.

Products include:
- Base cabinets (12"-42" widths, single door, double door, drawer)
- Wall cabinets (30"H, 36"H, 42"H)
- Corner cabinets (blind corner, end corner, lazy susan)
- Vanity sink base combos (24", 30", 36")
- Accessories (spice rack, trash pull-out, filler strips, crown molding)

## Implementation Phases

### Phase 1 — Vendor Catalog + Selection Sheet Generator (1-2 weeks)
- Prisma models: VendorCatalog, VendorProduct, Selection, SelectionSheet
- Seed BWC catalog
- API: CRUD for selections, sheet generation endpoint
- Frontend: Plans tab sub-nav, basic product picker, sheet preview

### Phase 2 — Planning Room MVP (2-3 weeks)
- Prisma models: PlanningRoom, PlanningMessage
- API: room CRUD, message endpoint with OpenAI Vision integration
- Frontend: chat interface, floor plan upload, "Generate Plan" button
- NexPLAN Viewer renders output inline

### Phase 3 — Interactive Floor Plan (2-3 weeks)
- SVG becomes interactive (drag positions, swap products)
- Real-time dimension validation
- Auto-regenerate eDoc on changes

### Phase 4 — Multi-Vendor & Selection Board (2-3 weeks)
- Additional vendor catalogs
- Selection Board UI (table/kanban across all rooms)
- Budget tracking and approval workflow
- Combined project export

## Related Systems

- **BOM Pricing Pipeline** (EST-INTG-0001) — vendor pricing data from BOM searches could feed into selection cost estimates
- **Nexus Documents / eDoc Viewer** — Selection Sheets are eDocs that auto-import into the document system
- **Receipt OCR** — uses the same OpenAI integration that powers Planning Room AI
- **Plan Sheets** — co-located in the same Plans tab; construction plan sheets provide the floor plan context for selections
