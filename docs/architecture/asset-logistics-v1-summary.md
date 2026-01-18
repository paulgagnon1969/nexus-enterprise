# Asset Logistics v1 – Executive Summary

## Purpose

Asset Logistics v1 provides a unified way to answer a simple but critical question:

> “Who and what is where right now, and how did it get there?”

It does this by combining a shared location hierarchy, inventory and movement models, and two UX surfaces:

- A full operational view at `/locations`.
- A compact portfolio-level hub under the Financial **Asset Logistics** tab.

The goal is to make people, equipment, and materials visible as **logistics assets** that can be assigned, moved, and audited consistently across Nexus.

---

## Data model (backend)

Asset Logistics v1 builds on existing Prisma models in `@repo/database`:

- **Location**
  - Hierarchical: parent/child chain (site → building → floor → room, etc.).
  - Types include: `SITE`, `BUILDING`, `FLOOR`, `ROOM`, `WAREHOUSE`, `YARD`, `SUPPLIER`, `VENDOR`, `TRANSIT`, `LOGICAL`, etc.
  - Holds:
    - `currentAssets` – assets currently at this location.
    - `currentMaterialLots` – material lots at this location.
    - `currentParticles` / `virtualParticles` – small, generic “pieces” tied to parent entities.
    - `personLocations` – people assigned to this location.

- **People and assignments**
  - `PersonLocation` links `companyId + userId` to a `locationId`.
  - Represents the person’s **current** location (hotel room, job site, etc.).
  - Updated via “Assign people…” actions in the UI.

- **Inventory and movements**
  - `InventoryPosition`:
    - Keyed on `(companyId, itemType, itemId, locationId)`.
    - Tracks aggregate `quantity` and `totalCost` for an item at a location.
  - `InventoryMovement`:
    - Logs each movement with:
      - `itemType` and `itemId`.
      - `fromLocationId` / `toLocationId`.
      - `quantity`, `transportCost`, `internalLaborCost`.
      - `movedByUserId`, `movedAt`, `reason`, `note`.
  - A shared helper `moveInventoryWithCost` in `@repo/database`:
    - Applies costing semantics:
      - Derives unit cost from the source position.
      - Capitalizes **transport** cost into destination inventory.
      - Tracks **internal labor** cost for reporting only.
    - Updates both `InventoryPosition` and `InventoryMovement` transactionally.

---

## API layer

New NestJS endpoints in `apps/api` power the logistics flows:

- **Locations tree**
  - `GET /locations/roots`
  - `GET /locations/children/:locationId`

- **Person location**
  - `GET /locations/me/person-location`
    - Returns `{ locationId, location }` or nulls if none.

- **Holdings**
  - `GET /inventory/holdings/location/:locationId`
    - Returns a holdings DTO with:
      - `location`
      - `people[]`
      - `assets[]`
      - `materialLots[]`
      - `particles[]`
  - `GET /inventory/holdings/me`
    - Returns holdings for the current user’s assigned location.

- **Assign people**
  - `POST /locations/:locationId/assign-people`
    - Body: `{ userIds: string[] }`.
    - Upserts `PersonLocation` rows for each ID and returns updated holdings.

- **Move assets**
  - `POST /inventory/holdings/location/:locationId/move-asset`
    - Body: `{ assetId, reason?, note? }`.
    - Uses `moveInventoryWithCost` with `itemType = ASSET`, `quantity = 1`.
    - Updates `Asset.currentLocationId` and returns holdings for the destination.

- **Movement history**
  - `GET /inventory/holdings/location/:locationId/history`
    - Returns recent `InventoryMovement` rows where `fromLocationId` or `toLocationId` is the given location.
    - Used by both UI surfaces to render “Recent movements”.

A thin Next.js BFF layer in `apps/web/app/api/...` proxies these calls so the web app never talks directly to the API host.

---

## Frontend surfaces

### 1. `/locations` – Operational Logistics View

Route: `apps/web/app/locations/page.tsx`

Capabilities:

- **Location tree**
  - Lazy-loaded roots and children.
  - Each node shows:
    - Name and type.
    - Small stats badge after holdings are loaded:
      - e.g. `3 ppl · 5 assets · 2 lots`.

