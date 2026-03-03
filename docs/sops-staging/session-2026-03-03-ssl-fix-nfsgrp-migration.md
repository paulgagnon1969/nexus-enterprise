---
title: "Session Summary: SSL Fix & nfsgrp.com Migration"
date: 2026-03-03
tags: [session, cloudflare, ssl, dns, production, dev-environment]
status: complete
---

# Session Summary: SSL Fix & nfsgrp.com Migration
**Date:** March 3, 2026
**Duration:** ~6 hours
**Status:** ✅ Complete - Both Dev & Prod Working

## Executive Summary

Successfully migrated production from multi-level subdomains with SSL issues to clean single-level subdomains with automatic SSL. Fixed dev database authentication and established parallel dev/prod environments running simultaneously on Mac Studio.

## Problems Solved

### 1. Multi-Level Subdomain SSL Coverage
**Problem:** 
- `api-staging.ncc-nexus-contractor-connect.com` (3 levels)
- `staging.ncc-nexus-contractor-connect.com` (2 levels)
- Not covered by Cloudflare Universal SSL (free tier)
- Users seeing SSL warnings

**Solution:**
- Migrated to `nfsgrp.com` (simpler apex domain)
- Used single-level subdomains:
  - `staging-api.nfsgrp.com` (1 level) ✅
  - `staging-ncc.nfsgrp.com` (1 level) ✅
- Automatic SSL coverage with Universal SSL

### 2. Dev Database Authentication Failure
**Problem:**
- `dev-nuke-restart.sh` failing
- API logs: `password authentication failed for user "nexus_user"`
- Dev Postgres volume had old/wrong credentials

**Root Cause:**
- Docker volume `docker_nexus-postgres-data` created during GCP era
- When Postgres starts with existing data, it ignores new `POSTGRES_PASSWORD` env var

**Solution:**
- Aligned dev credentials with shadow/prod: `nexus_shadow_2026`
- Reset dev volume and cloned production data

### 3. Dev Stack Not Starting
**Problem:**
- Needed dev and prod to run simultaneously
- Port conflicts possible

**Solution:**
- Prod (shadow) uses: 8000, 3001, 5435, 6381
- Dev uses: 8001, 3000, 5433, 6380
- No conflicts, both run in parallel

## Implementation Steps Completed

### Phase 1: Domain Migration (1 hour)

1. **Added nfsgrp.com to Cloudflare**
   - Onboarded domain to Cloudflare account
   - Selected Free plan
   - Skipped DNS import (no existing records)

2. **Updated Nameservers at Squarespace**
   - Old: `anita.ns.cloudflare.com`, `phil.ns.cloudflare.com`
   - New: `nova.ns.cloudflare.com`, `yevgen.ns.cloudflare.com`
   - DNS propagation: ~3 minutes (very fast!)

3. **Domain became Active**
   - Cloudflare email notification received
   - Universal SSL certificate auto-issued

### Phase 2: Tunnel & DNS Configuration (30 minutes)

1. **Updated Cloudflare Tunnel Config**
   - File: `infra/cloudflared/config.yml`
   - Changed hostnames:
     - `staging.ncc.nfsgrp.com` → `staging-ncc.nfsgrp.com`
     - `api-staging.ncc.nfsgrp.com` → `staging-api.nfsgrp.com`

2. **Updated Shadow Compose Build Args**
   - File: `infra/docker/docker-compose.shadow.yml`
   - Changed API URL: `https://staging-api.nfsgrp.com`

3. **Added DNS Records in Cloudflare**
   - Type: CNAME
   - Targets: `f2959e74-843b-4190-b444-36cda0dceeb7.cfargotunnel.com`
   - Records:
     - `staging-api.nfsgrp.com` (API)
     - `staging-ncc.nfsgrp.com` (Web)
   - Proxy: Enabled (orange cloud)

4. **Restarted Cloudflare Tunnel**
   ```bash
   docker restart nexus-shadow-tunnel
   ```
   - 4 connections established to Cloudflare edge

### Phase 3: Web Container Rebuild (2 hours)

**Challenge:** Web container had old API URL baked in

