---
cam_id: TECH-INTL-0001
title: "TUCKS — Telemetry Usage Chart KPI System with Gaming Detection"
mode: TECH
category: INTL
status: draft
created: 2026-02-28
updated: 2026-02-28
author: Warp
scores:
  uniqueness: 9
  value: 9
  demonstrable: 8
  defensible: 7
  total: 33
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# TECH-INTL-0001 — TUCKS: Telemetry Usage Chart KPI System

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

## Related Modules
- Daily Logs (primary data source for gaming detection)
- Timecards (workforce efficiency correlation)
- PETL / Estimating (expected labor benchmarks)
- Projects / Rooms (completion velocity tracking)

## Future Extensions
- **Predictive analytics**: Use historical efficiency data to predict project completion dates
- **AI coaching**: Automated suggestions based on personal KPI trends ("Your daily log frequency dropped 30% this week — everything OK?")
- **Client-facing efficiency reports**: Share anonymized efficiency metrics with project owners as proof of productivity
- **Mobile widget**: Show personal KPI summary on the mobile home screen
- **Seasonal benchmarking**: Compare current efficiency against same-season historical data (construction is seasonal)
