# Session: Dev Port Migration to 8001

**Date:** 2026-02-17  
**Author:** Warp  
**Status:** Completed

## Summary

Migrated all dev environment scripts to use port 8001 for the API, reserving port 8000 for production. This completes the port separation work started earlier in the day.

## Problem

After the initial port separation commit (`61f05d66`), several scripts were still hardcoded to use port 8000 for dev, causing conflicts with the intended architecture:

- **Dev API** → 8001
- **Prod API** → 8000
- **Web** → 3000

## Investigation

Checked what was running on ports 8000, 8001, and 3000:

```bash
lsof -i :8000,8001,3000 -P -n
```

**Findings:**
- Port 3000: Next.js web app (running)
- Port 8001: Dev API (running)
- Port 8000: Nothing listening (correct - reserved for prod)

Traced the issue via shell history and git log to confirm the port separation was intentional but incomplete in some scripts.

## Files Modified

### 1. `scripts/dev-api-cloud-db.sh`

```diff
- echo "[dev-api-cloud-db] Using DATABASE_URL pointed at Cloud SQL (API_PORT=8000)."
- API_PORT=8000 npm run dev
+ echo "[dev-api-cloud-db] Using DATABASE_URL pointed at Cloud SQL (API_PORT=8001)."
+ API_PORT=8001 npm run dev
```

### 2. `start-ncc.sh`

```diff
- # Starts: Laravel API (8000) + Next.js Web (3001) + Next.js Admin (3000)
+ # Starts: Laravel API (8001) + Next.js Web (3001) + Next.js Admin (3000)

- API_PORT=8000
+ API_PORT=8001
```

### 3. `scripts/dev-start-cloud.sh`

```diff
- NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
+ NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

## Files Already Correct

| File | Setting |
|------|---------|
| `.env` | `API_PORT=8001` ✓ |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:8001` ✓ |
| `apps/api/src/main.ts` | Uses `API_PORT` env var ✓ |
| `scripts/dev-api.sh` | Uses `${API_PORT:-8000}` (inherits from env) ✓ |

## Verification

After restarting the dev stack:

```bash
npx turbo dev --filter=api --filter=web
```

Both services healthy:

| Service | Port | Status |
|---------|------|--------|
| API | 8001 | `{"ok":true}` |
| Web | 3000 | HTTP 200 |

## Port Architecture (Final)

| Environment | API Port | Web Port | Notes |
|-------------|----------|----------|-------|
| Development | 8001 | 3000 | Local Docker DB on 5433 |
| Production | 8000 | — | Cloud Run / Vercel |

## Related Files

- `docs/sessions/2026-02-17-api-port-separation.md` - Initial port separation commit notes
- `docs/onboarding/dev-ports-and-commands.md` - Developer reference
- `docs/onboarding/dev-stack.md` - Full dev environment setup

## Commands Reference

```bash
# Start dev (API + Web)
npm run dev

# Start API only
npm run dev:api

# Start with Cloud SQL
./scripts/dev-start-cloud.sh

# Check what's on ports
lsof -i :8000,8001,3000 -P -n

# Kill dev ports
lsof -ti :8001 :3000 | xargs kill -9
```
