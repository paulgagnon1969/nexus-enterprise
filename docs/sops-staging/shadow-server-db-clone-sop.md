---
title: "Shadow Server & Database Clone SOP"
module: shadow-infrastructure
revision: "1.0"
tags: [sop, shadow-server, database, docker, postgres, local-production, migration, devops, admin]
status: draft
created: 2026-03-03
updated: 2026-03-03
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# Shadow Server & Database Clone SOP

## Purpose
Defines the architecture, startup procedures, and database cloning process for the Nexus production and development stacks running on Mac Studio (M2 Ultra, 192GB RAM). As of March 2026, **all production infrastructure runs locally on the Mac Studio** — GCP Cloud Run and Cloud SQL are legacy and no longer the source of truth. This SOP covers cloning local production data (`NEXUSPRODv3`) into the local development database (`NEXUSDEVv3`).

## Who Uses This
- DevOps / Admins managing the Mac Studio shadow infrastructure
- Developers needing a fresh production data clone for local development
- On-call engineers troubleshooting shadow stack issues

## Architecture Overview

### Infrastructure Layout

The Mac Studio runs two independent Docker Compose stacks side-by-side:

**Shadow Stack (Local Production)** — exposed via Cloudflare Tunnel
- Compose: `infra/docker/docker-compose.shadow.yml`
- Project name: `nexus-shadow`
- Env file: `.env.shadow`

**Dev Stack (Local Development)** — localhost only
- Compose: `infra/docker/docker-compose.yml`
- Project name: `nexus-dev`
- No env file needed (credentials in compose)

### Service Map

**Shadow Stack (nexus-shadow)**
- `nexus-shadow-postgres` — port 5435 — Production DB (`NEXUSPRODv3`)
- `nexus-shadow-redis` — port 6381 — Production cache/queues
- `nexus-shadow-minio` — port 9000/9001 — S3-compatible file storage
- `nexus-shadow-api` — port 8000 — Production NestJS API
- `nexus-shadow-worker` — internal — BullMQ import worker
- `nexus-shadow-web` — port 3001 — Production Next.js web
- `nexus-shadow-tunnel` — Cloudflare tunnel to internet

**Dev Stack (nexus-dev)**
- `nexus-postgres` — port 5433 — Dev DB (`NEXUSDEVv3`)
- `nexus-redis` — port 6380 — Dev cache
- `nexus-postgres-shadow` — port 5434 — Prisma migration shadow DB

### Database Naming Convention

Databases follow the `v3` naming convention (third major version of the platform):
- **`NEXUSPRODv3`** — Production database (shadow stack, port 5435) — **this is the source of truth**
- **`NEXUSDEVv3`** — Development database (dev stack, port 5433) — cloned from prod as needed
- **`nexus_db`** — Legacy GCP Cloud SQL database (no longer active; retained for reference only)

### Storage

Docker disk image and all container volumes live on the external 4TB Thunderbolt drive at `/Volumes/4T Data/docker-data/`. This provides ample room for database and attachment growth.

MinIO buckets mirror GCP GCS:
- `nexus-xact-uploads` — Xactimate estimate files
- `ncc-uploads-prod` — General file uploads (documents, photos, etc.)

## CRITICAL: Docker Compose Project Names

Both compose files live in `infra/docker/`, so Docker assigns them the same default project name. **This causes cross-contamination** — starting one stack can recreate or destroy containers from the other.

**Always use explicit project names:**

```bash
# Shadow stack
docker compose -p nexus-shadow -f infra/docker/docker-compose.shadow.yml --env-file .env.shadow up -d

# Dev stack
docker compose -p nexus-dev -f infra/docker/docker-compose.yml up -d
```

**Never run `docker compose` from `infra/docker/` without `-p`.**

## Procedure: Clone Production to Development

The standard workflow is to clone **NEXUSPRODv3 → NEXUSDEVv3** (local prod → local dev). This gives dev a fresh copy of real production data.

### Prerequisites
- Both Docker stacks running (shadow + dev)
- Shadow API healthy (`curl -s http://localhost:8000/health`)

### Step 1: Dump Local Production Database

```bash
docker exec nexus-shadow-postgres pg_dump \
  -U nexus_user -d NEXUSPRODv3 \
  -Fc --no-owner --no-acl \
  -f /tmp/prod-to-dev.dump

# Copy dump out of container
docker cp nexus-shadow-postgres:/tmp/prod-to-dev.dump /tmp/prod-to-dev.dump
```

