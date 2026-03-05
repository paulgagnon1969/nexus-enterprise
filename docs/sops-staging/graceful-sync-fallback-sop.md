---
title: "Graceful Synchronous Fallback SOP"
module: graceful-sync-fallback
revision: "1.0"
tags: [sop, technology, accuracy, reliability, fallback, redis, queue, resilience, bullmq]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
cam_ref: TECH-ACC-0001
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# Graceful Synchronous Fallback

## Purpose
When Redis or BullMQ is unavailable, NCC transparently switches to synchronous processing so imports, OCR jobs, and background tasks complete successfully instead of silently failing. This SOP documents how the fallback works, where it applies, and how to monitor it.

## Who Uses This
- **Admins / DevOps** — monitor fallback events, troubleshoot Redis outages
- **All users** (indirectly) — benefit from zero-data-loss guarantee during infrastructure issues

## How It Works

### Normal Path (Redis Healthy)
```
User action → API → Queue job in BullMQ (via Redis) → Worker processes async
Response: "Queued" → "Processing" → "Complete"
Latency: ~2 seconds
```

### Fallback Path (Redis Unavailable)
```
User action → API → Redis ping fails → Process synchronously in-request
Response: "Processing" → "Complete" (user waits)
Latency: ~5–15 seconds (depends on job complexity)
```

### Self-Healing
When Redis comes back online, the next request automatically routes to the fast (async) path. No restart required, no manual intervention.

## Where Fallback Applies
The fallback pattern is implemented at every background-processing endpoint:

| Endpoint | Normal Path | Fallback Path |
|----------|------------|--------------|
| PETL CSV import | BullMQ async | Sync in-request |
| HD Pro Xtra CSV | BullMQ async | Sync in-request |
| Apple Card CSV | BullMQ async | Sync in-request |
| Receipt OCR | BullMQ async | Sync in-request |
| Price list cache warming | Redis cache | DB direct query |
| Prescreening | BullMQ async | Sync in-request |

## Monitoring Fallback Events

### Check API Logs for Fallback Warnings
```bash
# Dev
docker logs nexus-shadow-api 2>&1 | grep -i "redis unavailable\|fallback\|sync processing"

# Or check recent logs
docker logs nexus-shadow-api --tail 100 2>&1 | grep -i fallback
```

Fallback events are logged as:
```
[WARN] Redis unavailable — processing synchronously (job: petl-import, duration: 8432ms)
```

### Check Redis Health
```bash
# Dev Redis
redis-cli -p 6380 PING
# Should return: PONG

# Prod Redis
redis-cli -p 6381 PING
```

### Check Redis Container Status
```bash
# Dev
docker ps | grep nexus-redis

# Prod
docker ps | grep nexus-shadow-redis
```

## Troubleshooting

### "Imports are slow but working"
This likely means Redis is down and the fallback is active:
1. Check Redis: `redis-cli -p 6380 PING` (dev) or `redis-cli -p 6381 PING` (prod)
2. If Redis is down, restart: `docker start nexus-redis` (dev) or `docker start nexus-shadow-redis` (prod)
3. Next import will use the fast async path

### "Redis keeps crashing"
1. Check memory: `redis-cli -p 6380 INFO memory`
2. Check for OOM kills: `docker inspect nexus-redis | grep OOMKilled`
3. If memory constrained, increase the container's memory limit in docker-compose

### "Import failed even with fallback"
The fallback handles Redis unavailability, not application errors. If an import fails in sync mode:
1. Check the API logs for the actual error
2. The error is in the import logic itself, not the queue/fallback layer
3. Debug as a normal import failure

## Implementation Pattern
```typescript
// Applied at every import/processing endpoint
async function processImport(file) {
  if (await isRedisAvailable()) {
    return await queueJob(file);       // Fast path: async
  } else {
    return await processSync(file);    // Fallback: sync, but works
  }
}
```

The `isRedisAvailable()` check adds <1ms latency to every request.

## Key Features
- **Zero data loss** — every import completes regardless of Redis state
- **Transparent** — users never see "Redis unavailable" errors
- **Self-healing** — automatically returns to fast path when Redis recovers
- **Observable** — every fallback event is logged with job type and duration
- **No manual intervention** — no restart required after Redis recovery

## Related Modules
- [Redis Price List Caching](redis-price-list-caching-sop.md) — uses this fallback for price list delivery
- [Smart Prescreening](smart-prescreening-store-card-reconciliation-sop.md) — prescreening falls back to sync
- [Purchase Reconciliation](purchase-reconciliation-audit-chain-sop.md) — import pipeline protected by fallback

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial SOP — fallback mechanism, monitoring, troubleshooting |
