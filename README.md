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

## Non-interactive API deploys (prod)

To avoid local keychain / gcloud credential loops, production API deploys are handled via GitHub Actions using a GCP service account.

### One-time GCP setup

1. Create a service account in the `nexus-enterprise-480610` project, e.g. `nexus-api-deployer`.
2. Grant it the minimal roles:
   - `roles/run.admin` (Cloud Run Admin)
   - `roles/cloudbuild.builds.editor` (or a narrower Cloud Build role that can run builds)
   - `roles/artifactregistry.writer` for the Artifact Registry repo that hosts the API image (e.g. `us-docker.pkg.dev/nexus-enterprise-480610/nexus-api`).
3. Generate a JSON key for this service account and keep it safe.

### GitHub setup

1. In the GitHub repo settings, add a repository secret named `GCP_SA_DEPLOY_JSON` containing the **contents** of the service account JSON key.
2. The workflow `.github/workflows/prod-api-deploy.yml` will use this secret to authenticate non-interactively.

### Deployment workflow

- Workflow file: `.github/workflows/prod-api-deploy.yml`.
- Triggers:
  - `workflow_dispatch` (manual run from the Actions tab), and
  - `push` to `main` touching `apps/api/**`, `packages/database/**`, `Dockerfile`, or `scripts/deploy-api.sh`.
- High-level steps:
  1. Checkout repo and install Node dependencies.
  2. Authenticate to GCP using `google-github-actions/auth` with `GCP_SA_DEPLOY_JSON`.
  3. Setup `gcloud` and configure Docker auth for `us-docker.pkg.dev`.
  4. Run `scripts/deploy-api.sh`, which builds and deploys the `nexus-api` Cloud Run service.

This keeps production deploys fully non-interactive (no local macOS keychain prompts) and reproducible from CI.
