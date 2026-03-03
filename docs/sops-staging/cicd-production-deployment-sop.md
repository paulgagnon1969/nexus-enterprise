---
title: "Production Deployment SOP (Local Mac Studio)"
module: cicd-deployment
revision: "1.1"
tags: [sop, deployment, local-production, docker, docker-compose, cloudflare, devops, admin]
status: draft
created: 2026-02-27
updated: 2026-03-03
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# Production Deployment (Local Mac Studio)

## Purpose
As of **March 2026**, Nexus production runs **locally on the Mac Studio** (Docker Compose) behind a Cloudflare Tunnel. This SOP documents the **current** production deployment workflow.

Any Cloud Run / Cloud SQL / `gcloud` deployment instructions are **legacy** and should not be used for current production.

## Who Uses This
- DevOps / Admins managing the Mac Studio production stack
- Developers deploying changes to production
- On-call engineers troubleshooting deploy issues

## Current Production Architecture (Local)

### Shadow Stack (Production)
Production runs via Docker Compose:
- Compose file: `infra/docker/docker-compose.shadow.yml`
- Env file: `.env.shadow` (git-ignored)
- Cloudflare Tunnel config: `infra/cloudflared/config.yml`

Primary containers:
- `nexus-shadow-api` — host port **8000**
- `nexus-shadow-worker` — internal (health on 8001 inside container)
- `nexus-shadow-web` — host port **3001**
- `nexus-shadow-postgres` — host port **5435** (DB: `NEXUSPRODv3`)
- `nexus-shadow-redis` — host port **6381**
- `nexus-shadow-minio` — host ports **9000/9001**
- `nexus-shadow-tunnel` — Cloudflare Tunnel

### Dev Stack (Local Development)
Local dev infra runs via Docker Compose:
- Compose file: `infra/docker/docker-compose.yml`

Primary containers:
- `nexus-postgres` — host port **5433** (DB: `NEXUSDEVv3`)
- `nexus-redis` — host port **6380**

The dev API/web run as local processes:
- API dev server: `localhost:8001`
- Web dev server: `localhost:3000`

## CRITICAL: Always Use Compose Project Names

Both compose files live in `infra/docker/`, so Docker will otherwise reuse the same default project name and cross-contaminate containers.

Use:
```bash
# Production
docker compose -p nexus-shadow -f infra/docker/docker-compose.shadow.yml --env-file .env.shadow up -d

# Development
docker compose -p nexus-dev -f infra/docker/docker-compose.yml up -d
```

## Deploy Procedure (Local Production)

### Step 1: Pull Latest Code
```bash
git pull origin main
```

### Step 2: Rebuild and Restart Containers
Rebuild only the services that changed.

API + Worker:
```bash
docker compose -p nexus-shadow \
  -f infra/docker/docker-compose.shadow.yml \
  --env-file .env.shadow \
  up -d --build api worker
```

Web:
```bash
docker compose -p nexus-shadow \
  -f infra/docker/docker-compose.shadow.yml \
  --env-file .env.shadow \
  up -d --build web
```

If you changed `infra/cloudflared/config.yml`:
```bash
docker compose -p nexus-shadow \
  -f infra/docker/docker-compose.shadow.yml \
  --env-file .env.shadow \
  up -d cloudflared
```

### Step 3: Verify Health
Local health:
```bash
curl -s http://localhost:8000/health
```

Public health (via tunnel) depends on `infra/cloudflared/config.yml` hostnames.

### Step 4: Check Logs (if needed)
```bash
docker logs nexus-shadow-api --tail 200
```

## Database Migrations (Local Production)

Run Prisma migrations from `packages/database` (Prisma config lives there).

1. Ensure you have a correct `DATABASE_URL` for local prod.
2. Run:
```bash
npm -w @repo/database exec -- npx prisma migrate deploy
```

**Safety:** Never use destructive Prisma commands (reset/force) on production.

## Troubleshooting

### Shadow Postgres Fails to Start (Postgres 18 volume layout)
If Postgres is in a restart loop complaining about `/var/lib/postgresql/data (unused mount/volume)`, the volume mount is wrong.

`infra/docker/docker-compose.shadow.yml` must mount:
```yaml
- nexus-shadow-postgres-data:/var/lib/postgresql
```

### Tunnel Up, But No External Traffic
- Verify DNS points at Cloudflare
- Verify `cloudflared` logs:
```bash
docker logs nexus-shadow-tunnel --tail 200
```

### Compose Conflicts / Containers Recreated Unexpectedly
This almost always means a compose command was run without `-p nexus-shadow` / `-p nexus-dev`.

## Legacy Reference (GCP Cloud Run / Cloud SQL)

Prior to March 2026, production deployed to GCP Cloud Run and used Cloud SQL. Those instructions are deprecated and intentionally removed from this SOP to avoid confusion.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.1 | 2026-03-03 | Updated SOP for local Mac Studio production deployment (Docker Compose + Cloudflare Tunnel). Removed deprecated GCP Cloud Run/Cloud SQL instructions. |
| 1.0 | 2026-02-27 | Initial release — Cloud Run/Cloud SQL CI/CD workflow (now legacy). |
