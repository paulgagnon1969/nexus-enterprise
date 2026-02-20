# NCC advantEDGE™: fasTRACK

## Tagline

**Your projects know you're coming.** fasTRACK learns how you work and puts your most active projects front and center — before you even search.

## What It Is

NCC fasTRACK is a smart-center navigation system built into the NCC mobile and web experience. It uses a local, on-device usage ledger to track which projects, modules, and actions a user engages with most frequently. A recency-weighted scoring algorithm continuously ranks projects so the ones that matter right now surface automatically at the top of every project list.

fasTRACK doesn't require configuration, training, or setup. It starts learning from the first tap.

## Why It Matters

Construction professionals manage dozens — sometimes hundreds — of active projects. The industry standard is alphabetical lists or manual favorites. Neither adapts to how people actually work: you're on Project A all week, then shift to Project B next week. Static lists don't move with you.

**The problem**: A superintendent opens the app, scrolls past 40 projects to find the one they've been working on all day. Multiply that by every crew lead, PM, and admin across every login. That's thousands of wasted interactions per week.

**fasTRACK eliminates the scroll.** The project you need is already at the top.

## How It's Different

| Competitor Approach | NCC fasTRACK |
|---------------------|-------------|
| Alphabetical lists | Recency + frequency weighted smart sort |
| Manual "favorites" that go stale | Auto-adapting — no user action required |
| Server-side analytics (slow, privacy concerns) | On-device scoring — instant, private, works offline |
| One-size-fits-all navigation | Personalized per user, per device |
| No learning capability | Learns from every tap: project opens, log creation, PETL sessions |

**No other construction platform has adaptive, on-device navigation intelligence.**

## Key Capabilities

- **Recency-weighted frequency scoring**: Each interaction contributes a score of `1 / (1 + daysSinceEvent)`. Today's activity scores ~1.0, yesterday's ~0.5, last week's ~0.125. The math naturally surfaces what matters right now.
- **Multi-signal tracking**: Scores are fed by project opens, daily log creation, daily log views, PETL sessions, and directions requests — not just "did they click it."
- **On-device processing**: All scoring happens in SQLite on the device. No server round-trips, no cloud dependency, no privacy exposure. Works fully offline.
- **Auto-pruning**: Events older than 90 days are automatically cleaned up. The scoring window is 60 days. Zero maintenance.
- **Threshold-based surfacing**: Only projects that clear a minimum relevance score appear in the fasTRACK section — no noise, no clutter.
- **Graceful cold start**: For new users or new devices, fasTRACK simply isn't shown. The list defaults to alphabetical. As soon as usage data accumulates, fasTRACK appears automatically.
- **Dual browse modes**: Projects screen offers both fasTRACK-enhanced project browsing AND client search (by contact name, email, phone, address) with grouped results.

## Sales Talking Points

> "fasTRACK learns how your team works. The projects they're on today are already at the top — no scrolling, no searching, no favorites to manage."

> "It's like a GPS for your workday. fasTRACK knows where you need to be before you do."

> "Every tap teaches fasTRACK. Open a project, create a log, check PETL — it all contributes to smarter navigation that adapts in real time."

> "This runs entirely on the device. No cloud processing, no delays, no privacy concerns. It even works when you're offline on a jobsite with no signal."

> "Your competitors are still using alphabetical lists. NCC learns."

## Demo Script (60 seconds)

1. Open the Projects tab — show the ⚡ fasTRACK section with the user's most active projects highlighted at the top
2. Open a project, create a quick daily log, go back — show how that project's fasTRACK score just increased
3. Toggle to Client Search — type a client name, show grouped results
4. Switch tenants — show fasTRACK adapts per-org
5. Close with: "This is NCC fasTRACK. It learns how you work so you can spend less time navigating and more time building."

## Technical Notes

- **Storage**: `usage_events` table in local SQLite (`nexus_mobile.db`) — columns: `id`, `projectId`, `action`, `ts`
- **Module**: `apps/mobile/src/storage/usageTracker.ts`
- **Scoring**: `getProjectScores()` — queries events within 60-day window, computes `Σ 1/(1+daysSince)` per project
- **Actions tracked**: `open_project`, `create_daily_log`, `view_daily_log`, `open_petl`, `open_directions`
- **Constants**: `FREQUENT_THRESHOLD = 0.5`, `MAX_FREQUENT = 5`, `SCORING_WINDOW_DAYS = 60`, `PRUNE_AFTER_DAYS = 90`
- **Integration points**: `ProjectsScreen.tsx` (display + record), `HomeScreen.tsx` (record on project open / log view), `DailyLogCreateScreen.tsx` (record on save)
- **Future extensions**: Module-level tracking (which screens/actions a user favors), cross-device sync via API, team-level analytics ("which projects are hottest across all users")

---

*NCC advantEDGE™: fasTRACK — Revision 1.0 — February 2026*
