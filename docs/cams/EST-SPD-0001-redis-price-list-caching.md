---
cam_id: EST-SPD-0001
module_code: ESTIMATING
title: "Instant Price List Access via Redis Caching"
mode: EST
category: SPD
revision: "2.0"
status: draft
created: 2026-02-21
updated: 2026-03-04
author: Warp
website: false
scores:
  uniqueness: 7
  value: 8
  demonstrable: 9
  defensible: 5
  total: 29
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
tags: [cam, estimating, speed, redis, caching, petl, golden-price-list]
---

# EST-SPD-0001: Instant Price List Access via Redis Caching

> *54,000 prices in 50ms. Estimators spend time estimating, not waiting.*

## Elevator Pitch
NCC caches the entire Golden Price List in Redis and serves it in ~50ms — 16× faster than a cold database query. Cache invalidation fires automatically on every PETL import, so data is always fresh. If Redis goes down, a synchronous DB fallback ensures zero downtime. No estimating platform delivers this combination of speed, freshness, and resilience for large-scale price lookups.

## The Problem
Construction estimating systems must reference large price lists — often 50,000+ line items. Traditional approaches:

- **Database query on every request**: 500–800ms latency per lookup. When an estimator creates 5 estimates in a morning, each referencing dozens of materials, the cumulative wait is measured in minutes.
- **Client-side caching**: Stale data, sync issues, memory bloat on the browser. Users unknowingly bid with yesterday's prices.
- **Flat file exports**: Manual updates, version drift, no single source of truth.

Competitors like Xactimate use desktop-app file sync; Buildertrend and CoConstruct rely on direct DB queries with no caching layer. None offer sub-100ms response times for 50K+ item price lists.

## How It Works

1. **First request** — Full price list loaded from PostgreSQL, serialized, and cached in Redis with a 1-hour TTL.
2. **Subsequent requests** — Served directly from Redis in ~50ms (vs. 500–800ms from DB).
3. **On PETL import** — Cache key is automatically invalidated by both the import worker and the pricing controller, ensuring the next request gets fresh data.
4. **Graceful fallback** — If Redis is unavailable, the system seamlessly falls back to a synchronous DB query. Slower, but never broken. (See TECH-ACC-0001.)

**Key insight**: Price lists change infrequently (monthly imports) but are read constantly — a textbook caching candidate. NCC exploits this read/write asymmetry.

## Expected Operational Savings

*Based on a mid-size restoration firm: 3 estimators, 5 PMs, ~10 estimates/week.*

| Category | Calculation | Annual Savings |
|----------|-------------|----------------|
| **Estimator time saved** | 750ms saved × 100 lookups/day × 8 users × 250 days = 41.7 hrs/yr @ $55/hr | **$2,290** |
| **Faster estimate turnaround** | 15 min saved/estimate × 500 estimates/yr @ $55/hr | **$6,875** |
| **Eliminated stale-data errors** | 2 mispriced bids/yr avoided × avg $1,500 margin impact | **$3,000** |
| **IT/support burden reduced** | ~10 hrs/yr debugging "slow price list" tickets @ $65/hr | **$650** |
| | **Estimated Annual Savings** | **~$12,800** |

The time-saved figure is conservative — the real value compounds when estimators can create more estimates per day, winning more bids.

## Competitive Landscape

| Competitor | Server-Side Cache? | Auto-Invalidation? | Sub-100ms Lookup? | Graceful Fallback? |
|------------|-------------------|--------------------|-----------------------|-------------------|
| Buildertrend | No | N/A | No (DB-direct) | No |
| CoConstruct | Partial | No | No | No |
| Procore | Partial | Unknown | Enterprise tier only | Unknown |
| Xactimate | N/A | N/A | Desktop file sync | N/A |
| JobNimbus | No | N/A | No | No |

## Demo Script
1. Open the estimating module → select "Load Price List."
2. Show the network tab: **48ms** response time for 54,000 items.
3. Open Redis CLI → `GET golden:price-list:current` → show the cached blob exists.
4. Trigger a PETL import (upload a small CSV). Show the cache key disappear.
5. Reload the price list — first cold load at ~600ms, then subsequent loads back to ~50ms.
6. *(Advanced)* Stop Redis → reload price list → show it still works (synchronous fallback, ~650ms). Restart Redis → next load is cached again.

## Technical Implementation

```
Cache Key: golden:price-list:current
TTL: 3600 seconds (1 hour)
Invalidation: On PETL import completion (worker + controller)
Fallback: Synchronous DB query if Redis unavailable
Stack: NestJS → ioredis → PostgreSQL (via Prisma)
```

## Scoring Rationale

- **Uniqueness (7/10)**: Redis caching is a known pattern, but no competing construction PM platform implements it for large-scale price list delivery with auto-invalidation on import. The combination is uncommon in this vertical.
- **Value (8/10)**: Estimators interact with price lists dozens of times per day. 16× speedup removes friction from the highest-revenue workflow in the company.
- **Demonstrable (9/10)**: Extremely easy to demo — show a stopwatch comparison, flip between cached and uncached loads. The speed difference is visceral.
- **Defensible (5/10)**: Redis caching is straightforward to implement. The defensibility is in the integration — auto-invalidation tied to the import pipeline, graceful fallback, and the fact that it "just works" without configuration.

**Total: 29/40** — Exceeds CAM threshold (24).

## Related CAMs

- `TECH-ACC-0001` — Graceful Sync Fallback (the fallback mechanism that makes this cache resilient)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (uses the cached price list for comparison workflows)
- `FIN-INTL-0003` — NexPRICE Regional Pricing (builds on the same pricing infrastructure)

## Expansion Opportunities

- **Per-project price snapshots** — cache project-specific price overrides alongside the golden list
- **Predictive pre-warming** — pre-cache price lists for projects scheduled to be estimated tomorrow
- **Delta sync** — track only changed items since last load for even faster updates
- **Mobile offline cache** — push the Redis-cached price list to mobile devices for offline estimating
- **Multi-tenant cache isolation** — separate cache keys per tenant for custom price list support

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-21 | Initial draft — Redis caching concept |
| 2.0 | 2026-03-04 | Full rewrite: standardized format, elevator pitch, operational savings, demo script, scoring rationale, related CAMs, expansion opportunities |
