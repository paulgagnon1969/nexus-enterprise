# Dev Ports & Core Commands

Short guide to keep local dev ports and commands consistent.

## Canonical Local Ports

These are the standard ports for local development. Avoid changing them unless absolutely necessary.

- API (NestJS, apps/api): http://localhost:8000
- Web (Next.js, apps/web): http://localhost:3000
- Postgres (Docker dev): localhost:5433 (container 5432)
- Redis (Docker dev): localhost:6380 (container 6379)

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
# Terminal 1 – API
cd /Users/pg/nexus-enterprise/apps/api
API_PORT=8000 npm run dev

# Terminal 2 – Web
cd /Users/pg/nexus-enterprise/apps/web
npm run dev
```

## Quick Health Checks

API health:

```bash
curl -sS http://localhost:8000/health | jq
```

If this fails with `Connection refused`, the API is not running or not bound to 8000.

Web health:

- Visit http://localhost:3000 in the browser.

## Browser Errors Cheat Sheet

- `net::ERR_CONNECTION_REFUSED` to `http://localhost:8000/...`
  - Nothing is listening on port 8000.
  - Fix: run `bash ./scripts/dev-clean-env.sh` from the repo root.

- HTTP 4xx/5xx from `http://localhost:8000/...`
  - API is reachable; investigate request/response details instead of ports.

## Guardrails

- Treat API on 8000 and web on 3000 as the default policy for local dev.
- If a port conflict occurs, prefer killing the conflicting process over changing these ports.
- Only override ports temporarily and restore to 8000/3000 afterwards.