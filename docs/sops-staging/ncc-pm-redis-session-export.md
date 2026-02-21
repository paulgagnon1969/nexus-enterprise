---
title: "NCC PM Manual - Redis Infrastructure Session"
module: redis-infrastructure
revision: "1.0"
tags: [sop, redis, infrastructure, session-export, pm-manual]
status: draft
created: 2026-02-21
updated: 2026-02-21
author: Warp
session_date: 2026-02-19 to 2026-02-21
---

# Redis Infrastructure Setup Session

This document captures the decisions, implementation, and lessons learned from setting up Redis infrastructure for NCC production.

## Session Overview

| Date | Topic |
|------|-------|
| 2026-02-19 | Golden PETL import 500 error investigation |
| 2026-02-19 | Redis VM creation and initial setup |
| 2026-02-19 | Redis caching implementation |
| 2026-02-20 | Production login failure - bind address fix |
| 2026-02-20 | SOP documentation and hardening |

---

## Problem 1: Golden PETL Import Failing (500 Error)

### Symptoms
- Uploading Golden PETL in production resulted in "Golden PETL import enqueue failed (500)"
- Error occurred on the cloud path (`/pricing/price-list/import-from-uri`)

### Root Cause
Production Cloud Run had no `REDIS_URL` configured. The BullMQ queue requires Redis to enqueue background jobs.

### Solution
Added a **synchronous fallback** for Golden PETL imports when Redis is unavailable:

```typescript
// pricing.controller.ts
if (isRedisAvailable()) {
  // Try async queue
  const queue = getImportQueue();
  await queue.add("process", { importJobId: job.id });
  return { jobId: job.id };
}

// Synchronous fallback when Redis unavailable
const tmpPath = await this.gcs.downloadToTmp(fileUri);
const result = await importPriceListFromFile(tmpPath, { mode: importMode });
// ... update job status, create log entry
return { jobId: job.id, sync: true };
```

---

## Decision: Self-Managed Redis VM

### Options Evaluated

| Option | Pros | Cons | Monthly Cost |
|--------|------|------|--------------|
| **GCE VM (chosen)** | Full control, simple setup, no VPC connector | Manual maintenance | ~$13-15 |
| Cloud Memorystore | Managed, auto-failover | Requires VPC connector ($7+) | ~$40+ |
| Upstash (serverless) | Zero maintenance | External dependency | Variable |

### Decision Rationale
1. **Cost efficiency** - Lowest monthly cost for our usage pattern
2. **Simplicity** - No VPC connector configuration required
3. **Control** - Direct access for debugging and tuning
4. **Sufficient for current scale** - Job queues + caching don't require HA

---

## Implementation: Redis VM Setup

### Step 1: Create the VM

```bash
gcloud compute instances create redis-prod \
  --project=nexus-enterprise-480610 \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --tags=redis-server
```

### Step 2: Install and Configure Redis

```bash
# Generate password
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

# SSH and configure
gcloud compute ssh redis-prod --zone=us-central1-a --command="
sudo apt update && sudo apt install -y redis-server

# CRITICAL: Bind to 0.0.0.0 for external access
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf

# Set password
sudo sed -i 's/^# requirepass foobared/requirepass $REDIS_PASSWORD/' /etc/redis/redis.conf

sudo systemctl restart redis-server
sudo systemctl enable redis-server
"
```

### Step 3: Create Firewall Rule

```bash
gcloud compute firewall-rules create allow-redis-cloudrun \
  --project=nexus-enterprise-480610 \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:6379 \
  --target-tags=redis-server \
  --source-ranges=0.0.0.0/0
```

### Step 4: Update Cloud Run

```bash
REDIS_IP=$(gcloud compute instances describe redis-prod \
  --zone=us-central1-a \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

gcloud run services update nexus-api \
  --region=us-central1 \
  --update-env-vars="REDIS_URL=redis://:$REDIS_PASSWORD@$REDIS_IP:6379"
```

---

## Implementation: Redis Caching

### Enhanced RedisService

Added caching helpers to `apps/api/src/infra/redis/redis.service.ts`:

```typescript
export const CACHE_TTL = {
  GOLDEN_PRICE_LIST: 3600,    // 1 hour
  COMPANY_PRICE_LIST: 1800,   // 30 minutes
  FIELD_SECURITY: 900,        // 15 minutes
  DIVISIONS: 86400,           // 24 hours
} as const;

export const CACHE_KEY = {
  GOLDEN_CURRENT: "golden:current",
  GOLDEN_TABLE: "golden:table",
  GOLDEN_UPLOADS: "golden:uploads",
  COMPANY_PRICE_LIST: (companyId: string) => `company:${companyId}:pricelist`,
  FIELD_SECURITY: (companyId: string) => `company:${companyId}:fieldsec`,
} as const;
```

### Cached Endpoints

