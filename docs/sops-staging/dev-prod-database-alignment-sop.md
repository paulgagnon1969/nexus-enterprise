---
title: "Dev/Prod Database Alignment SOP"
module: dev-environment
revision: "1.0"
tags: [sop, database, dev-environment, docker, postgres, migration]
status: draft
created: 2026-03-03
updated: 2026-03-03
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# Dev/Prod Database Alignment SOP

## Purpose
Documents the process for aligning local development and production database environments on Mac Studio after migrating away from GCP Cloud SQL. Ensures both environments use identical credentials and allows dev to be refreshed from production data.

## Who Uses This
- Developers setting up or resetting local dev environment
- DevOps managing the Mac Studio production stack
- Anyone troubleshooting database authentication issues

## Context: Post-GCP Architecture

As of March 2026, Nexus Enterprise has migrated from GCP Cloud Run + Cloud SQL to a **fully local architecture** on Mac Studio:

### Shadow Stack (Production)
**Purpose:** Production environment exposed to internet via Cloudflare Tunnel

| Service | Container | Port | Purpose |
|---------|-----------|------|---------|
| API | `nexus-shadow-api` | 8000 | Production API |
| Worker | `nexus-shadow-worker` | Internal | Background jobs |
| Web | `nexus-shadow-web` | 3001 | Production web UI |
| Postgres | `nexus-shadow-postgres` | 5435 | **Production database** |
| Redis | `nexus-shadow-redis` | 6381 | Cache/queues |
| MinIO | `nexus-shadow-minio` | 9000/9001 | S3-compatible storage |
| Cloudflared | `nexus-shadow-tunnel` | - | Cloudflare tunnel |

**Compose file:** `infra/docker/docker-compose.shadow.yml`
**Credentials:** Stored in `.env.shadow` (git-ignored)

### Dev Stack (Local Development)
**Purpose:** Local development environment (not exposed to internet)

| Service | Process/Container | Port | Purpose |
|---------|------------------|------|---------|
| API | `nodemon` (not Docker) | 8001 | Dev API with hot-reload |
| Worker | `nodemon` (not Docker) | - | Dev worker |
| Web | `next dev` (not Docker) | 3000 | Dev web with HMR |
| Postgres | `nexus-postgres` | 5433 | **Dev database** |
| Redis | `nexus-redis` | 6380 | Dev cache |

**Compose file:** `infra/docker/docker-compose.yml`
**Startup:** `scripts/dev-nuke-restart.sh` → `scripts/dev-start.sh`

## Problem: Credential Mismatch

### Original Issue
Development database volume had **old/wrong credentials** from previous GCP-era setup:
- Dev compose file specified: `POSTGRES_PASSWORD: nexus_password`
- Actual volume data used: Unknown legacy password
- Shadow/prod used: `POSTGRES_PASSWORD: nexus_shadow_2026`

Result: Dev API couldn't authenticate → `P1000: password authentication failed for user "nexus_user"`

### Root Cause
The `nexus-postgres` Docker volume (`docker_nexus-postgres-data`) was created before credential standardization. When Postgres starts with an existing data directory, it **ignores** `POSTGRES_PASSWORD` env var and uses whatever password is baked into the volume.

## Solution: Unified Credentials + Data Clone

### Step 1: Align Dev Credentials with Shadow/Prod

Update `infra/docker/docker-compose.yml` to match shadow credentials:

```yaml
services:
  postgres:
    image: postgres:18
    container_name: nexus-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: nexus_user
      POSTGRES_PASSWORD: nexus_shadow_2026  # Match shadow
      POSTGRES_DB: nexus_db
    ports:
      - "5433:5432"
    volumes:
      - nexus-postgres-data:/var/lib/postgresql/data
```

### Step 2: Reset Dev Database Volume

**WARNING:** This wipes local dev data. Only proceed if you're okay losing uncommitted dev changes.

```bash
# Stop all dev processes
bash scripts/dev-nuke-restart.sh --nuke

# Remove the broken dev volume (NOT shadow!)
docker volume rm docker_nexus-postgres-data

# If volume is in use, force remove the container first
docker rm -f nexus-postgres
docker volume rm docker_nexus-postgres-data
```

### Step 3: Start Fresh Dev Infrastructure

```bash
# Start dev Postgres + Redis with new credentials
docker compose -f infra/docker/docker-compose.yml up -d

# Wait for Postgres to initialize
sleep 5

# Verify Postgres is healthy
docker exec nexus-postgres pg_isready -U nexus_user -d nexus_db
```

### Step 4: Clone Production Data to Dev

```bash
# Dump production data from shadow
docker exec nexus-shadow-postgres pg_dump \
  -U nexus_user \
  -d nexus_db \
  --no-owner \
  --no-acl \
  -F c \
  -f /tmp/prod-snapshot.dump

# Copy dump out of container
docker cp nexus-shadow-postgres:/tmp/prod-snapshot.dump /tmp/prod-snapshot.dump

# Restore into dev database
docker exec -i nexus-postgres pg_restore \
  -U nexus_user \
  -d nexus_db \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  < /tmp/prod-snapshot.dump

# Clean up dump file
rm /tmp/prod-snapshot.dump
docker exec nexus-shadow-postgres rm /tmp/prod-snapshot.dump
```

