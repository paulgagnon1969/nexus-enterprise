# Executive Summary – Xactimate-Driven Schedule & Conflict Engine

## Purpose

The Xactimate-driven schedule engine converts estimate exports into an operational Gantt schedule that is realistic, auditable, and field-manageable. It bridges the gap between pricing (Xactimate) and production (crews, rooms, trades, dependencies), making it possible to manage jobs by day, by crew, and by constraint.

## What It Does

1. **Ingests Xactimate data**
   - Reads `RawXactRow` for a given `EstimateVersion`.
   - Uses the Golden Price List to derive **hours per unit** and **crew sizes**.
   - Aggregates lines into **work packages** by `room × trade × phase`.

2. **Calculates durations and work packages**
   - Computes total labor hours per package.
   - Derives `durationDays` based on hours, crew size, and standard hours/day.
   - Produces a room-ordered list of tasks (phases) across the job.

3. **Schedules work with real-world constraints**
   - Optional **mitigation window** (dry-out) at the front of the schedule.
   - Enforces **room sequencing** (e.g., demo → drywall → paint within a room).
   - Enforces **per-trade capacity** using a simple crew-lane model.
   - Uses a **workday calendar** (no weekends) for date math.

4. **Supports overrides and “locks”**
   - Per-task overrides keyed by synthetic ID (e.g. `wp-3`):
     - `durationDays` – adjust planned duration.
     - `startDate` – requested start date.
     - `lockType`:
       - `SOFT` (default): treat `startDate` as *earliest allowed*; scheduler may push it later.
       - `HARD`: keep `startDate` fixed and **do not** move it to resolve conflicts.

5. **Detects and explains conflicts**
   - For **soft locks**:
     - If a task is pushed later than its requested start, a **`START_DELAYED`** conflict is generated.
   - For **hard locks**:
     - If a task’s fixed start conflicts with:
       - room dependencies,
       - trade capacity, or
       - mitigation window,
       a **`HARD_START_CONSTRAINT`** conflict is generated.
   - Each conflict includes:
     - `type`: `START_DELAYED` | `HARD_START_CONSTRAINT`.
     - `reasons`: one or more of:
       - `ROOM_DEPENDENCY`
       - `TRADE_CAPACITY`
       - `MITIGATION`
       - `UNKNOWN`
     - `requestedStart` / `scheduledStart` dates.
     - A **human-readable `message`** (e.g. _“Kitchen · Drywall hard-locked on 2026-02-10 conflicts with schedule due to trade capacity”_).

6. **Provides daily rollups for dashboards**
   - `daily-summary` endpoint returns, for each day in a range:
     - All tasks active that day (by trade/room/phase).
     - Per-trade rollups showing:
       - task count,
       - total labor hours.
   - Enables crew calendars, capacity views, and daily production dashboards.

7. **Persists schedules and logs changes**
   - On commit:
     - Writes `ProjectScheduleTask` records for the current plan.
     - Compares against previous schedule and logs changes into `ProjectScheduleChangeLog`:
       - created vs updated tasks,
       - previous vs new start/end/duration,
       - which user performed the change.
   - This yields a complete **audit trail** of schedule evolution per estimate.

8. **Exposes configuration for trade capacity**
   - Trade capacity is configurable at:
     - company level, and
     - optional project override.
   - Scheduler reads these settings and uses them to limit concurrent tasks per trade.
   - Defaults are used when no explicit config exists.

## Key API Endpoints (Backend)

All routes are JWT-protected under `projects/:projectId/xact-schedule`:

1. **Preview / Commit**
   - `POST /estimate/:estimateVersionId/preview`
     - Input: `startDate`, `taskOverrides` (with `durationDays`, `startDate`, `lockType`).
     - Output: work packages, scheduled tasks, and `conflicts[]`.
   - `POST /estimate/:estimateVersionId/commit`
     - Same input, but **persists** the schedule and logs changes.
     - Output: `scheduledTasks`, `changes[]`, `conflicts[]`.

2. **Conflicts-Only Linting**
   - `POST /estimate/:estimateVersionId/conflicts`
     - Input: same as preview (start date + overrides).
     - Output: array of:
       - `conflict` (as above), and
       - `persistedTask` (current DB snapshot for that synthetic task, or `null`).
     - Used by the UI to “lint” proposed overrides/hard locks before commit.

