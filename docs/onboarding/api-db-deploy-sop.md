# API + Database Deploy SOP

This document defines the standard operating procedure (SOP) for developing and deploying the Nexus API and Prisma/Postgres schema across **local**, **Cloud SQL dev** (`nexusdev-v2`), and **Cloud SQL prod** (`nexusprod-v2`).

It complements existing docs like `dev-stack.md`, `envs-and-migrations.md`, and `dev-to-prod-runbook.md` by focusing on the concrete commands and environment boundaries.

## Environments

### 1. Local dev (Docker)

- **Postgres**: Docker `postgres:18` via `infra/docker/docker-compose.yml`
  - Host: `127.0.0.1`
  - Port: `5433`
  - DB: `nexus_db`
  - User: `nexus_user`
  - Password: `nexus_password`
- **Redis**: Docker `redis:8`
  - Host: `127.0.0.1`
  - Port: `6380`
- **API**: `apps/api` running locally on `http://localhost:8000`.
- **Web**: `apps/web` running locally on `http://localhost:3000` and pointing to `http://localhost:8000`.

### 2. Cloud SQL dev (`nexusdev-v2`)

- Cloud SQL instance: `nexusdev-v2` in project `nexus-enterprise-480610`.
- Accessed locally via Cloud SQL Proxy on a port like `5434`.
- Used by:
  - Dev API instance (Cloud Run dev service).
  - Any dev tools that need shared realistic data.

### 3. Cloud SQL prod (`nexusprod-v2`)

- Cloud SQL instance: `nexusprod-v2` in project `nexus-enterprise-480610`.
- Used by:
  - Production API (Cloud Run `nexus-api`).
  - Production worker (`nexus-worker`).

> **Rule:** Prisma migrations are the **source of truth** for schema. No direct `ALTER TABLE` in dev/prod. Only `prisma migrate dev` (local/Docker) and `prisma migrate deploy` (Cloud SQL).

## Local dev SOP (Docker Postgres 18)

### 1. Start Docker infra

```bash
cd /Users/pg/nexus-enterprise
docker compose -f infra/docker/docker-compose.yml up -d
```

You should see at least:

- `nexus-postgres` (mapped to `localhost:5433`).
- `nexus-redis` (mapped to `localhost:6380`).

### 2. Ensure `.env` points at Docker

Root `.env` (used by `apps/api`):

```env
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public"
REDIS_URL="redis://localhost:6380"
REDIS_USE_REAL=true
```

`packages/database/.env` (used by Prisma CLI):

```env
DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public"
SHADOW_DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public"
```

### 3. Run the API + web locally

From repo root:

```bash
# API only
npm run dev:api

# (optional) Web from apps/web in another terminal
cd apps/web
npm run dev
```

Health check:

```bash
curl http://localhost:8000/health
# { "ok": true, "dbTime": ..., "redis": "PONG" }
```

### 4. Local schema changes (Prisma)

When you need to change the DB schema:

1. Edit `packages/database/prisma/schema.prisma`.
2. Generate and apply a migration **against Docker Postgres 18**:

   ```bash
   cd /Users/pg/nexus-enterprise/packages/database

   DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \
   SHADOW_DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public" \
   npx prisma migrate dev --schema prisma/schema.prisma --name <meaningful_name>
   ```

3. Verify API still boots and `/health` is OK.
4. Commit both:
   - `packages/database/prisma/schema.prisma`
   - `packages/database/prisma/migrations/<timestamp>_<meaningful_name>/migration.sql`

> **Never** run `prisma migrate dev` against Cloud SQL dev/prod.

## DB migration SOP (Cloud SQL dev/prod)

There are two npm scripts wired to helper shell scripts under `scripts/`.

### 1. Dev DB migrations (`nexusdev-v2`)

Use when you want Cloud SQL **dev** to match your committed migrations.

1. Ensure you have a working Cloud SQL Proxy (or direct IP) for `nexusdev-v2`, e.g.:

   ```bash
   # Example only; configure port/host as needed
   cloud-sql-proxy --port=5434 nexus-enterprise-480610:us-central1:nexusdev-v2
   ```

2. Export `DATABASE_URL` for dev (example, adjust for your setup):

   ```bash
   export DATABASE_URL="postgresql://postgres:<DEV_DB_PASSWORD>@127.0.0.1:5434/nexus_db?schema=public"
   ```

3. Run the dev migration script from repo root:

   ```bash
   cd /Users/pg/nexus-enterprise
   npm run db:migrate:dev
   ```

   This wraps `./scripts/db-migrate-cloud.sh`, which:

   - Changes into `packages/database/`.
   - Runs `npm run prisma:migrate` against the **dev** DB.

### 2. Prod DB migrations (`nexusprod-v2`)

Use only when promoting a fully tested schema to production.

1. Export `DATABASE_URL` for **prod** (never commit this value):

   ```bash
   export DATABASE_URL="postgresql://postgres:<PROD_DB_PASSWORD>@<PROD_DB_HOST>:5432/nexus_db?schema=public"
   ```

2. Run the prod migration script from repo root:

   ```bash
   cd /Users/pg/nexus-enterprise
   npm run db:migrate:prod
   ```

   This wraps `./scripts/db-migrate-prod.sh`, which:

   - Changes into `packages/database/`.
   - Runs `npx prisma migrate deploy` (non-interactive, prod-safe).

