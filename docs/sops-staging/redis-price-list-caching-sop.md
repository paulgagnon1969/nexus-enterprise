---
title: "Redis Price List Caching SOP"
module: redis-price-list-caching
revision: "1.0"
tags: [sop, estimating, redis, caching, price-list, petl, golden-price-list]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
cam_ref: EST-SPD-0001
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
---

# Redis Price List Caching

## Purpose
NCC caches the entire Golden Price List in Redis to deliver sub-100ms lookups for estimators. This SOP documents how the cache works, when it invalidates, and how to troubleshoot cache-related issues.

## Who Uses This
- **Estimators** — benefit from fast price list loads (transparent; no action required)
- **PMs** — same benefit when reviewing estimates
- **Admins / DevOps** — troubleshoot cache issues, monitor Redis health

## How It Works

### Cache Lifecycle
1. **First request** — Price list is loaded from PostgreSQL, serialized, and stored in Redis under key `golden:price-list:current` with a 1-hour TTL.
2. **Subsequent requests** — Served from Redis in ~50ms (vs. 500–800ms cold DB query).
3. **On PETL import** — Cache key is automatically invalidated by both the import worker and the pricing controller.
4. **TTL expiry** — If no import occurs, the cache expires after 1 hour and is refreshed on the next request.
5. **Redis unavailable** — System falls back to synchronous PostgreSQL query (see TECH-ACC-0001 Graceful Fallback SOP).

### Cache Key
```
Key:   golden:price-list:current
TTL:   3600 seconds (1 hour)
Size:  ~2–5 MB (depending on price list size)
```

### Auto-Invalidation Triggers
- PETL CSV import completes (worker)
- Price list update via pricing controller
- Manual cache flush (admin action)

## Step-by-Step: Verifying Cache Health

### 1. Check if cache is populated
```bash
# Connect to dev Redis
redis-cli -p 6380 EXISTS golden:price-list:current
# Returns 1 if cached, 0 if not

# Check TTL remaining
redis-cli -p 6380 TTL golden:price-list:current
```

### 2. Check cache size
```bash
redis-cli -p 6380 STRLEN golden:price-list:current
```

### 3. Force cache refresh (if needed)
```bash
# Delete the key — next request will re-populate from DB
redis-cli -p 6380 DEL golden:price-list:current
```

### 4. Verify fallback is working
```bash
# Stop Redis temporarily
docker stop nexus-redis

# Hit the price list endpoint — should still return data (slower)
curl -s http://localhost:8001/pricing/price-list | head -c 200

# Restart Redis
docker start nexus-redis
```

## Troubleshooting

### "Price list is slow"
1. Check if Redis is running: `docker ps | grep nexus-redis`
2. Check if cache key exists: `redis-cli -p 6380 EXISTS golden:price-list:current`
3. If key missing, trigger a price list request — it will re-cache automatically
4. If Redis is down, the API falls back to DB (expected ~600ms latency)

### "Price list shows stale data after import"
1. Verify the import completed successfully (check worker logs)
2. Check if cache was invalidated: `redis-cli -p 6380 TTL golden:price-list:current` — a fresh TTL (close to 3600) means it was just re-cached
3. If stale, manually flush: `redis-cli -p 6380 DEL golden:price-list:current`

### "Redis memory usage is high"
The price list cache is a single key (~2–5 MB). If Redis memory is high, the issue is elsewhere (session store, BullMQ queues). Check with:
```bash
redis-cli -p 6380 INFO memory
redis-cli -p 6380 DBSIZE
```

## Key Features
- **16× speedup** — ~50ms vs. ~800ms for 54,000+ price items
- **Automatic invalidation** — cache refreshes on every PETL import
- **Graceful fallback** — zero downtime if Redis is unavailable
- **Zero configuration** — works out of the box, no user setup required

## Related Modules
- [Graceful Sync Fallback](graceful-sync-fallback-sop.md) — fallback behavior when Redis is down
- [BOM Pricing Pipeline](bom-pricing-pipeline-sop.md) — uses cached price list for comparison
- [NexPRICE Regional Pricing](local-price-extrapolation-sop.md) — builds on same pricing infrastructure

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial SOP — cache lifecycle, troubleshooting, verification steps |
