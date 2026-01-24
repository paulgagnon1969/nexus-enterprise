# Dev → Prod Runbook

This document captures the current, working process for moving changes from **local dev** to **production** for the Nexus monorepo.

- Dev DB: `nexusdev-v2` (Cloud SQL)
- Prod DB: `nexusprod-v2` (Cloud SQL)
- Cloud Run (prod):
  - API: `nexus-api`
  - Worker: `nexus-worker`
- Cloud Run (dev):
  - API dev: `nexus-api-dev`
- Web (prod):
  - Vercel app pointing to `https://nexus-api-979156454944.us-central1.run.app`

---

## 1. Local dev: canonical startup (dev DB)

Use this whenever you sit down to develop.

1. Start Cloud SQL proxy to **dev DB** (`nexusdev-v2`):

   ```bash
   cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusdev-v2
   ```

   Leave this running in its own terminal.

2. In another terminal, start the clean dev environment (API + worker + web) from the repo root:

   ```bash
   cd ~/nexus-enterprise

   export DEV_DB_PASSWORD='NEXUS_2025_DEV-v2'
   ./scripts/dev-clean-env.sh
   ```

   This starts:

   - API dev: `http://localhost:8000`
   - Web dev: `http://localhost:3000`
   - All DB traffic goes to `nexusdev-v2` via proxy on port 5433.

3. Confirm API health in dev:

   ```bash
   curl -i http://localhost:8000/health
   ```

   Expected:

   - `HTTP/1.1 200 OK`
   - JSON like: `{ "ok": true, "redis": "unreachable" }` (dev uses a no-op Redis client).

---

## 2. Normal dev workflow (code + schema)

1. Make **code changes** in:
   - `apps/api` (NestJS API)
   - `apps/web` (Next.js web)
   - `packages/database` (Prisma + shared DB access)
   - Other packages as needed.

2. Make **schema changes** against the **dev DB only**:

   ```bash
   cd ~/nexus-enterprise/packages/database

   export DATABASE_URL="postgresql://postgres:${DEV_DB_PASSWORD}@127.0.0.1:5433/nexus_db"

   # edit prisma/schema.prisma as needed

   npx prisma migrate dev --name <migration_name> --schema ./prisma/schema.prisma
   ```

This will:

   - Apply the migration to `nexusdev-v2`.
   - Create a new folder under `prisma/migrations/*` that should be checked into git.

3. Verify behavior via the dev stack (web at `http://localhost:3000`, API at `http://localhost:8000`).

Only after you are happy with behavior on **dev DB** should you proceed to production.

---

## 3. Prod DB migrations (nexusprod-v2)

Run these steps **only when Prisma migrations are ready to ship**.

1. Start Cloud SQL proxy to **prod DB** (`nexusprod-v2`):

   ```bash
   cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusprod-v2
   ```

   Leave this running in its own terminal.

2. From the repo root, apply migrations with the prod `DATABASE_URL`:

   ```bash
   cd ~/nexus-enterprise

   export DATABASE_URL="postgresql://postgres:<PROD_DB_PASSWORD>@127.0.0.1:5433/nexus_db"

   ./scripts/db-migrate-prod.sh
   ```

   - This script changes into `packages/database` and runs `prisma migrate deploy`.
   - It targets **nexusprod-v2** via the proxy on port 5433.
   - You should see either:
     - A list of migrations being applied, or
     - `No pending migrations to apply.`

> **Never** run `prisma migrate dev` against prod. Always use `migrate dev` on dev DB and `migrate deploy` on prod DB.

---

## 4. Deploy API to prod (`nexus-api`)

Once the prod DB is up to date, deploy the API.

From the repo root:

```bash
cd ~/nexus-enterprise
./scripts/deploy-api.sh
```

This script:

- Builds the Docker image using `turbo build --filter=api`.
- Pushes it to Artifact Registry.
- Deploys a new Cloud Run revision for `nexus-api`.
- `nexus-api` is already configured to:
  - Attach to `nexusprod-v2` via Cloud SQL.
  - Use `DATABASE_URL` of the form `postgresql://postgres:Nexusprodpass.22@localhost:5432/nexus_db?host=/cloudsql/...:nexusprod-v2`.
