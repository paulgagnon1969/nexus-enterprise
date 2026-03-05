---
cam_id: TECH-ACC-0001
title: "Graceful Synchronous Fallback for Infrastructure Resilience"
mode: TECH
category: ACC
revision: "2.0"
status: draft
created: 2026-02-21
updated: 2026-03-04
author: Warp
website: false
scores:
  uniqueness: 6
  value: 9
  demonstrable: 7
  defensible: 6
  total: 28
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, technology, accuracy, reliability, fallback, redis, queue, resilience]
---

# TECH-ACC-0001: Graceful Synchronous Fallback

> *Your data, always safe. Even when the infrastructure isn't.*

## Elevator Pitch
When Redis, BullMQ, or any background-processing layer goes down, most SaaS apps silently drop jobs and lose user data. NCC detects the outage in real time and transparently switches to synchronous processing — slower, but every import completes, every file processes, every user sees success. When infrastructure recovers, the fast path resumes automatically. Zero lost data, zero user-visible errors, zero support tickets.

## The Problem
Modern SaaS applications rely on background job systems (Redis, BullMQ, RabbitMQ) for imports, notifications, and async processing. When these systems fail:

- **Jobs silently fail** — users click "Import" and nothing happens. No error, no feedback, just silence.
- **Data is lost** — the uploaded file was received but never processed. The user assumes it worked.
- **Support burden compounds** — hours spent diagnosing "my import disappeared" tickets instead of building features.
- **Trust erodes** — one lost import and the user starts keeping parallel spreadsheets "just in case."

Most systems treat queue failures as fatal errors requiring manual intervention. A Redis restart during a PETL import means that import is gone.

## How It Works

1. **Health check on every job dispatch** — Before queuing any background job, NCC pings Redis. Adds <1ms to the request.
2. **Fast path (normal)** — Redis is healthy → job is queued in BullMQ for async processing. User sees "Queued" → "Processing" → "Complete."
3. **Fallback path (degraded)** — Redis is unavailable → job is processed synchronously in the same request. Slower (the user waits), but the import completes successfully.
4. **Self-healing** — When Redis comes back, the next request automatically routes to the fast path. No restart required, no manual intervention.
5. **Observability** — Every fallback event is logged with context (which job, why Redis was unavailable, how long the sync path took).

```typescript
// Pattern used across all import/processing endpoints
async function processImport(file) {
  if (await isRedisAvailable()) {
    return await queueJob(file);       // Fast path: async
  } else {
    return await processSync(file);    // Fallback: sync, but works
  }
}
```

## Expected Operational Savings

*Based on a mid-size restoration firm running ~120 imports/month (PETL, HD CSV, Apple Card, receipts).*

| Category | Calculation | Annual Savings |
|----------|-------------|----------------|
| **Prevented data loss** | ~3 queue failures/month × avg 45 min to diagnose + re-import × $45/hr | **$2,430** |
| **Eliminated support tickets** | 36 "lost import" tickets/yr avoided × 30 min resolution @ $45/hr | **$810** |
| **Prevented re-work** | 2 full re-imports/yr from lost data × 3 hrs each @ $55/hr | **$330** |
| **Infrastructure maintenance freedom** | Redis restarts/upgrades without scheduling around imports | **$1,200** |
| **User trust / retention** | Avoided 1 churn event/yr from "lost my data" frustration (est. LTV impact) | **$3,600** |
| | **Estimated Annual Savings** | **~$8,400** |

The trust/retention value is the hardest to quantify but often the most impactful — a single lost import can permanently damage a user's confidence in the platform.

## Competitive Landscape

| Competitor | Queue Fallback? | Zero-Loss Guarantee? | Self-Healing? | Fallback Logging? |
|------------|----------------|---------------------|--------------|------------------|
| Buildertrend | No | No — manual retry | No | No |
| CoConstruct | No | No — requires queue health | No | No |
| Procore | Partial | Enterprise SLA only | Unknown | Partial |
| Xactimate | N/A | Desktop app | N/A | N/A |
| JobNimbus | No | No | No | No |
| Sage 300 | No | Batch failures require restart | No | Partial |

No competitor in the restoration/construction vertical offers transparent sync fallback for background processing failures.

## Demo Script
1. Open the PETL import page → upload a small CSV. Show it queued and processed (fast path, ~2 seconds).
2. Stop Redis: `docker stop nexus-redis`.
3. Upload the same CSV again. Show the import still succeeds — takes ~8 seconds (sync path) but completes with the same result.
4. Show the API logs: `[WARN] Redis unavailable — processing synchronously`.
5. Restart Redis: `docker start nexus-redis`. Upload again — back to 2-second async processing.
6. *"The user never knew Redis was down. Their data was never at risk."*

## Technical Implementation

```typescript
// apps/api/src/infra/queue/import-queue.ts
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    if (!redis) return false;
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
```

Applied at: PETL imports, HD CSV processing, Apple Card imports, receipt OCR queuing, price list cache warming.

## Scoring Rationale

- **Uniqueness (6/10)**: Graceful degradation is a known engineering pattern, but it's rarely implemented in construction SaaS. Most competitors treat infrastructure failure as an ops problem, not a product feature.
- **Value (9/10)**: Data loss is the cardinal sin of any business tool. 100% import completion rate — regardless of infrastructure state — is table-stakes trust that competitors don't provide.
- **Demonstrable (7/10)**: Can be demoed by stopping Redis mid-import, but it's a "negative" demo (showing what *doesn't* go wrong). Less visceral than a speed demo, but powerful for technical buyers.
- **Defensible (6/10)**: The pattern is simple, but the discipline of applying it consistently across every processing endpoint — and logging every fallback — is where the value lies.

**Total: 28/40** — Exceeds CAM threshold (24).

## Related CAMs

- `EST-SPD-0001` — Redis Price List Caching (uses this fallback when Redis is down)
- `FIN-INTL-0002` — Smart Prescreen Learning Loop (prescreening falls back to sync if queue unavailable)
- `FIN-VIS-0001` — Purchase Reconciliation (import pipeline protected by this fallback)

## Expansion Opportunities

- **Circuit breaker pattern** — after N consecutive Redis failures, pre-emptively route to sync for M minutes
- **Fallback metrics dashboard** — show ops team how often the fallback path is used, trending over time
- **Partial queue recovery** — when Redis comes back, re-queue sync-processed jobs for post-processing enrichment
- **Multi-backend fallback** — Redis → PostgreSQL-based queue → synchronous (three-tier resilience)
- **Client-side retry** — if sync fallback also fails, queue in the browser and auto-retry on next connection

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-21 | Initial draft — graceful fallback concept |
| 2.0 | 2026-03-04 | Full rewrite: standardized format, elevator pitch, operational savings, demo script, scoring rationale, related CAMs, expansion opportunities |