### Step 2: Restore to NEXUSDEVv3 (Dev)

```bash
# Terminate existing connections and drop/recreate
docker exec nexus-postgres psql -U nexus_user -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='NEXUSDEVv3' AND pid <> pg_backend_pid();"
docker exec nexus-postgres psql -U nexus_user -d postgres \
  -c 'DROP DATABASE IF EXISTS "NEXUSDEVv3";'
docker exec nexus-postgres psql -U nexus_user -d postgres \
  -c 'CREATE DATABASE "NEXUSDEVv3";'

# Copy dump into dev container and restore
docker cp /tmp/prod-to-dev.dump nexus-postgres:/tmp/prod-to-dev.dump
docker exec nexus-postgres pg_restore \
  -U nexus_user -d NEXUSDEVv3 \
  --no-owner --no-acl \
  /tmp/prod-to-dev.dump
```

### Step 3: Verify

```bash
# Table count (expect 267)
docker exec nexus-postgres psql -U nexus_user -d NEXUSDEVv3 \
  -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
```

### Step 4: Clean Up

```bash
rm /tmp/prod-to-dev.dump
docker exec nexus-shadow-postgres rm -f /tmp/prod-to-dev.dump
docker exec nexus-postgres rm -f /tmp/prod-to-dev.dump
```

## Procedure: One-Time GCP Legacy Import (Reference Only)

This procedure was used during the initial migration from GCP Cloud SQL to the local Mac Studio. It is retained for reference only — GCP is no longer the active production database.

### Prerequisites
- `~/.nexus-prod-env` sourced (contains `PROD_DB_PASSWORD`)
- `cloud-sql-proxy` installed (`brew install cloud-sql-proxy`)
- `gcloud` CLI authenticated

### Dump GCP and Restore Locally

```bash
# Dump from GCP (use port 5436 to avoid killing local Postgres!)
source ~/.nexus-prod-env && \
  /Users/pg/nexus-enterprise/scripts/prod-db-run-with-proxy.sh \
    --port 5436 --no-prompt -- \
  bash -c 'PGPASSWORD=$PROD_DB_PASSWORD pg_dump \
    -h 127.0.0.1 -p 5436 -U postgres -d nexus_db \
    -Fc --no-owner --no-acl \
    -f /tmp/nexus-prod-fresh.dump'

# Restore to local prod
docker exec nexus-shadow-postgres psql -U nexus_user -d postgres \
  -c 'DROP DATABASE IF EXISTS "NEXUSPRODv3";'
docker exec nexus-shadow-postgres psql -U nexus_user -d postgres \
  -c 'CREATE DATABASE "NEXUSPRODv3";'
docker cp /tmp/nexus-prod-fresh.dump nexus-shadow-postgres:/tmp/nexus-prod-fresh.dump
docker exec nexus-shadow-postgres pg_restore \
  -U nexus_user -d NEXUSPRODv3 \
  --no-owner --no-acl /tmp/nexus-prod-fresh.dump

# Restore to local dev
docker exec nexus-postgres psql -U nexus_user -d postgres \
  -c 'DROP DATABASE IF EXISTS "NEXUSDEVv3";'
docker exec nexus-postgres psql -U nexus_user -d postgres \
  -c 'CREATE DATABASE "NEXUSDEVv3";'
docker cp /tmp/nexus-prod-fresh.dump nexus-postgres:/tmp/nexus-prod-fresh.dump
docker exec nexus-postgres pg_restore \
  -U nexus_user -d NEXUSDEVv3 \
  --no-owner --no-acl /tmp/nexus-prod-fresh.dump
```

**CRITICAL:** Use `--port 5436` (or any unused port). The proxy script defaults to 5435, which will kill the shadow Postgres container.

Expected warnings (safe to ignore):
- `extension "google_vacuum_mgmt" does not exist` — GCP-specific extension, not needed locally

## Workflow Diagram

