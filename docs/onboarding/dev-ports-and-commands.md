# Dev Ports & Core Commands

Short guide to keep local dev ports and commands consistent.

## Canonical Local Ports

These are the standard ports for local development.

- API Dev (NestJS, apps/api): http://localhost:8001
- API Prod (local test): http://localhost:8000
- Web (Next.js, apps/web): http://localhost:3000
- Postgres (Docker dev): localhost:5433 (container 5432)
- Redis (Docker dev): localhost:6380 (container 6379)

> **Note:** Dev uses 8001 so it doesn't conflict with prod builds tested locally on 8000.

## Normal Dev Start

From the repo root:

```bash
cd /Users/pg/nexus-enterprise
bash ./scripts/dev-clean-env.sh
```

This will:
- Kill any old dev servers (API, web, worker, Cloud SQL proxy).
- Verify ports 3000 and 8000 are free.
- Ensure Docker Postgres/Redis are running.
- Start API on 8000 and web on 3000.

## Manual Start (if needed)

In two terminals:

```bash
# Terminal 1 – API (dev on 8001)
cd /Users/pg/nexus-enterprise/apps/api
npm run dev  # uses API_PORT=8001 from .env

# Terminal 2 – Web
cd /Users/pg/nexus-enterprise/apps/web
npm run dev
```

## Quick Health Checks

API health:

```bash
curl -sS http://localhost:8001/health | jq
```

If this fails with `Connection refused`, the API is not running or not bound to 8001.

Web health:

- Visit http://localhost:3000 in the browser.

## Browser Errors Cheat Sheet

- `net::ERR_CONNECTION_REFUSED` to `http://localhost:8001/...`
  - Nothing is listening on port 8001.
  - Fix: run `bash ./scripts/dev-clean-env.sh` from the repo root.

- HTTP 4xx/5xx from `http://localhost:8001/...`
  - API is reachable; investigate request/response details instead of ports.

## Guardrails

- Dev API runs on 8001, prod (local test) on 8000.
- Web app points to 8001 for dev (via NEXT_PUBLIC_API_BASE_URL in .env.local).
- To test a prod build locally: `API_PORT=8000 npm start -w apps/api`
