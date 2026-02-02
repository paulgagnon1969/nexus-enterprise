# Dev Stack & Local Tooling

This document describes how to bring up the Nexus Enterprise developer stack on macOS, including local Docker infra, the `dev-start` / `start-dev-clear-all` scripts, and the optional Dock/Automator integration.

## Overview

The recommended local workflow is:

1. Use Docker Desktop for local Postgres + Redis via `infra/docker/docker-compose.yml` (or an external DB if you prefer).
2. Use the `scripts/dev-start.sh` script to start the API, worker, and web dev servers against whatever `DATABASE_URL` you have configured.
3. Optionally use `start-dev-clear-all.sh` as a "hard reset" to kill dev processes and then delegate to `dev-start.sh`.
4. Optionally create a macOS Automator app that runs `start-dev-clear-all.sh` from the Dock.

The scripts are written to be **idempotent** and to assume your database/infra (local Docker or Cloud SQL) is already running.

## scripts/dev-start.sh (dev stack starter)

Path: `scripts/dev-start.sh`

### Responsibilities

- Resolve the repository root, logs directory, and app paths.
- Ensure `apps/web/.config` points at the local API (`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`) on first run.
- Configure `DATABASE_URL` (by default, to the local Postgres instance used by `infra/docker`), unless you have already set `DATABASE_URL` in your environment.
- Start the NestJS API dev server (`npm run dev` in `apps/api`), the BullMQ worker (`npm run worker:dev` in `apps/api`), and the Next.js web dev server (`npm run dev` in `apps/web`).
- Run simple health checks (HTTP 200 from `http://localhost:8000` / `http://localhost:3000`) and log a summary.

### Assumptions

- Your database is already running and reachable via `DATABASE_URL`.
  - For local Docker dev: run `docker compose -f infra/docker/docker-compose.yml up -d` yourself (or let other tooling handle it).
  - For Cloud SQL or other DBs: export `DATABASE_URL` before running `scripts/dev-start.sh`.
- `npm` is available on your `PATH`.

### Usage

From the repo root:

```bash
cd /Users/pg/nexus-enterprise
./scripts/dev-start.sh
```

On success you will see log output like:

```text
[dev-start] Repo root: /Users/pg/nexus-enterprise (mode=local-docker)
[dev-start] Using DATABASE_URL=postgresql://nexus_user:****@127.0.0.1:5433/nexus_db
[dev-start] Starting API dev server (local Docker Postgres)...
[dev-start] Starting API worker (import jobs)...
[dev-start] Starting web dev server on http://localhost:3000...
[dev-start] Summary:
[dev-start]   API   : OK (health)
[dev-start]   Web   : OK
[dev-start]   Worker: OK (worker:dev)
[dev-start] Done (local Docker dev). Check logs/ for logs.
```

## start-dev-clear-all.sh (hard reset + delegate to dev-start)

Path: `start-dev-clear-all.sh`

### Responsibilities

- Kill any processes bound to the common dev ports (`3000`, `8000`, `5432`, `6380`).
- Kill common Node dev processes:
  - `next dev`
  - `nodemon` (API)
  - `ts-node-dev` / `ts-node src/worker.ts`
  - `node` processes in `apps/api` and `apps/web`.
- Change to the repository root.
- Delegate startup to `scripts/dev-start.sh`.

### Assumptions

- Your database/infra is already running (local Docker or Cloud SQL etc.). This script does **not** manage Docker at all.
- `scripts/dev-start.sh` will start the API, worker, and web dev servers against the current `DATABASE_URL`.

### Usage

```bash
cd /Users/pg/nexus-enterprise
./start-dev-clear-all.sh
```

Example output:

```text
=== HARD RESET: killing dev processes and restarting Nexus dev (local Docker) ===
→ Killing anything on ports 3000, 8000, 5432, 6380…
  - Port 3000 is free.
  - Port 8000 is free.
  - Port 5432 is free.
  - Port 6380 in use, killing processes...
→ Killing common Node dev processes (node/next/nodemon/ts-node-dev)…
→ Changing to repo: /Users/pg/nexus-enterprise
→ Delegating dev startup to scripts/dev-start.sh (local Docker Postgres)…
[dev-start] Repo root: /Users/pg/nexus-enterprise (mode=local-docker)
...
[dev-start] Summary:
[dev-start]   API   : OK (health)
[dev-start]   Web   : OK
[dev-start]   Worker: OK (worker:dev)
[dev-start] Done (local Docker dev). Check logs/ for logs.
=== Dev environment restarted via scripts/dev-start.sh (API :8000, Web :3000) ===
```