> **Rule:** prod uses `migrate deploy` only (no `migrate dev`).

## API deploy SOP (Cloud Run)

### 1. Deploy API (nexus-api) to Cloud Run

Use `scripts/deploy-api.sh`.

```bash
cd /Users/pg/nexus-enterprise
./scripts/deploy-api.sh
```

This script:

- Builds the API Docker image with Cloud Build.
- Deploys the image to Cloud Run service `nexus-api` in `us-central1`.
- Assumes `DATABASE_URL` is already configured on the Cloud Run service env vars.

### 2. Updating the production DATABASE_URL

For rare cases (password rotation or new prod DB host), use:

```bash
cd /Users/pg/nexus-enterprise
./scripts/update-prod-database-url.sh
```

This script:

- Prompts for confirmation.
- Asks for `PROD_DB_PASSWORD` securely.
- Updates the `DATABASE_URL` env var on the `nexus-api` Cloud Run service.

## Web deploy SOP (Vercel)

The frontend (`apps/web`) is deployed via Vercel.

### 1. Vercel environment variables

Configure these in the Vercel project for `apps/web`:

- **Preview / Development environment:**
  - `NEXT_PUBLIC_API_BASE_URL` → URL of the **dev** API (Cloud Run dev service), which uses `nexusdev-v2`.
- **Production environment:**
  - `NEXT_PUBLIC_API_BASE_URL` → URL of the **prod** API (`nexus-api` Cloud Run service), which uses `nexusprod-v2`.

The web app **does not** talk to the database directly; it always goes through the API.

### 2. Promotion flow

1. **Local:**
   - Change code + schema.
   - Run local Prisma migration (Docker).
   - Test locally (API + web, Docker DB).

2. **Push to Git (dev/preview):**
   - Vercel builds a preview environment of `apps/web`.
   - CI or a dev operator runs `npm run db:migrate:dev` so `nexusdev-v2` has the new schema.
   - Dev API (Cloud Run dev service) is deployed/configured to use `nexusdev-v2`.

3. **Test dev:**
   - Hit Vercel preview or dev URL.
   - Verify flows against dev API + dev DB.

4. **Promote to prod:**
   - Run `npm run db:migrate:prod` to apply migrations to `nexusprod-v2`.
   - Deploy API to prod via `./scripts/deploy-api.sh`.
   - Promote Vercel deployment to production (web now points to prod API URL).

## CI automation (GitHub Actions)

You can automate the **dev DB migration + API dev deploy** flow with a GitHub Actions workflow.

### Workflow: `.github/workflows/dev-api-dev-db.yml`

- Trigger: push to `main` (adjust branches as needed).
- Responsibilities:
  - Use `DATABASE_URL` from `secrets.DEV_DATABASE_URL` to run Prisma migrations against Cloud SQL dev.
  - Authenticate to GCP using a deploy service account (`secrets.GCP_SA_DEPLOY_JSON`).
  - Run `prisma migrate deploy` for dev.
  - Call `scripts/deploy-api.sh` to build and deploy the API image to Cloud Run (dev service).

#### Required GitHub secrets

- `DEV_DATABASE_URL`
  - Connection string for `nexusdev-v2` (Cloud SQL dev), e.g.
    - `postgresql://postgres:<DEV_DB_PASSWORD>@<DEV_DB_HOST_OR_PROXY>:5432/nexus_db?schema=public`
- `GCP_SA_DEPLOY_JSON`
  - JSON key for a GCP service account with permissions to:
    - Run Cloud Build.
    - Deploy to Cloud Run dev service.
    - Connect to Cloud SQL dev.

#### High-level job flow

1. Checkout repo and install Node deps.
2. Authenticate to GCP using `google-github-actions/auth` + `setup-gcloud`.
3. `cd packages/database && npx prisma migrate deploy --schema prisma/schema.prisma` (against dev DB).
4. `cd scripts && ./deploy-api.sh` (deploy API image to Cloud Run dev service).

> This workflow enforces the same SOP: **schema changes are committed and applied via Prisma migrations**, and API deploys are driven by `scripts/deploy-api.sh`.

## Quick reference

- Local DB (Docker):
  - `docker compose -f infra/docker/docker-compose.yml up -d`
  - `DATABASE_URL=postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db?schema=public`
- Local schema change:
  - `cd packages/database && npx prisma migrate dev --schema prisma/schema.prisma --name <name>`
- Dev DB migration (Cloud SQL dev):
  - `export DATABASE_URL=postgresql://postgres:<DEV_DB_PASSWORD>@127.0.0.1:5434/nexus_db?schema=public`
  - `npm run db:migrate:dev`
- Prod DB migration (Cloud SQL prod):
  - `export DATABASE_URL=postgresql://postgres:<PROD_DB_PASSWORD>@<PROD_DB_HOST>:5432/nexus_db?schema=public`
  - `npm run db:migrate:prod`
- API deploy (Cloud Run):
  - `./scripts/deploy-api.sh`
- Update prod `DATABASE_URL` on Cloud Run:
  - `./scripts/update-prod-database-url.sh`
