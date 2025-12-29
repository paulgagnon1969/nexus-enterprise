# Onboarding

Step-by-step instructions for getting a local environment running and understanding the codebase.

## Quick Start: Full Dev Stack (API + Web via Cloud SQL)

For day-to-day backend + frontend work, use the scripted dev stack instead of wiring Cloud SQL and DATABASE_URL by hand.

1. One-time per machine (done once, then only if creds expire):
   - `gcloud auth login`
   - `gcloud auth application-default login`
   - `gcloud config set project nexus-enterprise-480610`
   - In your shell profile (e.g. `~/.zshrc`), set:
     - `export DEV_DB_PASSWORD='<your_dev_db_password>'`

2. Daily workflow:
   - From repo root: `cd ~/nexus-enterprise`
   - Kill any stale proxies (optional but safe): `pkill -f cloud-sql-proxy || true`
- Start everything: `./start-dev-clear_ALL.sh`

This will:

- Kill dev processes on ports 3000/8000/5432/6380
- Stop local Docker infra (if running)
- Start Cloud SQL Auth Proxy to the `nexusdev-v2` instance on `127.0.0.1:5434` using your `gcloud` ADC
- Start the API dev server on `http://localhost:8000`
- Start the API worker
- Start the web dev server on `http://localhost:3000`

For deeper troubleshooting and alternative flows (prod DB, manual proxy, etc.), see `docs/onboarding/dev-stack.md`.

## Imports, PETL, and workers

All CSV-based imports (Golden PETL, Golden Components, Xactimate RAW/components, etc.) follow a PETL-style, job-based pattern using `ImportJob` + a BullMQ worker. Large files are processed asynchronously and, where needed, split into parallel **chunk jobs**. See `docs/architecture/csv-imports-and-petl-standard.md` for the full SOP and architecture.

### UI pattern: Job-based operations and JobConsole

Long-running, worker-backed operations (CSV uploads, PETL recomputes, allocations, heavy exports) must expose progress via a job record and a small "console" in the initiating UI.

- Backend:
  - Create/update an `ImportJob` (or similar) with `status`, `progress`, `message`, `startedAt`, `finishedAt`, `resultJson`, and `errorJson`.
  - Expose a status endpoint like `GET /import-jobs/:jobId` that returns the job row.
- Frontend:
  - When a job is started, store the `jobId` returned by the API and start polling the job endpoint until `status` is `SUCCEEDED` or `FAILED`.
  - Maintain a small in-memory log buffer per job (last ~30 lines), appending a new line whenever `status` or `message` changes (e.g. `"[08:15:21] Importing Xact components…"`).
  - Render the shared `JobConsole` component next to the controls that initiated the job. `JobConsole` is responsible for:
    - Showing a green success banner or red failure banner with a clear human label.
    - Showing a `Completed at YYYY-MM-DD HH:MM` stamp once the job reaches a terminal state.
    - Rendering the rolling log buffer in a terminal-style window so users can see work progressing.

The initial implementation of this pattern lives on the project CSV import screen (`apps/web/app/projects/import/page.tsx`) and the reusable `JobConsole` component (`apps/web/app/projects/JobConsole.tsx`). When adding new worker-backed flows, reuse this pattern instead of inventing ad-hoc spinners.

## Running apps

### Web
- From repo root: `npm run dev:web`
- Production build: `npx turbo run build --filter=web`

### Admin
- From repo root: `npm run dev:admin`
- Production build: `npx turbo run build --filter=admin`

### API (Node + tRPC)
- From repo root: `npm run dev:api`

### Mobile (Expo)
- From `apps/mobile`: `npm run start`
- Note: The mobile app is validated via Expo dev (`npm run start`), not a CI build. The root CI pipeline currently builds web, admin, and the Node API; mobile is expected to run interactively via Expo.