## macOS Dock / Automator integration

On macOS, you can wrap `start-dev-clear-all.sh` in an Automator application so that a single click on a Dock icon will:

1. Ensure Docker Desktop (or your DB/infra) is running.
2. Kill any existing dev stack processes.
3. Delegate to `scripts/dev-start.sh` to bring the dev stack back up.
4. Show a clear summary in a Terminal window.

### Example Automator App (Terminal + zsh wrapper)

1. Open **Automator** → New Document → **Application**.
2. Add a **Run AppleScript** action.
3. Use a script like this:

```applescript
on run {input, parameters}
    tell application "Terminal"
        activate
        do script "zsh -lc 'if ! docker info >/dev/null 2>&1 then echo \"[dev-reset] Launching Docker Desktop...\"; open -a Docker; echo \"[dev-reset] Waiting for Docker daemon...\"; while ! docker info >/dev/null 2>&1; do sleep 2; end repeat; echo \"[dev-reset] Docker is ready.\"; else echo \"[dev-reset] Docker already running.\"; end if; sleep 2; cd /Users/pg/nexus-enterprise && ./start-dev-clear-all.sh'"
    end tell
    return input
end run
```

4. Save as `Nexus Dev Reset.app` (e.g. in `/Applications`), then drag it to the Dock.

When you click the Dock icon:

- A Terminal window opens.
- The app will:
  - Start Docker Desktop if needed and block until `docker info` succeeds.
  - Run `start-dev-clear-all.sh`.
  - `start-dev-clear-all.sh` kills any dev ports/processes and calls `scripts/dev-start.sh`.
  - `scripts/dev-start.sh` starts the API dev server, worker, and web dev server and prints a summary.

### Notes

- This integration uses `docker info` only as a **pre-flight** check so the dev scripts themselves do not need to manage Docker.
- If you prefer to manage infra manually or use Cloud SQL, you can remove the `docker info`/`open -a Docker` lines and simply have Automer run:
  
  ```applescript
  do script "cd /Users/pg/nexus-enterprise && ./start-dev-clear-all.sh"
  ```

- The `JobConsole` UI component described in `docs/onboarding/README.md` can be used in the web app to display a terminal-style log and completion stamp for any long-running background jobs started by the API.

# Nexus Dev Stack: Golden Path

This doc describes the **minimal set of processes and steps** to get a healthy local dev stack running for Nexus, plus how to debug the most common failures.

The core idea: you need **three local processes** talking to a **single database** via Cloud SQL.

- Cloud SQL proxy → connects to Cloud SQL (prod or dev)
- API dev server → NestJS on `http://localhost:8000`
- Web dev server → Next.js on `http://localhost:3000`

If these three are healthy, the UI and login will work.

---

## 0. Prereqs

- `gcloud` installed and authenticated (ADC set up).
- `cloud-sql-proxy` installed.
- This repo checked out at `~/nexus-enterprise`.

Cloud SQL instances (names from GCP):

- `nexusprod-v2`
- `nexusdev-v2` (current dev instance used by `scripts/dev-start.sh`)
- (deprecated) `nexus-dev-postgres` (old dev instance; no longer used)

The **recommended local dev path** is:

- Use `gcloud auth application-default login` and
- Let `scripts/dev-start.sh` start the Cloud SQL Auth Proxy for `nexusdev-v2` on `127.0.0.1:5434`.

The examples below assume **prod** database for some legacy flows; for normal day-to-day dev, prefer the `start-dev-clear_ALL.sh` script (hard reset wrapper), which delegates to the dev start scripts.

---

## 1. Start / confirm Cloud SQL proxy

In a terminal:

```bash
cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexusprod-v2
```

Leave this running. When ready, you should see output like:

- `Listening on 127.0.0.1:5433`
- `The proxy has started successfully and is ready for new connections!`

If this is already running from another tab/window, you **do not** need to start it again.

To check quickly:

```bash
lsof -ti:5433
```

If you see a PID, the proxy is up.

---

## 2. Start / reset the API dev server (NestJS)

From the repo root:

```bash
cd /Users/pg/nexus-enterprise

# Optional but recommended if things feel stuck.
npm run dev:clean   # kills anything on ports 3000 and 8000

# Start API pointing at the DB via the proxy
export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"
bash ./scripts/dev-api-cloud-db.sh
```