| Endpoint | Cache Key | TTL | Expected Improvement |
|----------|-----------|-----|---------------------|
| `/pricing/price-list/current` | `golden:current` | 1 hour | 50ms → 2ms |
| `/pricing/price-list/table` | `golden:table` | 1 hour | 800ms → 50ms |
| `/pricing/price-list/uploads` | `golden:uploads` | 1 hour | 50ms → 5ms |
| `/field-security/policies` | `company:{id}:fieldsec` | 15 min | 20ms → 1ms |

### Cache Invalidation

- **Golden PETL import** → Clears `golden:*` keys (controller + worker)
- **Company cost book import** → Clears `company:{id}:*` keys (worker)
- **Field security policy update** → Clears `company:{id}:fieldsec`

---

## Problem 2: Production Login Failing

### Symptoms
- Users couldn't log in to production
- Cloud Run logs showed: `[ioredis] Unhandled error event: Error: connect ECONNREFUSED`

### Investigation

```bash
# Check Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND textPayload=~'redis'" \
  --project=nexus-enterprise-480610 --limit=20
```

Output showed continuous `ECONNREFUSED` errors.

### Root Cause

The Redis bind address was still set to localhost:

```bash
# Check Redis config
gcloud compute ssh redis-prod --command="sudo grep '^bind' /etc/redis/redis.conf"
# Output: bind 127.0.0.1 ::1  ← WRONG!
```

The original `sed` command didn't match the actual format in Ubuntu's redis.conf:
- Expected: `bind 127.0.0.1 -::1`
- Actual: `bind 127.0.0.1 ::1` (no hyphen)

### Fix

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --command="
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf
sudo systemctl restart redis-server
"
```

### Verification

```bash
# Verify bind address
gcloud compute ssh redis-prod --command="sudo ss -tlnp | grep 6379"
# Should show: *:6379 (all interfaces)

# Test connection
gcloud compute ssh redis-prod --command="redis-cli -a PASSWORD ping"
# Output: PONG
```

---

## Key Lessons Learned

### 1. Bind Address Configuration
**Always verify Redis is listening on the correct interface:**
```bash
sudo ss -tlnp | grep 6379
# Should show *:6379, NOT 127.0.0.1:6379
```

### 2. Robust sed Patterns
Use patterns that handle variations:
```bash
# Bad - too specific
sudo sed -i 's/^bind 127.0.0.1 -::1/bind 0.0.0.0/' /etc/redis/redis.conf

# Good - handles variations
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf
```

### 3. Cloud Run YAML vs Reality
The `infra/cloud-run-api.yaml` file is a **template only**. Actual production config is set via `gcloud run services update`. Always verify with:
```bash
gcloud run services describe nexus-api --region=us-central1 --format=yaml
```

### 4. Graceful Degradation
The sync fallback for Golden PETL imports ensures the feature works even if Redis is temporarily unavailable.

---

## Maintenance Commands Reference

### Check Status
```bash
gcloud compute ssh redis-prod --zone=us-central1-a \
  --command="sudo systemctl status redis-server --no-pager"
```

### View Logs
```bash
gcloud compute ssh redis-prod --zone=us-central1-a \
  --command="sudo journalctl -u redis-server -n 100 --no-pager"
```

### Check Memory
```bash
gcloud compute ssh redis-prod --zone=us-central1-a \
  --command="redis-cli -a PASSWORD info memory | grep used_memory_human"
```

### Monthly Security Updates
```bash
gcloud compute ssh redis-prod --zone=us-central1-a \
  --command="sudo apt update && sudo apt upgrade -y && sudo systemctl restart redis-server"
```

### Flush Cache (if needed)
```bash
gcloud compute ssh redis-prod --zone=us-central1-a \
  --command="redis-cli -a PASSWORD flushall"
```

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/api/src/infra/redis/redis.service.ts` | Added caching helpers, TTLs, cache keys |
| `apps/api/src/infra/queue/import-queue.ts` | Added `isRedisAvailable()` check |
| `apps/api/src/modules/pricing/pricing.controller.ts` | Added caching + sync fallback |
| `apps/api/src/modules/field-security/field-security.controller.ts` | Added caching |
| `apps/api/src/worker.ts` | Added cache invalidation after imports |
| `infra/cloud-run-api.yaml` | Updated to clarify it's a template |
| `docs/sops-staging/redis-infrastructure-sop.md` | Full Redis SOP |

---

## Related Documents

- [Redis Infrastructure SOP](./redis-infrastructure-sop.md) - Full setup and maintenance procedures
- [API Database Deploy SOP](../onboarding/api-db-deploy-sop.md)
- [Dev to Prod Runbook](../onboarding/dev-to-prod-runbook.md)

---

## Session Commits

| Commit | Description |
|--------|-------------|
| `b697e784` | fix: add synchronous fallback for Golden PETL import when Redis unavailable |
| `699bce9c` | feat: add Redis caching for Golden PETL and Field Security |
| `c318e9f6` | docs: add Redis infrastructure SOP |
| `89c0d3c4` | docs: update cloud-run-api.yaml to clarify it's a template |
| `31802bbf` | docs: update Redis SOP with repeatable setup and troubleshooting |