**Steps:**
1. Rebuilt web with `--no-cache` flag
2. Started on wrong network initially (`docker_default`)
3. Moved to correct network (`nexus-shadow_default`)
4. Added network alias `web` for tunnel to find it
5. Final command:
   ```bash
   docker run -d --name nexus-shadow-web \
     --network nexus-shadow_default \
     --network-alias web \
     -p 3001:3000 \
     docker-web:latest
   ```

### Phase 4: Dev Stack Setup (1 hour)

1. **Started Dev Stack**
   ```bash
   bash scripts/dev-start.sh
   ```

2. **Verified Services**
   - API: `http://localhost:8001/health` ✅
   - Web: `http://localhost:3000` ✅
   - Worker: Running via nodemon ✅

## Final Architecture

### Production (Shadow) Stack
**Purpose:** Live production environment on Mac Studio, exposed to internet

| Service | URL/Port | Container | Purpose |
|---------|----------|-----------|---------|
| Web | https://staging-ncc.nfsgrp.com (port 3001) | nexus-shadow-web | Production web UI |
| API | https://staging-api.nfsgrp.com (port 8000) | nexus-shadow-api | Production API |
| Worker | Internal (port 8001) | nexus-shadow-worker | Background jobs |
| Postgres | Port 5435 | nexus-shadow-postgres | Production database |
| Redis | Port 6381 | nexus-shadow-redis | Cache/queues |
| MinIO | Ports 9000/9001 | nexus-shadow-minio | S3-compatible storage |
| Tunnel | N/A | nexus-shadow-tunnel | Cloudflare tunnel |

**Access:** Public internet via Cloudflare Tunnel
**SSL:** Automatic via Cloudflare Universal SSL
**Database:** Production data

### Dev Stack
**Purpose:** Local development with hot reload

| Service | URL/Port | Process | Purpose |
|---------|----------|---------|---------|
| Web | http://localhost:3000 | next dev | Dev web with HMR |
| API | http://localhost:8001 | nodemon | Dev API with hot reload |
| Worker | Internal | nodemon | Dev worker |
| Postgres | Port 5433 | nexus-postgres (Docker) | Dev database (clone of prod) |
| Redis | Port 6380 | nexus-redis (Docker) | Dev cache |

**Access:** Local only (localhost)
**Database:** Clone of production data
**Hot Reload:** Enabled (changes auto-refresh)

## Key Configuration Files

### Updated Files
- ✅ `infra/cloudflared/config.yml` - Tunnel hostnames
- ✅ `infra/docker/docker-compose.shadow.yml` - Shadow compose config
- ✅ `infra/docker/docker-compose.yml` - Dev Postgres credentials

### Environment Files
- `.env` - Root environment (dev DATABASE_URL)
- `.env.shadow` - Shadow/prod credentials (git-ignored)
- `apps/web/.env.local` - Web dev API URL

## Verification & Testing

### Production Tests
```bash
# DNS resolution
nslookup staging-ncc.nfsgrp.com
nslookup staging-api.nfsgrp.com

# SSL & HTTP
curl -I https://staging-ncc.nfsgrp.com
curl -I https://staging-api.nfsgrp.com/health

# API health
curl https://staging-api.nfsgrp.com/health
# Expected: {"ok":true,"time":"..."}
```

### Dev Tests
```bash
# API health
curl http://localhost:8001/health
# Expected: {"ok":true,"time":"..."}

# Web
curl -I http://localhost:3000
# Expected: HTTP/1.1 200 OK
```

### Browser Tests
- ✅ Production: https://staging-ncc.nfsgrp.com - Login works, no SSL warnings
- ✅ Dev: http://localhost:3000 - Login works, hot reload active

## Documentation Created

1. **Cloudflare SSL Domain Flattening SOP**
   - File: `docs/sops-staging/cloudflare-ssl-domain-flattening-sop.md`
   - Full explanation of SSL issue
   - Step-by-step implementation
   - Troubleshooting guide
   - Alternative solutions analysis

2. **Quick Reference Commands**
   - File: `docs/sops-staging/cloudflare-dns-update-commands.md`
   - Commands ready to copy/paste
   - Verification steps

