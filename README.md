# Nexus Enterprise

Monorepo for the Nexus Connect platform.

- `apps/api` – NestJS 11 + Fastify HTTP API (Node.js)
- `apps/web` – Next.js web app (React)
- `packages/database` – Shared Prisma + Postgres data layer (`@repo/database`)
- `infra/docker` – Local Postgres + Redis for development
- `docs` – Architecture notes, API contracts, onboarding docs

## Backend stack & health checks

### Stack overview

- **API:** NestJS 11 on Fastify (`apps/api`)
- **Frontend:** Next.js (`apps/web`)
- **Data layer:** Prisma 7 (`packages/database`) + Postgres (GCP)
- **Cache / queues:** Redis (via `ioredis`, `bullmq`)
- **Runtime:** Node.js (API on GCP Cloud Run), web on Vercel
- **Monorepo tooling:** Turborepo, npm workspaces

### Environment variables

Backend (`apps/api`):

- `DATABASE_URL` – Postgres connection string (GCP)
- `REDIS_URL` – Redis connection string
- `REDIS_USE_REAL` – `true` to force real Redis in non‑prod; otherwise a no‑op Redis client is used
- `PORT` – API port (Cloud Run provides this; default is `8000` for local dev)
- `NODE_ENV` – `development` | `production`

Frontend (`apps/web`):

- `NEXT_PUBLIC_API_BASE_URL` – Base URL for all API calls (e.g. `https://api.yourdomain.com`)

### Health endpoints

`apps/api` exposes two HTTP health endpoints:

- `GET /health` – **liveness**
  - Confirms the API process is running and can respond.
  - Response example:
    ```json
    { "ok": true, "time": "2025-01-01T12:00:00.000Z" }
    ```

- `GET /health/deps` – **readiness / dependencies**
  - Verifies:
    - Postgres: runs `SELECT 1` via Prisma.
    - Redis: calls `PING` via `RedisService`.
  - Response example:
    ```json
    { "ok": true, "db": "ok", "redis": "PONG", "time": "2025-01-01T12:00:01.000Z" }
    ```
  - In environments where Redis is intentionally disabled or using the no‑op client, `redis` will be `"unreachable"`.

### Local smoke test

From the repo root:

```bash
cd apps/api
npm run dev
```

Then in another terminal:

```bash
curl -s http://localhost:8000/health | jq
curl -s http://localhost:8000/health/deps | jq
```

If `/health` is green but `/health/deps` fails, the process is up but DB/Redis are misconfigured.
