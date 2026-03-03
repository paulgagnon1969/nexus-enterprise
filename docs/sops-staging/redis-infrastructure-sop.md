---
title: "Redis Infrastructure SOP (Local Docker)"
module: redis-infrastructure
revision: "1.3"
tags: [sop, redis, infrastructure, local-production, docker, devops, admin-only]
status: draft
created: 2026-02-20
updated: 2026-03-03
author: Warp
---

# Redis Infrastructure (Local Docker)

## Purpose
This document describes the **current** Redis infrastructure for NCC production and development on the Mac Studio (Docker Compose).

As of **March 2026**, Redis runs locally in Docker containers. The former GCP VM-based Redis setup is archived at `docs/sops-staging/legacy-gcp/redis-infrastructure-sop.md`.

## Current Architecture (Local)

Redis runs as Docker containers in both stacks:

- **Production / Shadow stack**
  - Container: `nexus-shadow-redis`
  - Host port: `6381` → container `6379`
  - Compose: `infra/docker/docker-compose.shadow.yml`
  - Persistence: AOF enabled (`redis-server --appendonly yes`) + Docker volume

- **Development stack**
  - Container: `nexus-redis`
  - Host port: `6380` → container `6379`
  - Compose: `infra/docker/docker-compose.yml`

### Connection Strings

- From host (prod): `redis://localhost:6381`
- From host (dev): `redis://localhost:6380`
- From shadow containers: `redis://redis:6379`

## Operations (Local)

### Health Check
```bash
docker exec nexus-shadow-redis redis-cli ping
```

### Inspect Keys (Prefer SCAN)
```bash
# Avoid KEYS in production — use SCAN
docker exec nexus-shadow-redis redis-cli scan 0 match 'bull:*' count 200
```

### Restart Redis
```bash
docker compose -p nexus-shadow \
  -f infra/docker/docker-compose.shadow.yml \
  --env-file .env.shadow \
  restart redis
```

## Who Uses This

- **DevOps/Admin** — Infrastructure maintenance
- **Backend Developers** — Understanding cache behavior and debugging

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

## Troubleshooting (Local)

### Redis Not Responding
```bash
docker exec nexus-shadow-redis redis-cli ping
# Expected: PONG

# If no response, check container status:
docker ps --filter name=nexus-shadow-redis
```

### Cache Not Invalidating
If cache seems stale, manually flush specific keys:
```bash
docker exec nexus-shadow-redis redis-cli del golden:current golden:table golden:uploads
```

### Dev Redis Stale After Restart
```bash
docker exec nexus-redis redis-cli flushall
```

## Legacy (Archived)
The former GCP VM-based Redis setup (GCE VM `redis-prod`, firewall rules, `gcloud` commands) is archived at `docs/sops-staging/legacy-gcp/redis-infrastructure-sop.md` for posterity.

## Related Documents

- [Shadow Server & Database Clone SOP](shadow-server-db-clone-sop.md)
- [Dev/Prod Database Alignment SOP](dev-prod-database-alignment-sop.md)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.3 | 2026-03-03 | Removed GCP VM content from active SOP; archived at `legacy-gcp/`. Kept only local Docker architecture and operations. |
| 1.2 | 2026-03-03 | Updated SOP to reflect local Docker Redis (Mac Studio prod + dev). Moved GCP VM content under legacy section. |
| 1.1 | 2026-02-20 | Added Fresh Setup section, bind address troubleshooting, lessons learned |
| 1.0 | 2026-02-20 | Initial release - Redis VM setup and maintenance procedures |