You want to see:

- Nest startup logs
- `Nest application successfully started`
- `API listening on http://localhost:8000`

If the process exits or shows a stack trace, **stop here** and fix the API/DB issue before touching the web app.

---

## 3. Verify API health

In another terminal:

```bash
cd /Users/pg/nexus-enterprise
curl -i http://localhost:8000/health
```

Healthy output looks like:

```http
HTTP/1.1 200 OK
...
{"ok":true,"dbTime":"2025-..","redis":"PONG"}
```

If you see `500 Internal Server Error` here, **do not** debug login or UI yet. `/health` must be 200 before anything else is meaningful.

Common meanings:

- `200 OK` → API + DB + Redis client are all healthy.
- `500` → something inside the API is throwing (Prisma, DB, etc.). Fix this first.
- `curl: (7) Failed to connect` → API process is not running or crashed. Restart with step 2.

---

## 4. Start / confirm the web dev server (Next.js)

Only after `/health` returns 200:

```bash
cd /Users/pg/nexus-enterprise/apps/web
npm run dev
```

You want to see something like:

- `ready - started server on 0.0.0.0:3000`

Quick check:

```bash
lsof -ti:3000
```

If a PID shows up, web dev server is listening.

Then open:

- `http://localhost:3000`

You should see the login page.

---

## 5. Accounts to use

### Superadmin (cross-tenant admin)

Use this for:

- Switching between multiple organizations
- Using `/admin/*` endpoints
- Seeding / impersonation / role testing

**Credentials:**

- Email: `pg.superadmin@ncc.local`
- Password: (whatever latest dev password you set via `/auth/bootstrap-superadmin`)

If you ever forget the password, you can reset it via:

```bash
curl -i http://localhost:8000/auth/bootstrap-superadmin \
  -H "Content-Type: application/json" \
  -d '{"email":"pg.superadmin@ncc.local","password":"NEW_PASSWORD"}'
```

As long as the email matches the existing SUPER_ADMIN, this is idempotent and just updates the password.

### Paul (tenant-level user)

Use this to see what a normal tenant user sees.

**Credentials:**

- Email: `paul@nfsgrp.com`
- Password: `PaulDev!2025`

If this ever stops working, the password can be reset directly in the DB using a small Node script (see history) or an admin helper we may add in the future.

---

## 6. Quick status checks (what’s running?)

From anywhere:

```bash
lsof -ti:5433,8000,3000
```

Interpretation:

- PID on **5433** → Cloud SQL proxy is running.
- PID on **8000** → API dev server is running.
- PID on **3000** → Web dev server is running.

If things feel weird:

```bash
cd /Users/pg/nexus-enterprise
npm run dev:clean   # kills processes on 8000 and 3000 (API + web)
```

This does **not** kill the Cloud SQL proxy on 5433. After that, redo:

1. Start API (`bash ./scripts/dev-api-cloud-db.sh`)
2. Confirm `/health` is 200
3. Start web (`npm run dev` in `apps/web`)

---

## 7. Interpreting login errors (browser)

In Chrome/Edge DevTools → Network, click the `login` request (to `/auth/login`).

### 401 Unauthorized

- Status: `401`
- Body: `{"message":"Invalid credentials"}`

Meaning:

- Email exists, but password does **not** match that user’s `passwordHash`.

Fix:

- Double-check you’re typing the right password.
- For dev accounts (like `pg.superadmin@ncc.local`), reset the password via `/auth/bootstrap-superadmin` as shown above.

### 500 Internal Server Error

- Status: `500`
- Body: `{"statusCode":500,"message":"Internal server error"}`

Meaning:

- The API threw an exception **after** receiving the request.
- Often indicates a DB/Prisma or infra problem.

Fix:

1. Check `/health`:
   
   ```bash
   curl -i http://localhost:8000/health
   ```

2. If `/health` is also 500 or unreachable, focus on fixing API/DB (steps 2–3 above) before debugging login.

### Network error / cannot reach `localhost:8000`

- DevTools shows something like `ERR_CONNECTION_REFUSED`.

Meaning:

- API process is not listening on 8000 (crashed or never started).

Fix:

1. Check:
   
   ```bash
   lsof -ti:8000
   ```

   - If no PID, API is not running.

2. Restart API:
   
   ```bash
   cd /Users/pg/nexus-enterprise
   npm run dev:clean   # optional but safe
   export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"
   bash ./scripts/dev-api-cloud-db.sh
   ```

