---
title: "Production Deployment SOP (Local Mac Studio)"
module: cicd-deployment
revision: "1.2"
tags: [sop, deployment, local-production, docker, docker-compose, cloudflare, devops, admin, prisma, migrations]
status: draft
created: 2026-02-27
updated: 2026-03-08
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

## Compose Project Names

Both compose files now have a top-level `name:` property (`nexus-shadow` / `nexus-dev`), so Docker always places containers on the correct project network regardless of how compose is invoked. The `-p` flag is no longer required.

## Deploy Procedure (Local Production)

**Always use the deploy script** — it handles env loading, image builds, container restarts, Postgres readiness checks, migrations, and health verification in the correct order.

### Standard Deploys

```bash
# API + Worker (most common — after backend code changes):
npm run deploy:shadow

# Web only (after frontend changes):
npm run deploy:shadow:web

# Everything (rare — full rebuild):
npm run deploy:shadow:all
```

The script (`scripts/deploy-shadow.sh`) performs these steps automatically:
1. Loads `.env.shadow` so secrets interpolate into compose `environment:` blocks
2. Builds images with `--no-cache`
3. Removes old containers and starts new ones (with `--no-deps` to avoid touching data stores)
4. Waits for containers to become healthy (up to 60s)
5. Waits for Postgres on `:5435` to accept connections via `pg_isready` (up to 60s)
6. Runs `prisma migrate deploy` against the production database
7. Verifies external health endpoints (`staging-api.nfsgrp.com`, `staging-ncc.nfsgrp.com`)

### Verify Health

```bash
# Container status
docker ps --filter name=nexus-shadow --format 'table {{.Names}}\t{{.Status}}'

# API health (local)
curl -s http://localhost:8000/health

# API health (public, via tunnel)
curl -s https://staging-api.nfsgrp.com/health

# Worker health (internal only)
curl -s http://localhost:8001/health
```

### Check Logs
```bash
docker logs nexus-shadow-api --tail 200 -f
docker logs nexus-shadow-worker --tail 50 -f
```

## Database Migrations (Local Production)

### Automatic (Default)

Migrations run **automatically** as part of `npm run deploy:shadow` (step 6 above). The script:
1. Waits for Postgres on `:5435` to be ready via `pg_isready` before attempting any migration
2. Runs `prisma migrate deploy` with full output visible
3. Prints a clear success/failure message
4. Does **not** abort the deploy if migration fails — containers stay running so you can investigate

### Manual (Fallback)

If automatic migration failed or you need to run migrations independently:
```bash
set -a; source .env.shadow; set +a
DATABASE_URL="postgresql://${SHADOW_PG_USER:-nexus_user}:${SHADOW_PG_PASSWORD}@localhost:5435/NEXUSPRODv3" \
  npx prisma migrate deploy --config packages/database/prisma.config.ts
```

After manual migration, redeploy to ensure API + Worker pick up the new schema:
```bash
npm run deploy:shadow
```

### Why Migrations Can Fail

- **Postgres not ready** — If Postgres was restarted (by health monitor, Docker cycling, etc.) the connection may not be available when the migration runs. The deploy script now gates on `pg_isready` to prevent this.
- **Connection storm** — Force-removing the old API container drops all its PG connections. The new API + Worker containers then open fresh connection pools simultaneously, which can briefly saturate Postgres right when the migration tries to connect.
- **Schema drift** — If manual SQL or `db push` was applied outside the migration history, `migrate deploy` can fail with a drift error. Fix by creating a proper migration that brings history in sync.

### Safety Rules

- **Never** use `prisma db push --force-reset` or `prisma migrate reset` on production
- **Never** use any command with `--force` or `reset` flags against the production database
- Always prefer `prisma migrate deploy` (applies pending migrations only, no destructive actions)

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
| 1.2 | 2026-03-08 | Added Postgres readiness gate before migrations, documented migration failure modes and manual recovery, updated deploy procedure to use deploy script instead of raw compose commands. |
| 1.1 | 2026-03-03 | Updated SOP for local Mac Studio production deployment (Docker Compose + Cloudflare Tunnel). Removed deprecated GCP Cloud Run/Cloud SQL instructions. |
| 1.0 | 2026-02-27 | Initial release — Cloud Run/Cloud SQL CI/CD workflow (now legacy). |
