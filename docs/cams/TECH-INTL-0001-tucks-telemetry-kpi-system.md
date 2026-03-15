---
cam_id: TECH-INTL-0001
title: "TUCKS — Telemetry Usage Chart KPI System with Gaming Detection"
mode: TECH
category: INTL
revision: "2.1"
status: draft
created: 2026-02-28
updated: 2026-03-04
author: Warp
tags: [cam, technology, intelligence, telemetry, kpi, analytics, gaming-detection, workforce, efficiency, tucks]
scores:
  uniqueness: 9
  value: 9
  demonstrable: 8
  defensible: 7
  total: 83
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# TECH-INTL-0001: TUCKS — Telemetry Usage Chart KPI System

> *Is your team using the tool? Is the tool making them better? Now you know.*

## Work ↔ Signal
> **The Work**: Full telemetry tracking every meaningful action. Workforce efficiency KPIs, personal dashboards with anonymous benchmarking, and gaming detection.
> **The Signal**: Usage telemetry IS the intent signal layer — every tracked action feeds the marketplace's understanding of who uses the platform effectively and who doesn't. (→ Reputation: operational engagement)

## Elevator Pitch
TUCKS is a full telemetry and analytics platform that tracks every meaningful user action, computes workforce efficiency metrics, provides personal KPI dashboards with anonymous benchmarking, and detects users who game the system. No competing construction PM offers integrated gaming detection, individual benchmarking, or crew-level efficiency correlation.

## What It Is
A full telemetry and analytics platform built into Nexus that tracks every meaningful user action, computes workforce efficiency metrics, provides personal KPI dashboards with anonymous benchmarking, and automatically detects users who "game" the system by inflating activity counts. Includes a three-tier storage architecture (live → rollup → encrypted vault) designed to scale from 1K to 100K users at under $1,700/year in infrastructure cost.

## Why It Matters
Construction software adoption is notoriously low — companies buy tools that field crews never use. Most platforms have zero visibility into who is actually using the product and whether usage translates to productivity. TUCKS gives owners and PMs a live pulse on:
- **Who is using the platform** and which modules get the most engagement
- **Which crews are more efficient** — correlating timecard hours against room completion rates and estimates
- **Whether the data is trustworthy** — gaming detection flags users who inflate metrics, ensuring analytics reflect real work
- **How individuals compare** — personal KPI dashboards motivate adoption without public shaming (anonymous aggregate comparison)

No competing construction PM platform offers integrated gaming detection or anonymous individual benchmarking against workforce aggregates.

## Competitive Advantage

### Personal KPI Dashboards with Anonymous Benchmarking
Every user sees their own performance relative to the company average without seeing anyone else's data. "You filed 12 daily logs this month — company average is 8.4. You're in the top 20%." This drives organic adoption: users compete with an invisible benchmark, not with named colleagues. The psychology is gym-leaderboard motivation without the toxicity of public rankings.

### Gaming Detection Engine
A weighted 5-signal scoring system (volume anomaly, temporal burst, content entropy, duplicate similarity, effort-to-output ratio) that flags suspicious activity patterns. A user who files 5 nearly-identical daily logs in 10 minutes gets flagged for management review. The user never sees "gaming detected" — they see a "Data Quality Score" that subtly incentivizes quality over quantity. Management sees a review queue with dismiss/confirm/coach actions.

### Workforce Efficiency Correlation
TUCKS doesn't just track app usage — it correlates timecard hours, room completion percentages, and estimate data to compute which drywall team / trade / crew is most efficient. "Team A completes rooms at 1.2x the rate of Team B with 15% lower labor cost." This turns Nexus from a record-keeping tool into a workforce intelligence platform.

### Activity Vault Architecture
Raw telemetry lives in Postgres for 2 weeks (for debugging and real-time queries), rolls into permanent daily/weekly aggregation tables, then archives to GCS encrypted cold storage. The vault grows at ~0.8 GB/year per 1,000 users at $0.04/year in storage cost. The architecture supports forensic retrieval without burdening the production database.

## Demo Script
1. **Admin Dashboard**: Open NEXUS SYSTEM → show live KPIs replacing dummy data. Toggle time ranges (7d/30d/90d). Show module usage chart — "Daily Logs" is the most-used module, "Financial" is growing 20% month-over-month.
2. **User Leaderboard**: Drill into a tenant → show top 5 users by activity. Click a user → see their module breakdown and trend sparkline.
3. **Personal Dashboard**: Log in as a field worker → show "Your KPIs" card. "Your daily logs: 12 — Company avg: 8.4 — Top 20%." Show sparkline trending up.
4. **Efficiency Report**: Open a project → Workforce Efficiency tab. Show crew comparison: "Drywall Team A: 1.2 rooms/day, $420/room. Drywall Team B: 0.8 rooms/day, $580/room."
5. **Gaming Detection**: Show a flagged user who filed 5 logs in 8 minutes with >70% content similarity. Open the Quality Review queue → Dismiss / Confirm / Coach buttons. Show the user's "Data Quality Score" in their personal dashboard (no mention of "gaming").

