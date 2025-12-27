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
   - Start everything: `./start-dev.sh`

This will:

- Kill dev processes on ports 3000/8000/5432/6380
- Stop local Docker infra (if running)
- Start Cloud SQL Auth Proxy to the `nexusdev-v2` instance on `127.0.0.1:5434` using your `gcloud` ADC
- Start the API dev server on `http://localhost:8000`
- Start the API worker
- Start the web dev server on `http://localhost:3000`

For deeper troubleshooting and alternative flows (prod DB, manual proxy, etc.), see `docs/onboarding/dev-stack.md`.

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