3. **Conflict Metadata**
   - `GET /conflict-metadata`
     - Enumerates:
       - `types[]` (code, description, severity),
       - `reasons[]` (code, description).
     - Lets front-end render consistent labels and severity badges without duplicating logic.

4. **Daily Summary**
   - `GET /daily-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
     - Returns one object per day in the range:
       - `date`
       - `tasks[]` (tasks active on that day)
       - `tradeTotals[]` (per-trade task counts and total hours).

5. **Existing Schedule & History**
   - `GET /estimate/:estimateVersionId/tasks`
     - Current committed tasks for that estimate.
   - `GET /estimate/:estimateVersionId/history`
     - Change log entries with actor info.

6. **Trade Capacity Config**
   - `GET /trade-capacity`
   - `POST /trade-capacity`
     - Manage per-company and per-project `maxConcurrent` limits per trade.

## How It Rolls Out Safely

- **Additive, backward-compatible**:
  - New properties (`conflicts`) and endpoints are additive.
  - Existing consumers of preview/commit continue to work; they can ignore `conflicts` until the UI is ready.
- **Configuration-driven**:
  - Trade capacity and schedule overrides are driven by data; no hard-coded behavior in the app tier.
- **Strong observability**:
  - Conflicts are explicitly surfaced with machine-readable enums and human-readable messages.
  - Changes are logged in `ProjectScheduleChangeLog`.

## Value to the Business

- Moves Nexus from “static Gantt” to a **constraint-aware, explainable scheduler**.
- Gives operations leaders:
  - Visibility into where and why production is overbooked or blocked.
  - Confidence that field-driven changes (locks/overrides) are auditable and don’t silently corrupt the plan.
- Lays the foundation for:
  - Automated conflict resolution suggestions,
  - Capacity planning per region/company,
  - and tighter linkage between estimate quality and production risk.

## How We Test This Feature

### 1. Local / Dev API Testing

- **Golden path preview/commit**
  - Use a known estimate with realistic Xactimate data.
  - Call `POST /projects/:projectId/xact-schedule/estimate/:estimateVersionId/preview` with **no overrides** and verify:
    - Work packages and durations look reasonable.
    - `conflicts` is empty or contains only expected soft delays.
  - Call `POST /.../commit` with the same payload and verify:
    - `ProjectScheduleTask` rows are created/updated.
    - `ProjectScheduleChangeLog` rows capture the changes.

- **Soft lock scenarios**
  - Provide `taskOverrides` with `startDate` and default `lockType` (SOFT).
  - Confirm that when dependencies or capacity force a later start:
    - `conflicts[]` contains `type = START_DELAYED` with correct `reasons` and `message`.

- **Hard lock scenarios**
  - Provide `taskOverrides` with `startDate` and `lockType = HARD` that intentionally:
    - Overlaps a previous phase in the same room, and/or
    - Overbooks trade capacity.
  - Confirm:
    - The scheduled start stays on the requested date.
    - `conflicts[]` contains `type = HARD_START_CONSTRAINT` with the right `reasons`.

- **Conflicts-only linting**
  - Call `POST /.../conflicts` with overrides.
  - Verify each row includes:
    - `conflict` with enums + message.
    - `persistedTask` that matches current DB state (or `null` if new).

- **Daily summary**
  - Call `GET /.../daily-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` on a job with a committed schedule.
  - Spot-check that:
    - Tasks appear on the correct days.
    - `tradeTotals` roughly match expected hours and task counts.

### 2. Web UI Testing (Next.js)

- Wire a dev-only page (e.g. `apps/web` under `/dev/schedule-conflicts`) that uses:
  - `GET /conflict-metadata` to hydrate enums and descriptions.
  - `POST /.../conflicts` to preview conflicts as the user edits overrides/hard locks.
- Validate that for a few sandbox projects:
  - Conflicts appear and clear as expected when adjusting dates and lock types.
  - Messages and severity badges make sense to non-technical users.

### 3. Staging / Pre-Production

- Enable the feature against a staging environment with cloned production data.
- Run through:
  - A small water-mitigation job.
  - A multi-room rebuild job with several trades.
- Confirm with operations stakeholders that:
  - The resulting Gantt aligns with field expectations.
  - The conflict explanations match how they talk about capacity and constraints.
