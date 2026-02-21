---
title: "Estimating - Instant Price List Access via Redis Caching"
cam_id: "EST-SPD-0001"
mode: estimating
category: speed
status: draft
competitive_score: 7
value_score: 8
created: 2026-02-21
session_ref: "ncc-pm-redis-session-export.md"
tags: [cam, estimating, speed, redis, caching, petl, golden-price-list]
website: true
website_section: features
website_priority: 75
website_headline: "54,000 Prices in 50ms"
website_summary: "NCC's intelligent caching delivers the entire Golden Price List instantly. Estimators spend time estimating, not waiting."
---

# Instant Price List Access via Redis Caching

## The Problem

Construction estimating systems must reference large price lists—often 50,000+ line items. Traditional approaches:
- **Database query on every request**: 500-800ms latency per lookup
- **Client-side caching**: Stale data, sync issues, memory bloat
- **Flat file exports**: Manual updates, version drift

When estimators create multiple estimates per day, these delays compound into hours of lost productivity.

## The NCC Advantage

NCC uses **server-side Redis caching** with intelligent invalidation:

1. **First request**: Load from PostgreSQL → cache in Redis (1-hour TTL)
2. **Subsequent requests**: Serve from Redis in ~50ms (16x faster)
3. **On PETL import**: Automatic cache invalidation ensures fresh data
4. **Graceful fallback**: If Redis unavailable, sync fallback to DB (no errors, just slower)

**Key insight**: Price lists change infrequently (monthly imports), but are read constantly. Perfect caching candidate.

## Business Value

- **Time saved**: ~750ms × 100 lookups/day × 20 estimators = **25+ minutes/day saved**
- **Errors prevented**: Consistent data (no stale client caches)
- **Revenue enabled**: Faster estimates = more estimates = more won bids

## Competitive Landscape

| Competitor | Has This? | Notes |
|------------|-----------|-------|
| Buildertrend | No | DB-direct queries, client caching only |
| CoConstruct | Partial | Some caching, no intelligent invalidation |
| Procore | Partial | Enterprise tier only, complex setup |
| Xactimate | No | Desktop app, local file sync |

## Use Cases

1. **Morning price check**: Superintendent pulls current material prices for daily planning—instant response
2. **Multi-estimate workflow**: Estimator creates 5 estimates in a row—no cumulative slowdown
3. **Mobile field access**: Slow connection? Cached data returns before timeout

## Technical Implementation

```
Cache Key: golden:price-list:current
TTL: 3600 seconds (1 hour)
Invalidation: On PETL import completion (worker + controller)
Fallback: Synchronous DB query if Redis unavailable
```

## Related Features

- [Golden PETL Import](../architecture/golden-petl.md)
- [Field Security Caching](./TECH-SPD-0001-field-security-caching.md)

## Session Origin

Discovered in: `docs/sops-staging/ncc-pm-redis-session-export.md`

During Redis infrastructure setup for production, we identified that the Golden Price List endpoint was a prime caching candidate due to high read frequency and low write frequency.