3. **nfsgrp.com Activation Next Steps**
   - File: `docs/sops-staging/nfsgrp-activation-next-steps.md`
   - Post-activation checklist
   - Troubleshooting

4. **Dev/Prod Database Alignment SOP**
   - File: `docs/sops-staging/dev-prod-database-alignment-sop.md`
   - Credential unification process
   - Volume reset procedure
   - Data cloning workflow

5. **Dev Database Auth Fix Session**
   - File: `docs/sops-staging/session-2026-03-03-dev-db-auth-fix.md`
   - Investigation timeline
   - Root cause analysis
   - Solution documentation

## Lessons Learned

### 1. Docker Volume Persistence
- Postgres volumes persist credentials even when env vars change
- Must delete volume to reset credentials
- Always document what credentials a volume was created with

### 2. Cloudflare Universal SSL Limitations
- Only covers apex + one-level subdomains
- Multi-level subdomains require paid plans or custom certs
- Domain flattening is free and effective solution

### 3. Docker Network Aliases
- Containers need network aliases to be discoverable by hostname
- `--network-alias` flag crucial for inter-container communication
- Tunnel configs reference hostnames, not container names

### 4. Next.js Build-Time Variables
- `NEXT_PUBLIC_*` vars are baked into build at compile time
- Restarting container doesn't pick up new env vars
- Must rebuild image to change API URL

### 5. Dev/Prod Port Separation
- Clear port separation allows parallel operation
- Documented in WARP.md for future reference
- No conflicts when properly planned

## Current Status

### ✅ Working
- Production web app on https://staging-ncc.nfsgrp.com
- Production API on https://staging-api.nfsgrp.com
- Valid SSL certificates (Universal SSL)
- Dev stack on localhost:3000 and localhost:8001
- Both environments running simultaneously
- Dev database cloned from production

### 📋 Future Tasks

1. **Old Domain Deprecation**
   - Monitor `ncc-nexus-contractor-connect.com` usage
   - After 1-2 weeks of stable operation, delete old tunnel hostnames
   - Update any external links/bookmarks

2. **WARP.md Update**
   - Document post-GCP architecture
   - Mark GCP-era docs as legacy
   - Update production URLs in WARP.md

3. **Backup Strategy**
   - Implement automated backups for shadow/prod database
   - Consider pg_dump cron job
   - Document restore procedure

4. **Monitoring**
   - Set up Cloudflare alerts for tunnel health
   - Monitor SSL certificate renewal (automatic, but good to verify)
   - Track production error rates

## Commands Reference

### Start Dev Stack
```bash
bash scripts/dev-nuke-restart.sh
# OR
bash scripts/dev-start.sh
```

### Restart Production Services
```bash
# Restart tunnel
docker restart nexus-shadow-tunnel

# Rebuild and restart web
docker compose -f infra/docker/docker-compose.shadow.yml build web
docker rm -f nexus-shadow-web
docker run -d --name nexus-shadow-web \
  --network nexus-shadow_default \
  --network-alias web \
  -p 3001:3000 \
  docker-web:latest

# Restart API
docker restart nexus-shadow-api

# Restart worker
docker restart nexus-shadow-worker
```

### Check Status
```bash
# All shadow containers
docker ps | grep nexus-shadow

# Tunnel logs
docker logs nexus-shadow-tunnel --tail 50

# API logs
docker logs nexus-shadow-api --tail 50

# Web logs
docker logs nexus-shadow-web --tail 50
```

## Related Documentation

- **Cloudflare SSL SOP:** `docs/sops-staging/cloudflare-ssl-domain-flattening-sop.md`
- **Dev/Prod Alignment:** `docs/sops-staging/dev-prod-database-alignment-sop.md`
- **Local Migration:** `docs/architecture/local-mac-server-migration.md`
- **WARP.md:** Root-level development guide

## Acknowledgments

Session successfully completed with:
- Zero data loss
- Minimal downtime (< 5 minutes during web container rebuild)
- Both dev and prod environments fully operational
- Complete documentation for future reference

**Total Time:** ~6 hours (including investigation, implementation, troubleshooting, and documentation)
**Outcome:** ✅ Production stable, Dev operational, SSL fixed, Documentation complete