3. Confirm `/health` is 200, then retry login.

---

## 8. Minimal daily workflow

After a reboot or when sitting down to work on Nexus:

1. **Start local Docker infra (Postgres + Redis)**
   
   ```bash
   cd /Users/pg/nexus-enterprise
   docker compose -f infra/docker/docker-compose.yml up -d
   ```

2. **Start / reset the dev stack (API + web) against local Docker DB**
   
   The recommended path is to use the hard-reset wrapper, which kills dev ports and delegates to `scripts/dev-start.sh`:
   
   ```bash
   cd /Users/pg/nexus-enterprise
   ./start-dev-clear-all.sh
   ```

   This will:
   
   - Ensure Docker is running (if invoked via the Automator app described above).
   - Kill any listeners on ports 3000, 8000, 5432, 6380.
   - Start the API dev server on `http://localhost:8000`.
   - Start the web dev server on `http://localhost:3000`.

3. **Check health**
   
   ```bash
   curl -i http://localhost:8000/health
   ```

   You should see `200 OK` with `{ "ok": true, "dbTime": "...", "redis": "PONG" }`.

4. **Start worker (optional but recommended for imports / background jobs)**
   
   If the worker is not already running:
   
   ```bash
   cd /Users/pg/nexus-enterprise/apps/api
   npm run worker:dev
   ```

5. **Log in** as either superadmin or Paul and do your work.

   - Superadmin: `pg.superadmin@ncc.local` + whatever password you last set via `/auth/bootstrap-superadmin`.
   - Paul (tenant): `paul@nfsgrp.com` + the current dev/prod password you use in production.

If any step fails, use the health + `lsof` checks above to see which layer is broken (DB container, API, or web) and fix that layer first.

---

## 9. Refreshing local Docker DB from prod (manual SOP)

Occasionally you may want to refresh your **local Docker dev database** from **prod** and then continue working locally. This is the supported manual flow.

**WARNING:** This will overwrite the local `nexus_db` data in Docker Postgres. Make sure you really want a fresh clone from prod.

Steps:

1. **Ensure local Docker Postgres is running**
   
   ```bash
   cd /Users/pg/nexus-enterprise
   docker compose -f infra/docker/docker-compose.yml up -d postgres
   ```

2. **Clone prod → local Docker via Cloud SQL proxy + pg_dump (Postgres 18)**
   
   This uses `scripts/prod-db-run-with-proxy.sh` to start a Cloud SQL Proxy for `nexusprod-v2` on port 5434 and then streams a `pg_dump` from prod into local Docker Postgres.
   
   ```bash
   cd /Users/pg/nexus-enterprise

   # Load PROD_DB_PASSWORD from .env (contains the prod DB password)
   set -a && source .env && set +a

   ./scripts/prod-db-run-with-proxy.sh --port 5434 --allow-kill-port --no-prompt -- \
     bash -lc 'docker run --rm -e PGPASSWORD="$PROD_DB_PASSWORD" postgres:18 \
       pg_dump --clean --no-owner --no-privileges \
         -h host.docker.internal -p 5434 -U postgres nexus_db \
       | PGPASSWORD="nexus_password" psql \
         -h 127.0.0.1 -p 5433 -U nexus_user nexus_db'
   ```

   Notes:
   
   - `postgres:18` matches the server version used by Cloud SQL.
   - `PROD_DB_PASSWORD` must be set in `.env` (do **not** hard-code secrets into scripts).
   - The pipeline applies `pg_dump --clean` output directly into the local Docker DB.

3. **Bring the local schema fully up-to-date (Prisma migrations)**
   
   After cloning, always run Prisma migrations against the local DB so the schema matches the Prisma client used by the API:
   
   ```bash
   cd /Users/pg/nexus-enterprise/packages/database
   DATABASE_URL="postgresql://nexus_user:nexus_password@127.0.0.1:5433/nexus_db" \
     npx prisma migrate deploy --schema=prisma/schema.prisma
   ```

4. **Restart the dev stack on the cloned DB**
   
   ```bash
   cd /Users/pg/nexus-enterprise
   ./start-dev-clear-all.sh
   ```

   This will restart API + web pointing at the refreshed local Docker DB. You can now log in as `paul@nfsgrp.com` with your usual prod password and exercise the UI against the cloned data.

If any of these steps fail (e.g., `pg_dump` server version mismatch, Prisma `P2022` column errors, etc.), fix that layer first before trying to debug the web app or login flows.