- **Holdings panel**
  - For the selected location:
    - People (assigned via `PersonLocation`).
    - Equipment & other assets.
    - Material lots.
    - Particles.
  - Includes:
    - “My holdings” button:
      - Uses `/inventory/holdings/me` to show what’s at the current user’s location.
    - Breadcrumb header:
      - `Holdings at Site / Building / Room`, or
      - `My holdings at Room 312`.

- **Move Assets**
  - In the “Equipment & Other Assets” section:
    - Each asset row has a **Move…** chip.
    - Clicking **Move…**:
      - Arms that asset (row highlight + move-mode banner).
      - Prompts the user to click a destination in the tree.
    - Clicking a destination node:
      - Calls `POST /inventory/holdings/location/:id/move-asset`.
      - Updates holdings for the destination.
      - Clears move mode.

- **Recent movements card**
  - Right-hand side card titled **Recent movements**:
    - Shows in/out movements and timestamps for the selected location.
    - Gives quick context on what has been moving in or out recently.

---

### 2. Financial → Asset Logistics – Portfolio View

Route: `apps/web/app/financial/page.tsx` (tab: `ASSET_LOGISTICS`)

This is a higher-level, Financial-anchored view of logistics:

- **Compact location tree**
  - Same data as `/locations`, but embedded in a smaller left-hand pane.
  - Nodes are clickable for:
    - Loading holdings.
    - Completing move-mode flows (see below).

- **Holdings summary**
  - Right-hand panel shows the same four buckets:
    - People
    - Equipment & Other Assets
    - Material Lots
    - Particles
  - For the selected location.

- **Assign People flow**
  - **Assign people…** button at the top of the holdings panel:
    - Opens an inline people picker.
    - Pre-selects any users already present in holdings.
    - Lazily loads company members via `/api/company/members`.
  - People picker:
    - Search box (name/email) with total count.
    - Checkboxes per member.
    - **Save** calls `POST /locations/:id/assign-people`.
    - Updated holdings are reflected immediately in the panel.

- **Move Assets flow**
  - In “Equipment & Other Assets”:
    - Each row has a **Move…** chip that arms the asset for move.
  - While move-mode is active:
    - A green banner above holdings:
      - Names the selected asset.
      - Includes a **Cancel move** button.
    - Clicking a node in the left tree:
      - Calls `POST /inventory/holdings/location/:id/move-asset`.
      - Updates holdings for the destination.
      - Clears move-mode.

- **Recent movements card**
  - Similar to `/locations`:
    - Shows the latest inventory movements for the selected location.
    - Includes a **“View full history in Locations”** link to `/locations` for deeper investigation.

---

## Shared DTOs

To avoid frontend/backend drift, v1 introduces shared DTO definitions in `@repo/types`:

- `LocationDto`
- `LocationHoldingsDto`
- `LocationMovementDto`

The web app’s locations client now consumes these types directly, and the Nest API is structured to match them. This provides a stable contract for both current and future logistics surfaces (e.g., mobile, admin, or reporting).

---

## Known limitations and V2 ideas

V1 deliberately focuses on core flows and leaves several enhancements for future iterations:

1. **Stronger capacity modeling**
   - Today, capacity is an optional convention via `Location.metadata.capacityPeople`.
   - V2 could:
     - Add explicit capacity fields in the schema.
     - Enforce or warn on over-capacity at assignment/move time.

2. **Automated tests**
   - `moveInventoryWithCost` and the new logistics endpoints are well-structured but not yet covered by automated tests.
   - V2 should introduce:
     - Unit tests around costing and quantity semantics.
     - API tests for assign-people and move-asset endpoints.

3. **Schedule / crew integration**
   - Asset Logistics is currently independent of scheduling.
   - Future versions can:
     - Tie crew assignments and timecards into locations.
     - Use movements/history as context for planning and forecasting.

4. **Richer analytics**
   - Movement history is exposed as a simple recent list.
   - Over time, this can evolve into:
     - Location utilization dashboards.
     - Asset time-at-site metrics.
     - Lead-time and logistics performance insights.

---

## Summary

Asset Logistics v1 establishes a coherent, audit-friendly foundation for tracking the **where** of people, equipment, and materials across Nexus. It unifies backend models, API contracts, and two UX surfaces to make movements both easy to perform and easy to understand, while leaving room for deeper scheduling and analytics capabilities in V2 and beyond.
