---
title: "Daily Log ID (DLID) — Tenant-Scoped Sequence Numbers"
module: daily-log-dlid
revision: "1.0"
tags: [sop, daily-log, dlid, sequence-number, operations, field, admin, all-users]
status: draft
created: 2026-03-12
updated: 2026-03-12
author: Warp
visibility:
  public: false
  internal: true
  roles: [all]
---

# Daily Log ID (DLID)

## Purpose
Every daily log in Nexus is assigned a **DLID** — a short, human-readable sequence number that makes it easy to reference specific logs in conversation, reports, and coordination. The format is `YY.N` (e.g., `26.1`, `26.542`), where `YY` is the two-digit year and `N` is an auto-incrementing integer that resets each calendar year.

DLIDs are **tenant-scoped**: each company starts its own sequence at `1` each year, so Company A and Company B each have their own `26.1`, `26.2`, etc.

## Who Uses This
- **Field crews** — reference a specific log by number ("see DLID 26.47")
- **Project managers** — cite logs in reports, emails, and meetings
- **Admin / Accounting** — cross-reference receipt logs and expense documentation
- **All authenticated users** — DLIDs are visible everywhere daily logs appear

## How DLIDs Work

### Format
```
YY.N
```
- `YY` — Two-digit year derived from the server clock at creation time (2026 → `26`)
- `N` — Integer starting at 1, incrementing per tenant per year, with no leading zeros

**Examples:** `26.1`, `26.15`, `26.540`, `27.1` (first log of 2027)

### Assignment Rules
1. DLIDs are assigned **automatically** when a daily log is created — no user action required.
2. The sequence is scoped to the **company (tenant)**, not the project. All projects under the same company share one counter.
3. The counter **resets to 1** at the start of each calendar year.
4. DLIDs are **immutable** — once assigned, a log's DLID never changes, even if the log is moved to a different project.
5. The sequence is **gap-free at creation time**, but gaps may appear if logs are deleted.
6. A database unique constraint `(companyId, sequenceYear, sequenceNo)` prevents duplicate DLIDs.

### SUPER_ADMIN Behavior
When a SUPER_ADMIN creates a log on a project, the DLID is assigned based on the **project's owning company**, not the admin's own company. This ensures the sequence stays consistent for the tenant.

## Where DLIDs Appear

### Web (`apps/web`)
- **Daily Logs table** — "DLID" column (indigo monospace text, between Actions and Date columns)
- **Daily Log view/edit modal** — Badge next to "Daily Log Details" header showing `#26.N`

### Mobile (`apps/mobile`)
- **Project daily logs list** — DLID shown before the title on each log card
- **Daily log feed** (cross-project) — DLID shown in the card header before the date
- **Daily log detail screen** — DLID shown as `#26.N` between date and title

### API Responses
The `dlid` field (string, e.g. `"26.1"`) is returned in:
- `GET /projects/:id/daily-logs` (list for project)
- `GET /daily-logs/feed` (cross-project feed)
- `GET /daily-logs/:id` (single log detail)
- `POST /projects/:id/daily-logs` (create response)

## Technical Implementation

### Schema
Three fields on the `DailyLog` model (`packages/database/prisma/schema.prisma`):
- `companyId` (String?) — FK to `Company`, set from `Project.companyId` at creation
- `sequenceNo` (Int?) — The `N` in `YY.N`
- `sequenceYear` (Int?) — The `YY` in `YY.N`

Indexes:
- Unique: `@@unique([companyId, sequenceYear, sequenceNo])` — prevents duplicate DLIDs
- Composite: `@@index([companyId, sequenceYear])` — fast max-lookup for next sequence

### Service Logic (`apps/api/src/modules/daily-log/daily-log.service.ts`)
- `assignSequenceNo(projectCompanyId)` — Queries `MAX(sequenceNo)` for the company+year, returns `max + 1`. The unique index acts as a safety net against race conditions.
- `formatDlid(sequenceYear, sequenceNo)` — Returns `"YY.N"` string, or `null` if fields are unset.

### Migration
- `20260312185746_add_daily_log_sequence_no` — Adds the three nullable columns and the unique/composite indexes.

### Backfill
All pre-existing logs were backfilled:
1. `companyId` populated from `Project.companyId` via join
2. `sequenceYear` set to `EXTRACT(YEAR FROM createdAt) % 100`
3. `sequenceNo` assigned via `ROW_NUMBER() OVER (PARTITION BY companyId, year ORDER BY createdAt)`

## Workflow

### Creating a Daily Log (User Perspective)
1. User creates a daily log (web or mobile) — no DLID input required
2. System automatically assigns the next DLID for the tenant
3. DLID appears immediately in the creation response and all list views
4. User can reference the log by DLID in conversations, emails, or reports

### Referencing a Log
- Verbal: "Check DLID 26.47 for the safety incident notes"
- Written: "Per log #26.47, crew reported water intrusion on the 3rd floor"
- Search: (future) DLID search capability planned for web and mobile

### Year Rollover
- On January 1, the year portion increments (`26` → `27`) and the counter resets to `1`
- Previous year's DLIDs remain unchanged
- Both `26.540` and `27.1` can coexist for the same tenant

## Key Features
- **Zero user friction** — fully automatic, no input required
- **Tenant isolation** — each company has its own sequence
- **Yearly reset** — keeps numbers short and manageable
- **Race-condition safe** — unique DB constraint prevents duplicates
- **Cross-platform** — visible on web, mobile, and API responses

## Related Modules
- [Daily Logs](daily-log-sop.md) — Core daily log creation and management
- [Receipt/Expense Logs](receipt-expense-sop.md) — Receipt logs also receive DLIDs
- [Field PETL](field-petl-sop.md) — PETL-linked logs receive DLIDs like any other log

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-12 | Initial release — DLID system with tenant-scoped yearly sequences, backfill of existing logs, web + mobile UI, API integration. |