## Technical Foundation
- **Event ingestion**: API middleware → Redis LPUSH (1ms latency) → BullMQ flush worker → Postgres
- **Rollup pipeline**: Nightly cron aggregates raw events into `ActivityDailyRollup` and `ActivityWeeklyRollup`
- **Archive pipeline**: Bi-weekly cron exports raw events to GCS (compressed, CMEK-encrypted), then purges from Postgres
- **Gaming scorer**: Runs as part of the nightly rollup job. Computes weighted composite score per user per day. Flags stored in a `GamingFlag` table with management review workflow.
- **Benchmarking queries**: `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY event_count)` against rollup tables, scoped by companyId and role
- **Schema**: `UserActivityEvent`, `ActivityDailyRollup`, `ActivityWeeklyRollup` (see SOP: `docs/sops-staging/tucks-analytics-platform-sop.md`)

## Scoring Rationale
- **Uniqueness (9/10)**: No construction PM platform has integrated gaming detection + anonymous individual benchmarking + workforce efficiency correlation in a single telemetry system.
- **Value (9/10)**: Directly answers the #1 question every construction company owner asks: "Is my team actually using this thing, and is it making us more efficient?"
- **Demonstrable (8/10)**: Highly visual — dashboards, charts, sparklines, gaming flags. Easy to demo. Slight deduction because full value requires accumulated data over time.
- **Defensible (7/10)**: The gaming detection algorithm and efficiency correlation logic are non-trivial to replicate, but the individual components (event tracking, rollups, charts) are standard. The defensibility is in the domain-specific calibration and the integration across all Nexus modules.

## Expected Operational Impact

All impact figures are expressed as a **percentage of annual revenue** so they scale naturally across company sizes. TUCKS is the #2 value driver in the portfolio because workforce efficiency gains scale directly with labor spend.

| Category | % of Revenue | What It Represents |
|----------|-------------|--------------------|
| **Workforce efficiency improvement** | ~1.00% | Visibility and benchmarking drive measurable productivity gains across all crews |
| **Software adoption ROI** | ~0.08% | Usage analytics identify underutilized modules, directing training where it has the most impact |
| **Management decision time** | ~0.06% | Exec/PM hours freed from manual performance tracking |
| **Gaming/fraud detection** | ~0.05% | Inflated activity flagged before it corrupts workforce analytics |
| **Training targeting** | ~0.01% | Broad training replaced by data-driven, role-specific coaching |
| **Total TUCKS Impact** | **~1.19%** | **Combined workforce efficiency and analytics value as a share of revenue** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | Est. Labor Spend | TUCKS Impact (~1.19%) |
|---------------|------------------|-----------------------|
| **$1M** | ~$350K | **~$11,900** |
| **$2M** | ~$700K | **~$26,000** |
| **$5M** | ~$1.5M | **~$47,600** |
| **$10M** | ~$2M | **~$119,100** |
| **$50M** | ~$8M | **~$476,400** |

*The ~1% workforce efficiency line dominates because even small productivity gains on a $2M+ labor budget produce six-figure returns. Scales super-linearly — larger firms have more process waste for analytics to surface.*

## Competitive Landscape

| Competitor | Usage Analytics? | Personal KPIs? | Gaming Detection? | Efficiency Correlation? | Benchmarking? |
|------------|-----------------|---------------|-------------------|----------------------|------------------|
| Procore | Basic (admin) | No | No | No | No |
| Buildertrend | Basic views | No | No | No | No |
| CoConstruct | No | No | No | No | No |
| BusyBusy | Time tracking | No | No | Partial | No |

## Related CAMs

- `OPS-VIS-0002` — Urgency Task Dashboard (task completion rates feed TUCKS KPIs)
- `CMP-AUTO-0001` — NexCheck (check-in events are telemetry data points)
- `OPS-COLLAB-0001` — Phantom Fleet (asset utilization feeds efficiency metrics)
- `FIN-INTL-0002` — Smart Prescreen (accept/reject rates feed adoption metrics)

## Expansion Opportunities
- **Predictive analytics** — historical efficiency data to predict project completion dates
- **AI coaching** — automated suggestions based on personal KPI trends
- **Client-facing reports** — share anonymized metrics with project owners
- **Mobile widget** — personal KPI summary on mobile home screen
- **Seasonal benchmarking** — compare against same-season historical data

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-28 | Initial draft — TUCKS telemetry concept |
| 2.0 | 2026-03-04 | Enriched: elevator pitch, operational savings, competitive landscape, related CAMs, revision history |
| 2.1 | 2026-03-05 | Converted financial impact to NexOP (% of revenue) format with tenant scaling table |
