---
title: "TUCKS Analytics Platform SOP"
module: tucks-analytics
revision: "1.0"
tags: [sop, analytics, tucks, kpi, telemetry, admin, operations]
status: draft
created: 2026-02-28
updated: 2026-02-28
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# TUCKS — Telemetry Usage Chart KPI System

## Purpose
TUCKS is the analytics and telemetry platform for Nexus. It tracks user activity, module engagement, workforce efficiency, and operational KPIs across all tenants. It powers:
- The NEXUS SYSTEM admin analytics dashboard (cross-tenant)
- Tenant-level management analytics
- Personal KPI dashboards for individual users
- Gaming detection and data quality scoring
- Workforce efficiency benchmarking (crew/trade comparisons)

## Who Uses This
- **SUPER_ADMIN / NEXUS SYSTEM**: Full cross-tenant analytics, all dashboards
- **Tenant ADMIN / OWNER**: Company-scoped analytics, user engagement, efficiency reports
- **Project Managers**: Project-scoped workforce efficiency, daily log quality, crew comparisons
- **Individual Users**: Personal KPI dashboard with anonymous aggregate benchmarking

---

## Architecture

### Data Flow
```
User Action → API Middleware (lightweight) → Redis LPUSH (1ms)
                                                  ↓
                                    Flush Worker (every 30s)
                                                  ↓
                                    UserActivityEvent table (Postgres)
                                                  ↓ (cron: nightly)
                        ┌───────────────────────────────┐
                        │     Rollup Aggregation Job     │
                        └───────────────────────────────┘
                           ↓                         ↓
                  ActivityDailyRollup         ActivityWeeklyRollup
                     (Postgres)                  (Postgres)
                                                  ↓ (cron: every 2 weeks)
                                    ┌─────────────────────────┐
                                    │  Activity Vault Archive  │
                                    │  (GCS, encrypted, cold)  │
                                    └─────────────────────────┘
```

### Storage Tiers

1. **Live Raw Events (Postgres)** — 2-week rolling window
   - `UserActivityEvent` table with TTL enforcement
   - Supports ad-hoc debugging and real-time queries
   - Cron purges events older than 14 days after archival

2. **Rollup Tables (Postgres)** — Permanent
   - `ActivityDailyRollup`: per-user, per-module, per-eventType, per-day counts
   - `ActivityWeeklyRollup`: same dimensions, weekly aggregation
   - These power all dashboard queries (fast reads on small tables)

3. **Activity Vault (GCS)** — Encrypted archive, permanent
   - Raw events exported as compressed, encrypted blobs before purge
   - GCS Coldline for data < 1 year, Archive class for older data
   - Lifecycle policy auto-transitions storage classes
   - Retrieval: rare, on-demand for forensic investigation or backfill

### Storage Budget (Annual)

| Users   | Live (PG)  | Vault (GCS) | Rollups (PG) | Total/Year |
|---------|-----------|-------------|-------------|-----------|
| 1,000   | 140 MB    | 0.8 GB      | 650 MB      | ~1.6 GB   |
| 2,000   | 280 MB    | 1.6 GB      | 1.3 GB      | ~3.2 GB   |
| 5,000   | 700 MB    | 3.9 GB      | 3.3 GB      | ~7.9 GB   |
| 10,000  | 1.4 GB    | 7.8 GB      | 6.5 GB      | ~15.7 GB  |
| 100,000 | 14 GB     | 78 GB       | 65 GB       | ~157 GB   |

### Cost Budget (Annual, GCP)

| Users   | Cloud SQL  | GCS Vault | Total/Year |
|---------|-----------|----------|-----------|
| 1,000   | ~$16      | ~$0.04   | ~$16      |
| 5,000   | ~$82      | ~$0.19   | ~$82      |
| 10,000  | ~$161     | ~$0.37   | ~$161     |
| 100,000 | ~$1,613   | ~$3.74   | ~$1,617   |

---

## Schema

