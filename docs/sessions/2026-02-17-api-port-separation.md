# Session Log: API Port Separation (Dev vs Prod)
**Date:** 2026-02-17
**Author:** Warp

## Summary
Resolved API port conflicts between dev and prod environments by assigning dedicated ports to each environment.

## Problem
- Both dev and prod API servers were configured to use port 8000
- Running multiple instances (e.g., two terminal tabs, or dev + local prod test) caused conflicts
- The `assertPortAvailable()` check in `main.ts` would fail-fast, but the workflow was disruptive

## Solution
Separated ports by environment:
- **Dev API:** Port 8001
- **Prod API (local test):** Port 8000

This allows both environments to run simultaneously without conflicts.

## Files Changed

### Configuration
| File | Change |
|------|--------|
| `.env` | Added `API_PORT=8001` for dev |
| `apps/web/.env.local` | Changed `NEXT_PUBLIC_API_BASE_URL` to `http://localhost:8001` |

### Scripts
| File | Change |
|------|--------|
| `scripts/dev-start.sh` | Updated to start API on 8001, health checks on 8001 |
| `scripts/dev-clean-env.sh` | Port verification now checks 8001 instead of 8000 |

### Documentation
| File | Change |
|------|--------|
| `docs/onboarding/dev-ports-and-commands.md` | Updated canonical ports, examples, and troubleshooting |

## New Port Layout

| Service | Dev Port | Prod (Local Test) Port |
|---------|----------|------------------------|
| API (NestJS) | 8001 | 8000 |
| Web (Next.js) | 3000 | 3000 |
| Postgres (Docker) | 5433 | 5433 |
| Redis (Docker) | 6380 | 6380 |

## Usage

```bash
# Dev (uses 8001 automatically via .env)
npm run dev:api

# Prod test (override to 8000)
API_PORT=8000 npm start -w apps/api
```

## Verification
- Dev API on 8001: `curl http://localhost:8001/health` → `{"ok":true}`
- Port 8000 remains free for prod testing

## Notes
- The `assertPortAvailable()` function in `apps/api/src/main.ts` provides fail-fast behavior if a port is already in use
- Web app reads `NEXT_PUBLIC_API_BASE_URL` at build time for client-side API calls
- All existing scripts and docs have been updated to reflect the new port assignments
