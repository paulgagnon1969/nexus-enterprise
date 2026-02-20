---
title: "Redis Infrastructure SOP"
module: redis-infrastructure
revision: "1.1"
tags: [sop, redis, infrastructure, devops, admin-only]
status: draft
created: 2026-02-20
updated: 2026-02-20
author: Warp
---

# Redis Infrastructure

## Purpose
This document describes the Redis infrastructure for NCC production, including the decision rationale, connection details, and maintenance procedures.

## Architecture Decision

### Why Self-Managed VM vs. Managed Services

We evaluated three options for Redis in production:

| Option | Pros | Cons | Monthly Cost |
|--------|------|------|--------------|
| **GCE VM (chosen)** | Full control, simple setup, no VPC connector needed | Manual maintenance, no auto-failover | ~$13-15 |
| Cloud Memorystore | Managed, auto-failover, GCP native | Requires VPC connector ($7+), higher base cost | ~$40+ |
| Upstash (serverless) | Zero maintenance, pay-per-request | External dependency, potential latency | Variable |

**Decision**: Self-managed GCE VM was chosen because:
1. **Cost efficiency** - Lowest monthly cost for our usage pattern
2. **Simplicity** - No VPC connector configuration required
3. **Control** - Direct access for debugging and tuning
4. **Sufficient for current scale** - NCC's Redis usage (job queues, caching) doesn't require HA yet

**Future consideration**: If Redis becomes critical for real-time features or we need HA, migrate to Memorystore.

## Infrastructure Details

### VM Specification

| Property | Value |
|----------|-------|
| **Name** | `redis-prod` |
| **Zone** | `us-central1-a` |
| **Machine Type** | `e2-small` (2 vCPU, 2GB RAM) |
| **OS** | Ubuntu 22.04 LTS |
| **Disk** | 10GB SSD |
| **Network Tag** | `redis-server` |

### Redis Configuration

| Property | Value |
|----------|-------|
| **Version** | 6.0.16 |
| **Port** | 6379 |
| **Bind Address** | 0.0.0.0 (all interfaces) |
| **Authentication** | Password required |
| **Max Memory** | Default (~1.5GB usable) |
| **Persistence** | RDB snapshots (default) |

### Network Configuration

| Resource | Details |
|----------|---------|
| **Firewall Rule** | `allow-redis-cloudrun` |
| **Allowed Ports** | TCP 6379 |
| **Source Ranges** | 0.0.0.0/0 (Cloud Run IPs are dynamic) |
| **Target Tags** | `redis-server` |

### Connection String

```
redis://:PASSWORD@EXTERNAL_IP:6379
```

The `REDIS_URL` environment variable is configured in Cloud Run via:
```bash
gcloud run services update nexus-api \
  --region=us-central1 \
  --project=nexus-enterprise-480610 \
  --update-env-vars="REDIS_URL=redis://:PASSWORD@EXTERNAL_IP:6379"
```

## Who Uses This

- **DevOps/Admin** - Infrastructure maintenance
- **Backend Developers** - Understanding cache behavior and debugging

## Current Redis Usage

### 1. BullMQ Job Queues
Queue name: `import-jobs`

| Job Type | Description |
|----------|-------------|
| `PRICE_LIST` | Golden PETL imports |
| `COMPANY_PRICE_LIST` | Tenant cost book imports |
| `XACT_RAW` | Xactimate CSV imports |
| `XACT_COMPONENTS` | Components imports |
| `PROJECT_PETL_PERCENT` | Project-level pricing updates |

### 2. API Response Caching

| Cache Key | TTL | Description |
|-----------|-----|-------------|
| `golden:current` | 1 hour | Current Golden price list metadata |
| `golden:table` | 1 hour | Full Golden price list table (~5MB) |
| `golden:uploads` | 1 hour | Recent Golden uploads list |
| `company:{id}:pricelist` | 30 min | Company cost book metadata |
| `company:{id}:fieldsec` | 15 min | Field security policies |