-  PG NOTE - export DATABASE_URL='postgresql://postgres:Nexusprodpass.22@/nexus_db?host=/cloudsql/nexus-enterprise-480610:us-central1:nexusprod-v2'

After deployment, verify API health in prod:

```bash
curl -i https://nexus-api-979156454944.us-central1.run.app/health
```

Expected:

- `HTTP/2 200`
- JSON like: `{ "ok": true, "dbTime": "...", "redis": "PONG" }`

If `/health` is not `200 OK`, **stop here** and fix the API/DB issues before touching web or worker.

---

## 5. Deploy worker to prod (`nexus-worker`)

Whenever API code or DB schema used by background jobs changes, update the worker.

Deploy the worker with the same image as the API:

```bash
gcloud run deploy nexus-worker \
  --image us-docker.pkg.dev/nexus-enterprise-480610/nexus-api/nexus-api \
  --platform managed \
  --region us-central1 \
  --project nexus-enterprise-480610 \
  --command node \
  --args dist/worker-http.js
```

Notes:

- `nexus-worker` is already configured to:
  - Attach to `nexusprod-v2` via Cloud SQL.
  - Use the correct prod `DATABASE_URL`.
  - Use `REDIS_URL=redis://10.53.145.123:6379`.
- The command above just updates it to the latest deployed image.

---

## 6. Web prod deploy (Vercel)

Vercel is configured to build and deploy `apps/web` using the repo, and the web app is wired to the prod API via:

- `NEXT_PUBLIC_API_BASE_URL=https://nexus-api-979156454944.us-central1.run.app`

Typical flow:

1. Commit and push your changes (API, web, database migrations, scripts).
2. Vercel picks up the push, builds `apps/web`, and deploys.
3. Once the Vercel deployment is marked successful, visit the production URL and log in.

You normally do **not** need to run any manual Vercel commands.

---

## 7. Post-deploy smoke tests (prod)

After each release, run this minimal checklist to confirm prod is healthy.

### 7.1 API health

```bash
curl -i https://nexus-api-979156454944.us-central1.run.app/health
```

- Must return `200` with `"ok": true` and `"redis": "PONG"`.

### 7.2 Direct login API test

```bash
curl -i "https://nexus-api-979156454944.us-central1.run.app/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "paul@nfsgrp.com",
    "password": "<PROD_PASSWORD>"
  }'
```

- Expect `200`/`201` and JSON with:
  - `user`
  - `company`
  - `accessToken`
  - `refreshToken`

If you get a `500`, look at Cloud Run logs for `nexus-api` (stderr + requests) before proceeding.

### 7.3 Web login (Vercel)

1. Open the Vercel production URL and navigate to `/login`.
2. Log in as `paul@nfsgrp.com` with the same prod password.
3. Confirm you land on the expected dashboard and basic navigation works.

### 7.4 Worker sanity (optional but recommended)

1. Trigger a small, known-safe background job (e.g., a small import you have used before).
2. Confirm it progresses from QUEUED → RUNNING → SUCCEEDED in the prod database.

If jobs are stuck or failing, inspect the `nexus-worker` Cloud Run logs and validate `REDIS_URL` and `DATABASE_URL`.

---

## 8. Safety rules / "do not do" list

- **Never** run `prisma migrate dev` against prod.
  - Use `migrate dev` only on `nexusdev-v2`.
  - Use `migrate deploy` only on `nexusprod-v2`.
- Avoid pointing local dev at `nexusprod-v2` for experiments.
  - Use `nexusdev-v2` for schema changes and risky operations.
- For any ad-hoc scripts using `PrismaClient` or `@repo/database`:
  - Always double-check `DATABASE_URL` before running.
- When debugging login or UI issues:
  - Fix `/health` first. If `/health` is `500` or not reachable, resolve that before looking at auth or frontend.

Following this runbook keeps dev safe on the dev DB and makes prod changes deliberate, predictable, and auditable.