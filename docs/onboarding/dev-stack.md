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

## 8. Minimal daily workflow

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