```mermaid
flowchart TD
    A[Start: Need fresh prod data in dev] --> B[pg_dump NEXUSPRODv3 from shadow postgres:5435]
    B --> C[Copy dump to host /tmp/]
    C --> D[Drop + Create NEXUSDEVv3 on dev postgres:5433]
    D --> E[pg_restore dump → NEXUSDEVv3]
    E --> F{267 tables?}
    F -->|Yes| G[✅ Dev restored from prod]
    F -->|No| H[Check pg_restore errors]
    G --> I[Clean up dump files]
    I --> J[✅ Dev in sync with local prod]

    style A fill:#3b82f6,stroke:#2563eb,color:#fff
    style J fill:#16a34a,stroke:#15803d,color:#fff
    style H fill:#dc2626,stroke:#b91c1c,color:#fff
```

## Procedure: Start/Stop Stacks

### Start Shadow Stack
```bash
docker compose -p nexus-shadow \
  -f infra/docker/docker-compose.shadow.yml \
  --env-file .env.shadow up -d
```

### Start Dev Stack
```bash
docker compose -p nexus-dev \
  -f infra/docker/docker-compose.yml up -d
```

### Stop Shadow Stack
```bash
docker compose -p nexus-shadow \
  -f infra/docker/docker-compose.shadow.yml \
  --env-file .env.shadow down
```

### Stop Dev Stack
```bash
docker compose -p nexus-dev \
  -f infra/docker/docker-compose.yml down
```

### Check All Containers
```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## Troubleshooting

### Shadow Postgres Won't Start (Postgres 18 Volume Error)
**Symptom:** Container restart loop with error about `/var/lib/postgresql/data (unused mount/volume)`

**Cause:** Postgres 18 changed its data directory layout. The volume must mount at `/var/lib/postgresql` (not `/var/lib/postgresql/data`).

**Fix:** Ensure `docker-compose.shadow.yml` has:
```yaml
volumes:
  - nexus-shadow-postgres-data:/var/lib/postgresql
```

If the volume has old-format data, remove it and re-restore:
```bash
docker compose -p nexus-shadow -f infra/docker/docker-compose.shadow.yml --env-file .env.shadow down
docker volume rm nexus-shadow_nexus-shadow-postgres-data
docker compose -p nexus-shadow -f infra/docker/docker-compose.shadow.yml --env-file .env.shadow up -d
# Then re-run the restore procedure above
```

### Cloud SQL Proxy Kills Shadow Postgres
**Symptom:** After running `prod-db-run-with-proxy.sh`, shadow postgres is dead.

**Cause:** The proxy script defaults to port 5435 and uses `--allow-kill-port` to kill whatever is listening.

**Fix:** Always pass `--port 5436` (or any unused port) when running the proxy alongside the shadow stack.

### Docker Compose Cross-Contamination
**Symptom:** Starting dev stack recreates/destroys shadow containers (or vice versa).

**Cause:** Both compose files are in `infra/docker/`, sharing the same default project name.

**Fix:** Always use `-p nexus-shadow` or `-p nexus-dev` in every compose command.

### GCP Auth Expired
**Symptom:** `gcloud ADC expired or missing` when running proxy script.

**Fix:** The proxy script auto-refreshes via `scripts/gcp-ensure-auth.sh`. If it opens a browser, complete the OAuth flow. Credentials are cached in `~/.config/gcloud/application_default_credentials.json`.

## Database Credentials Reference

**Dev Stack (port 5433)**
- User: `nexus_user`
- Password: `nexus_password`
- Database: `NEXUSDEVv3`
- URL: `postgresql://nexus_user:nexus_password@localhost:5433/NEXUSDEVv3`

**Shadow/Prod Stack (port 5435)**
- User: `nexus_user`
- Password: (see `.env.shadow` → `SHADOW_PG_PASSWORD`)
- Database: `NEXUSPRODv3`
- URL: (see `.env.shadow` → `DATABASE_URL`)

**GCP Cloud SQL (legacy — no longer active)**
- User: `postgres`
- Password: (see `~/.nexus-prod-env` → `PROD_DB_PASSWORD`)
- Database: `nexus_db`
- Instance: `nexus-enterprise-480610:us-central1:nexusprod-v2`

## Related SOPs
- [Dev/Prod Database Alignment SOP](dev-prod-database-alignment-sop.md)
- [CI/CD Pipeline & Production Deployment SOP](cicd-production-deployment-sop.md)
- [Cloudflare SSL & Domain Flattening SOP](cloudflare-ssl-domain-flattening-sop.md)

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-03 | Initial release — local production stack architecture, prod→dev clone procedure, GCP legacy import reference, Postgres 18 volume fix, project name isolation |
