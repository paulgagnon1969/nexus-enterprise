---
title: "Session Summary: Dev Database Authentication Fix"
date: 2026-03-03
tags: [session, database, docker, authentication, dev-environment]
status: draft
---

# Session Summary: Dev Database Authentication Fix
**Date:** March 3, 2026
**Duration:** ~45 minutes
**Status:** Solution documented, awaiting execution

## Problem Statement

User reported that the dev stack startup script (`dev-nuke-restart.sh`) was failing. Initial symptom was unclear - needed to trace through the entire startup flow to identify the root cause.

## Investigation Process

### 1. Initial Trace
- Examined `dev-nuke-restart.sh` → calls `dev-start.sh`
- Found `dev-start.sh` attempts to start API against local Postgres on port 5433
- API logs showed authentication failures: `password authentication failed for user "nexus_user"`

### 2. Database Credential Audit
- Local dev compose (`infra/docker/docker-compose.yml`) specifies: `POSTGRES_PASSWORD: nexus_password`
- Attempted connection test failed with same auth error
- Discovered Docker volume `docker_nexus-postgres-data` exists but with **unknown legacy credentials**

### 3. Architecture Discovery
User revealed critical context: **Full GCP migration in progress**

The system now has TWO complete stacks running locally:

**Shadow Stack (Production):**
- Compose file: `infra/docker/docker-compose.shadow.yml`
- Exposed to internet via Cloudflare Tunnel
- Database: `nexus-shadow-postgres` on port 5435
- Credentials: `.env.shadow` with `SHADOW_PG_PASSWORD=nexus_shadow_2026`
- **Currently working and serving production traffic**

**Dev Stack (Local Development):**
- Compose file: `infra/docker/docker-compose.yml`
- Not exposed to internet
- Database: `nexus-postgres` on port 5433
- Credentials: Mismatched - compose says `nexus_password` but volume has unknown password
- **Currently broken**

### 4. Root Cause Identified

The `nexus-postgres` volume was created during the GCP era with different credentials. When Postgres starts with an existing data directory, it **ignores** new `POSTGRES_PASSWORD` env vars and uses the password baked into the volume.

## Solution Design

### Goal
Align dev and prod to use **identical credentials** and allow dev to be refreshed from production data.

### Steps

1. **Update dev credentials** - Change `infra/docker/docker-compose.yml` to use `POSTGRES_PASSWORD: nexus_shadow_2026` (match shadow)

2. **Reset dev volume** - Remove `docker_nexus-postgres-data` volume to wipe legacy credentials

3. **Recreate dev infrastructure** - Start fresh Postgres with unified credentials

4. **Clone production data** - Dump from `nexus-shadow-postgres` and restore to `nexus-postgres`

5. **Update .env** - Change `DATABASE_URL` to use `nexus_shadow_2026`

6. **Verify** - Start dev stack and confirm health checks pass

## Key Insights

### Architecture Evolution
- **Old model (GCP):** Cloud SQL dev + Cloud SQL prod (separate instances on GCP)
- **New model (Local):** Local dev DB + Local prod DB (both on Mac Studio)
- The docs were outdated and still referenced GCP Cloud SQL workflows

### Credential Philosophy
- **Before:** Dev and prod had different passwords for safety
- **After:** Dev and prod use **same credentials** since both are local and dev is a clone

### Benefits of New Approach
- ✅ Dev can be refreshed from prod anytime with a simple `pg_dump | pg_restore`
- ✅ No credential mismatches between environments
- ✅ Easier to test against production-like data
- ✅ No network latency (both databases are local)

## Deliverables

1. **SOP Created:** `docs/sops-staging/dev-prod-database-alignment-sop.md`
   - Full step-by-step procedure
   - Troubleshooting guide
   - Command reference
   - Mermaid workflow diagram

2. **Session Summary:** This document

3. **Action Items for User:**
   - Execute the 6-step solution in the SOP
   - Update WARP.md if needed to reflect post-GCP architecture
   - Consider deprecating `dev-start-cloud.sh` (legacy GCP script)

## Commands to Execute

```bash
# 1. Stop dev stack
bash scripts/dev-nuke-restart.sh --nuke

# 2. Update docker-compose.yml (manual edit or via Warp)
# Change POSTGRES_PASSWORD: nexus_password → nexus_shadow_2026

# 3. Remove broken volume
docker rm -f nexus-postgres
docker volume rm docker_nexus-postgres-data

# 4. Start fresh dev infrastructure
docker compose -f infra/docker/docker-compose.yml up -d
sleep 5

# 5. Clone prod → dev
docker exec nexus-shadow-postgres pg_dump -U nexus_user -d nexus_db --no-owner --no-acl -F c -f /tmp/prod-snapshot.dump
docker cp nexus-shadow-postgres:/tmp/prod-snapshot.dump /tmp/prod-snapshot.dump
docker exec -i nexus-postgres pg_restore -U nexus_user -d nexus_db --clean --if-exists --no-owner --no-acl < /tmp/prod-snapshot.dump
rm /tmp/prod-snapshot.dump

# 6. Update .env
# DATABASE_URL="postgresql://nexus_user:nexus_shadow_2026@localhost:5433/nexus_db?schema=public"

# 7. Start dev stack
bash scripts/dev-start.sh

# 8. Verify
curl http://localhost:8001/health
curl http://localhost:8001/health/deps
```

## Files Modified (Pending)

- `infra/docker/docker-compose.yml` - Update POSTGRES_PASSWORD
- `.env` - Update DATABASE_URL with new password

## Related Documentation

- **New SOP:** `docs/sops-staging/dev-prod-database-alignment-sop.md`
- **Shadow compose:** `infra/docker/docker-compose.shadow.yml` (reference only, don't modify)
- **Legacy GCP docs:** `docs/onboarding/envs-and-migrations.md` (may need deprecation notice)

## Next Session Handoff

If another Warp session needs to continue this work:

1. **Context:** Post-GCP migration - both dev and prod are now local on Mac Studio
2. **Status:** Solution documented in SOP, not yet executed
3. **Key file:** `docs/sops-staging/dev-prod-database-alignment-sop.md`
4. **Quick ref:** Shadow (prod) uses `nexus_shadow_2026`, dev currently broken with old password
5. **Action:** Follow the 6-step solution in the SOP

## Lessons Learned

1. **Always check Docker volume history** - Volumes persist credentials even when compose files change
2. **Architecture documentation must be updated** - Old GCP-era docs caused initial confusion
3. **Credential unification is simpler** - When both environments are local, using the same password is actually safer and more practical
4. **"Shadow" naming convention** - Clear separation between prod (shadow) and dev stacks

## Open Questions

1. Should `dev-start-cloud.sh` be deprecated? (It's for GCP Cloud SQL, no longer needed)
2. Should WARP.md be updated with the new local architecture?
3. Is there a backup strategy for the shadow/prod database?
4. Should we add a `scripts/refresh-dev-from-prod.sh` helper script?
