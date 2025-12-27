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
- `nexus-dev-postgres`
- `nexusdev-v2` (current dev instance used by `scripts/dev-start.sh`)

The **recommended local dev path** is:

- Use `gcloud auth application-default login` and
- Let `scripts/dev-start.sh` start the Cloud SQL Auth Proxy for `nexusdev-v2` on `127.0.0.1:5434`.

The examples below assume **prod** database for some legacy flows; for normal day-to-day dev, prefer the `start-dev.sh` script, which targets the `nexusdev-v2` dev instance.

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

## 8. Data lifecycle: soft delete + archive

To keep the database fast as it grows, we use a standard lifecycle for
high-volume, long-lived tables:

1. **Active rows**
   - `deletedAt IS NULL`.
   - Visible in the app and fully indexed for day-to-day queries.

2. **Soft-deleted rows (short-term)**
   - `deletedAt IS NOT NULL` and newer than our retention window (e.g. 30 days).
   - Hidden from normal queries (we always filter `deletedAt IS NULL` in app code).
   - Kept temporarily so we can undo deletions and handle short-term data repair.

3. **Archived rows (long-term)**
   - Soft-deleted rows older than the retention window are moved out of the
     main table into an `archive` schema, then hard-deleted from the main
     table. This keeps primary tables + indexes small and fast.

### 8.1 Schema conventions for new high-volume tables

When adding a new large or long-lived model (e.g. files, jobs, logs,
attachments), follow these conventions:

- Include a soft-delete timestamp:
  - `deletedAt DateTime?`
- If the data is scoped by organization, always include `companyId`:
  - `companyId String` + a relation to `Company`.
- Add a composite index for lifecycle-aware queries:
  - `@@index([companyId, deletedAt], map: "<Model>_company_deleted_idx")`.
- In app/ORM code, all normal queries must filter `deletedAt == null`.
  - Only admin/audit/reporting flows should see deleted rows.

### 8.2 Archive tables and partitions

For each soft-deleted model that will grow large, we mirror it into the
`archive` schema using a partitioned table. Example (CompanyOffice):

- Main model (`CompanyOffice`):
  - Has `deletedAt DateTime?` and an index on `(companyId, deletedAt)`.
  - Has a **partial index** for active rows only:
    - `CREATE INDEX "CompanyOffice_company_active_idx" ON "CompanyOffice"("companyId") WHERE "deletedAt" IS NULL;`

- Archive table (`archive."CompanyOffice"`):
  - Created with `LIKE` so it mirrors the main schema:
    - `CREATE TABLE archive."CompanyOffice" (LIKE "CompanyOffice" INCLUDING ALL) PARTITION BY RANGE ("deletedAt");`
  - Has a time-based partition (e.g. `CompanyOffice_2000_2100`) that we can
    later split into year/quarter/month partitions as data grows.
  - Has an archive index for per-org queries:
    - `CREATE INDEX "CompanyOffice_archive_company_deleted_idx" ON archive."CompanyOffice"("companyId", "deletedAt");`

### 8.3 Archival workers

Archival jobs run out-of-band (via scripts or queue workers) and:

1. Select batches of old soft-deleted rows from the main table, e.g.:
   - `deletedAt < now() - interval '30 days'`.
2. Insert those rows into the corresponding `archive` table.
3. Delete them from the main table.

We currently have an example for `CompanyOffice`:

- Script: `packages/database/src/archive-company-office.ts`.
- NPM task (from `packages/database`):
  - `npm run archive:company-offices`
- Environment knobs:
  - `COMPANY_OFFICE_ARCHIVE_BATCH_SIZE` (rows per batch; default 500).
  - `COMPANY_OFFICE_ARCHIVE_RETENTION_DAYS` (soft-delete window; default 30).
  - `COMPANY_OFFICE_ARCHIVE_MAX_PER_RUN` (optional cap per invocation).

When introducing a new high-volume model with soft delete, copy this pattern:

- Add `deletedAt` + index to the Prisma model.
- Create a matching `archive."<Model>"` partitioned table + indexes.
- Add a small archival script and NPM command to move old rows to archive.

---

## 9. Minimal daily workflow

After a reboot or when sitting down to work on Nexus:

1. **Start proxy (once)**
   
   ```bash
   cloud-sql-proxy --port=5433 nexus-enterprise-480610:us-central1:nexus-prod-postgres
   ```

2. **Start API**
   
   ```bash
   cd /Users/pg/nexus-enterprise
   export DATABASE_URL="postgresql://postgres:NEXUS_2025_PROD-v2@127.0.0.1:5433/nexus_db"
   bash ./scripts/dev-api-cloud-db.sh
   ```

3. **Check health**
   
   ```bash
   curl -i http://localhost:8000/health
   ```

4. **Start web**
   
   ```bash
   cd /Users/pg/nexus-enterprise/apps/web
   npm run dev
   ```

5. **Log in** as either superadmin or Paul and do your work.

If any step fails, use the health + lsof checks above to see which layer is broken (proxy, API, or web) and fix that layer first.