## Fresh Setup / Recreation

If you need to recreate the Redis VM from scratch, follow these steps exactly.

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

Generate a strong password first:
```bash
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
echo "Save this password: $REDIS_PASSWORD"
```

Then SSH in and configure:
```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 --command="
# Install Redis
sudo apt update && sudo apt install -y redis-server

# Configure for remote access - IMPORTANT: use 0.0.0.0, not 127.0.0.1
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf

# Set password (replace YOUR_PASSWORD)
sudo sed -i 's/^# requirepass foobared/requirepass YOUR_PASSWORD/' /etc/redis/redis.conf

# Restart and enable
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Verify
sudo systemctl status redis-server --no-pager
"
```

**⚠️ IMPORTANT**: The bind address MUST be `0.0.0.0` for Cloud Run to connect. Do NOT use `127.0.0.1`.

### Step 3: Create Firewall Rule

```bash
gcloud compute firewall-rules create allow-redis-cloudrun \
  --project=nexus-enterprise-480610 \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:6379 \
  --target-tags=redis-server \
  --source-ranges=0.0.0.0/0 \
  --description="Allow Redis access from Cloud Run"
```

### Step 4: Get External IP and Update Cloud Run

```bash
# Get the VM's external IP
REDIS_IP=$(gcloud compute instances describe redis-prod \
  --zone=us-central1-a \
  --project=nexus-enterprise-480610 \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "Redis IP: $REDIS_IP"

# Update Cloud Run with the Redis URL
gcloud run services update nexus-api \
  --region=us-central1 \
  --project=nexus-enterprise-480610 \
  --update-env-vars="REDIS_URL=redis://:YOUR_PASSWORD@$REDIS_IP:6379"
```

### Step 5: Verify Connection

```bash
# Test from the VM
gcloud compute ssh redis-prod --zone=us-central1-a --command="redis-cli -a YOUR_PASSWORD ping"
# Expected: PONG

# Check Cloud Run logs for Redis errors
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=nexus-api AND textPayload=~'redis'" \
  --project=nexus-enterprise-480610 --limit=10
```

## Maintenance Procedures

### Check Redis Status

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="sudo systemctl status redis-server --no-pager"
```

### View Redis Logs

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="sudo journalctl -u redis-server -n 100 --no-pager"
```

### Test Redis Connection

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="redis-cli -a PASSWORD ping"
```

Expected output: `PONG`

### Check Memory Usage

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="redis-cli -a PASSWORD info memory | grep -E 'used_memory_human|maxmemory_human'"
```

### Apply Security Updates (Monthly)

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="sudo apt update && sudo apt upgrade -y && sudo systemctl restart redis-server"
```

### Restart Redis

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="sudo systemctl restart redis-server"
```

### View Active Keys

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="redis-cli -a PASSWORD keys '*'"
```

### Flush All Cache (Use with caution)

```bash
gcloud compute ssh redis-prod --zone=us-central1-a --project=nexus-enterprise-480610 \
  --command="redis-cli -a PASSWORD flushall"
```

## Troubleshooting

### Redis Not Responding

1. Check if VM is running:
   ```bash
   gcloud compute instances describe redis-prod --zone=us-central1-a --format="get(status)"
   ```

2. If stopped, start it:
   ```bash
   gcloud compute instances start redis-prod --zone=us-central1-a
   ```

3. SSH in and check Redis service:
   ```bash
   gcloud compute ssh redis-prod --zone=us-central1-a \
     --command="sudo systemctl status redis-server"
   ```

### Connection Refused from Cloud Run (ECONNREFUSED)

This is the most common issue. Check these in order:

**1. Verify Redis is bound to 0.0.0.0 (not 127.0.0.1)**

This is the #1 cause of connection failures:
```bash
gcloud compute ssh redis-prod --zone=us-central1-a --command="sudo grep '^bind' /etc/redis/redis.conf"
```

If it shows `bind 127.0.0.1` or `bind 127.0.0.1 ::1`, fix it:
```bash
gcloud compute ssh redis-prod --zone=us-central1-a --command="
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf
sudo systemctl restart redis-server
"
```

**2. Verify firewall rule exists:**
```bash
gcloud compute firewall-rules describe allow-redis-cloudrun
```

**3. Check VM external IP hasn't changed:**
```bash
gcloud compute instances describe redis-prod --zone=us-central1-a \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)"
```

**4. If IP changed, update Cloud Run:**
```bash
gcloud run services update nexus-api --region=us-central1 \
  --update-env-vars="REDIS_URL=redis://:PASSWORD@NEW_IP:6379"