### UserActivityEvent (Live, 2-week window)
```
id            String    @id @default(cuid())
companyId     String
userId        String
eventType     String    // LOGIN, MODULE_OPEN, RECORD_CREATE, RECORD_UPDATE, etc.
module        String    // projects, financial, daily_logs, messaging, timecards, etc.
entityId      String?   // ID of the affected record (optional)
metadata      Json?     // Additional context (page path, entity type, etc.)
createdAt     DateTime  @default(now())

@@index([companyId, createdAt])
@@index([userId, createdAt])
@@index([module, eventType, createdAt])
```

### ActivityDailyRollup (Permanent)
```
id            String    @id @default(cuid())
companyId     String
userId        String
date          DateTime  // truncated to day
module        String
eventType     String
eventCount    Int
metadata      Json?     // aggregated metadata (e.g., avg content length)

@@unique([companyId, userId, date, module, eventType])
@@index([companyId, date])
@@index([userId, date])
```

### ActivityWeeklyRollup (Permanent)
```
id            String    @id @default(cuid())
companyId     String
userId        String
weekStart     DateTime  // Monday of the week
module        String
eventType     String
eventCount    Int

@@unique([companyId, userId, weekStart, module, eventType])
@@index([companyId, weekStart])
```

---

## Personal KPI Dashboard

Every user sees a personal dashboard on login showing their activity benchmarked against the **anonymous aggregate** for their company and role.

### What the User Sees
- "Your daily logs this month: **12** — Company average: **8.4**" (with green/amber/red indicator)
- "Your task completion rate: **87%** — Company average: **72%**"
- Sparkline charts showing their trend over 30/60/90 days
- Module usage breakdown (which tools they use most)

### Anonymous Benchmarking Rules
- Users NEVER see other individuals' names or data
- Comparisons are always "You vs. aggregate" (company mean, or role-specific mean)
- Percentile ranking is shown as "You're in the top 20% for daily log completeness"
- Management sees per-user breakdowns; individuals only see their own position

---

## Workforce Efficiency Analytics

### Crew/Trade Comparison
TUCKS correlates activity data with project task data to compute efficiency metrics:
- **Manpower efficiency**: Expected labor hours for a task (from estimate) vs. actual hours logged
- **Completion velocity**: Rooms completed per crew per day/week
- **Trade benchmarking**: "Drywall Team A completes rooms at 1.2x the rate of Team B"
- **Cost efficiency**: Actual cost per room vs. estimated cost per room

### Data Sources
- `DailyTimeEntry` → actual hours by worker/crew
- `ProjectParticle` (rooms) + `percentComplete` → completion tracking
- `SowItem` / PETL → estimated labor for comparison
- `DailyLog` → work performed narrative, crew on site

---

## Gaming Detection System

### Purpose
Detect and flag users who artificially inflate activity metrics (e.g., filing 5 daily logs when 1 would suffice).

### Detection Signals

| Signal | Method | Weight |
|--------|--------|--------|
| **Volume anomaly** | User's daily log count > mean + 2σ for that project/day | 30% |
| **Temporal burst** | Multiple logs from same user within 10 minutes | 25% |
| **Content entropy** | Log body < 50 chars, no photos, generic text | 20% |
| **Duplicate similarity** | Jaccard similarity > 0.7 between logs from same user/day | 15% |
| **Effort-to-output ratio** | Logs per task vs. expected logs per task type | 10% |

### Scoring
Each signal produces a score from 0.0 to 1.0. Weighted composite score is computed:

```
gamingScore = (volume × 0.30) + (burst × 0.25) + (entropy × 0.20)
            + (similarity × 0.15) + (ratio × 0.10)
```

### Thresholds
- **< 0.4**: Normal — no action
- **0.4–0.6**: Amber — visible to management in analytics dashboard, no user-facing impact
- **> 0.6**: Red — flagged for management review, log batch marked as "quality review pending"