### Step 5: Update Root .env File

Update `DATABASE_URL` in `/Users/pg/nexus-enterprise/.env`:

```bash
DATABASE_URL="postgresql://nexus_user:nexus_shadow_2026@localhost:5433/nexus_db?schema=public"
```

### Step 6: Verify Dev Stack

```bash
# Start dev API + worker + web
bash scripts/dev-start.sh

# Wait for services to boot
sleep 10

# Health check
curl http://localhost:8001/health
curl http://localhost:8001/health/deps

# Expected response:
# {"ok":true,"db":"ok","redis":"PONG","time":"..."}
```

## Workflow Diagram

```mermaid
flowchart TD
    A[Problem: Dev DB auth fails] --> B[Stop dev stack]
    B --> C[Update docker-compose.yml credentials]
    C --> D[Remove docker_nexus-postgres-data volume]
    D --> E[Start fresh dev Postgres]
    E --> F[Dump prod data from shadow]
    F --> G[Restore dump into dev]
    G --> H[Update .env DATABASE_URL]
    H --> I[Start dev stack]
    I --> J{Health checks pass?}
    J -->|Yes| K[✅ Dev aligned with prod]
    J -->|No| L[Check logs/api-dev.log]
    L --> M[Fix issues]
    M --> I

    style A fill:#dc2626,stroke:#b91c1c,color:#fff
    style K fill:#16a34a,stroke:#15803d,color:#fff
```

## Key Commands Reference

### Check Database Credentials
```bash
# Shadow/prod credentials
grep SHADOW_PG /Users/pg/nexus-enterprise/.env.shadow

# Dev credentials (in compose file)
grep POSTGRES_PASSWORD /Users/pg/nexus-enterprise/infra/docker/docker-compose.yml
```

### Test Database Connection
```bash
# Shadow/prod
docker exec nexus-shadow-postgres psql -U nexus_user -d nexus_db -c "SELECT current_database(), current_user;"

# Dev
docker exec nexus-postgres psql -U nexus_user -d nexus_db -c "SELECT current_database(), current_user;"
```

### List Docker Volumes
```bash
# All nexus volumes
docker volume ls | grep nexus

# Check volume details
docker volume inspect docker_nexus-postgres-data
```

### Refresh Dev from Prod (Quick)
```bash
# One-liner to refresh dev data from prod
docker exec nexus-shadow-postgres pg_dump -U nexus_user -d nexus_db --no-owner --no-acl -F c | \
  docker exec -i nexus-postgres pg_restore -U nexus_user -d nexus_db --clean --if-exists --no-owner --no-acl
```

## Troubleshooting

### Issue: Volume won't delete ("volume is in use")
```bash
# Force stop and remove container first
docker rm -f nexus-postgres
docker volume rm docker_nexus-postgres-data
```

### Issue: pg_restore fails with "already exists"
Add `--clean --if-exists` flags (already in commands above). These drop existing objects before restoring.

### Issue: Dev API still can't connect after reset
1. Check `.env` has correct `DATABASE_URL`
2. Verify `nexus-postgres` container is running: `docker ps | grep nexus-postgres`
3. Check API logs: `tail -f logs/api-dev.log`
4. Manually test connection:
   ```bash
   PGPASSWORD=nexus_shadow_2026 psql -h localhost -p 5433 -U nexus_user -d nexus_db -c "SELECT 1;"
   ```

### Issue: Shadow/prod stopped working after changes
**NEVER touch shadow volumes or credentials.** If you accidentally modified them:
1. Check `.env.shadow` is intact
2. Restart shadow stack: `docker compose -f infra/docker/docker-compose.shadow.yml restart`
3. Check Cloudflare tunnel is healthy

## Related Files

**Docker Compose:**
- `infra/docker/docker-compose.yml` — Dev stack
- `infra/docker/docker-compose.shadow.yml` — Prod stack

**Startup Scripts:**
- `scripts/dev-nuke-restart.sh` — Kill all dev processes + restart
- `scripts/dev-start.sh` — Start dev API + worker + web
- `scripts/dev-start-cloud.sh` — (Legacy GCP Cloud SQL mode)

**Environment:**
- `.env` — Root environment (dev DATABASE_URL)
- `.env.shadow` — Shadow/prod credentials (git-ignored)
- `apps/web/.env.local` — Web API URL

## Security Notes

- `.env.shadow` is **git-ignored** and contains production secrets
- Never commit real credentials to the repo
- The password `nexus_shadow_2026` should be rotated periodically
- Shadow/prod database is only accessible via Cloudflare tunnel (not exposed on LAN)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-03 | Initial release — documents credential alignment, volume reset, and prod-to-dev cloning workflow |