```

**5. Check Cloud Run logs for Redis errors:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=nexus-api AND textPayload=~'redis'" \
  --project=nexus-enterprise-480610 --limit=20 --format="table(timestamp,textPayload)"
```

### High Memory Usage

1. Check memory:
   ```bash
   redis-cli -a PASSWORD info memory
   ```

2. If needed, increase VM size:
   ```bash
   gcloud compute instances stop redis-prod --zone=us-central1-a
   gcloud compute instances set-machine-type redis-prod --zone=us-central1-a --machine-type=e2-medium
   gcloud compute instances start redis-prod --zone=us-central1-a
   ```

### Cache Not Invalidating

Check application logs for invalidation errors:
```
[redis] Invalidated Golden price list cache
[redis] Invalidated cache for company=...
```

If cache seems stale, manually flush specific keys:
```bash
redis-cli -a PASSWORD del golden:current golden:table golden:uploads
```

## Security Considerations

1. **Password Authentication** - Required for all connections
2. **Firewall** - Only port 6379 is exposed
3. **No TLS** - Traffic is unencrypted (acceptable for internal GCP traffic)
4. **Public IP** - Necessary because Cloud Run IPs are dynamic; password provides security

### Future Security Improvements

If security requirements increase:
1. Migrate to VPC-native setup with Memorystore
2. Add IP allowlisting when Cloud Run supports static egress
3. Enable Redis TLS (requires client configuration)

## Disaster Recovery

### Backup (RDB Snapshots)

Redis is configured with default RDB persistence. Snapshots are stored at `/var/lib/redis/dump.rdb`.

To create a manual backup:
```bash
gcloud compute ssh redis-prod --zone=us-central1-a \
  --command="redis-cli -a PASSWORD bgsave && sleep 5 && sudo cp /var/lib/redis/dump.rdb /tmp/redis-backup-$(date +%Y%m%d).rdb"
```

### Recovery

If the VM is lost, recreate it using the setup commands in this document, then restore from backup if needed.

**Note**: For NCC's current use case (caching + job queues), data loss is acceptable - caches rebuild automatically and failed jobs can be re-triggered.

## Lessons Learned

### 2026-02-20: Bind Address Issue

**Problem**: After initial Redis setup, Cloud Run couldn't connect (ECONNREFUSED errors).

**Root Cause**: The `sed` command to change the bind address didn't match the actual format in Ubuntu's redis.conf:
- Expected: `bind 127.0.0.1 -::1`
- Actual: `bind 127.0.0.1 ::1` (no hyphen)

**Solution**: Use a more robust sed pattern:
```bash
sudo sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf
```

**Lesson**: Always verify Redis is listening on the correct interface after setup:
```bash
sudo ss -tlnp | grep 6379
# Should show: *:6379 (all interfaces), NOT 127.0.0.1:6379
```

## Related Documents

- [API Database Deploy SOP](../onboarding/api-db-deploy-sop.md)
- [Dev to Prod Runbook](../onboarding/dev-to-prod-runbook.md)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.1 | 2026-02-20 | Added Fresh Setup section, bind address troubleshooting, lessons learned |
| 1.0 | 2026-02-20 | Initial release - Redis VM setup and maintenance procedures |