### Management Review Workflow
1. Flagged logs appear in a "Quality Review" queue (visible to PM+ roles)
2. Manager can: **Dismiss** (false positive), **Confirm** (gaming), or **Coach** (send feedback to user)
3. Confirmed gaming flags affect the user's "Data Quality Score" (visible in personal KPI dashboard as a general score, not as "gaming detected")
4. Repeat offenders trigger an automated notification to the user's manager

### Anti-Gaming Without Punishing Productivity
- The system does NOT penalize users who legitimately file many logs (e.g., multi-building projects)
- Context matters: 5 logs across 5 different buildings on the same day = normal
- The `entityId` and `metadata` fields differentiate distinct work contexts from duplicated effort
- Thresholds are calibrated per company and can be adjusted by tenant admins

---

## Implementation Phases

### Phase 1 — Live KPIs from Existing Data (No schema changes)
- Replace dummy KPIs on `/system` dashboard with real aggregate queries
- Query `DailyLog`, `ProjectInvoice`, `DailyTimecard`, `Task`, `Message` counts
- Add time-range selector (7d, 30d, 90d)
- Add user leaderboard (top contributors by module)

### Phase 2 — Event Tracking + Activity Vault
- Add `UserActivityEvent` model to Prisma schema
- Add API middleware to push events to Redis
- Add BullMQ flush worker (Redis → Postgres, every 30s)
- Add nightly rollup cron (raw → daily/weekly rollups)
- Add bi-weekly archive cron (raw → GCS encrypted vault)
- Add 14-day purge cron (delete archived raw events from Postgres)
- Add `/admin/analytics/*` API endpoints

### Phase 3 — Personal KPI Dashboard
- Add personal dashboard component (visible after login)
- Implement anonymous benchmarking queries
- Add sparkline charts (recharts or lightweight lib)
- Add module usage breakdown per user

### Phase 4 — Workforce Efficiency + Gaming Detection
- Build efficiency correlation engine (timecard hours vs. estimate vs. completion)
- Implement gaming detection scoring pipeline
- Add management "Quality Review" queue UI
- Add crew/trade comparison reports
- Add NEXUS SYSTEM cross-tenant efficiency benchmarking

### Phase 5 — Full Reporting Dashboard
- Dedicated `/system/analytics` page with time-series charts
- Drill-down capability (module → users → events)
- Exportable reports (CSV/PDF)
- Tenant-scoped analytics page for company admins
- GCS vault retrieval UI for forensic queries

---

## API Endpoints

### NEXUS SYSTEM (SUPER_ADMIN only)
- `GET /admin/analytics/overview` — cross-tenant KPI summary
- `GET /admin/analytics/module-usage?period=30d` — module usage across all tenants
- `GET /admin/analytics/user-activity?companyId=&period=` — per-tenant user engagement
- `GET /admin/analytics/efficiency?companyId=&projectId=` — workforce efficiency metrics
- `GET /admin/analytics/gaming-flags?companyId=` — gaming detection queue

### Tenant Admin (ADMIN+ role)
- `GET /analytics/overview` — company-scoped KPI summary
- `GET /analytics/module-usage?period=` — module usage for this company
- `GET /analytics/users?period=` — user engagement rankings
- `GET /analytics/efficiency?projectId=` — project workforce efficiency
- `GET /analytics/gaming-review` — quality review queue

### Individual User
- `GET /analytics/me?period=` — personal KPI dashboard data
- `GET /analytics/me/benchmark` — anonymous benchmarking (percentile vs. aggregate)

---

## Security & Privacy

- Raw event data is encrypted at rest (Cloud SQL default + GCS CMEK)
- Activity Vault uses customer-managed encryption keys (Cloud KMS)
- Personal KPI data is scoped to the authenticated user only
- Anonymous benchmarking never leaks individual identities
- Gaming flags are visible only to PM+ roles; the flagged user sees a generic "Data Quality Score"
- GDPR/privacy: event data can be purged per-user on account deletion (cascade from userId)

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-28 | Initial release — architecture, storage budget, gaming detection, phased implementation |
