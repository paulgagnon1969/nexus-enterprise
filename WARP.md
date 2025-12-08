# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Monorepo layout and architecture

- This is a JavaScript/TypeScript monorepo managed by Turborepo with npm workspaces.
- Root workspaces are `apps/*` and `packages/*` (configured in `package.json`).
- High-level structure:
  - `apps/api`: NestJS Fastify HTTP API using Prisma and a shared `@repo/database` package.
  - `apps/web`: Next.js 14 app (React 18) for the main web experience.
  - `packages/database`: Shared Prisma + TypeScript database access layer, exposed as `@repo/database`.
  - `infra/docker`: Docker Compose for local Postgres and Redis.
  - `docs/*`: Architecture notes, API contracts, and onboarding docs for Nexus Connect (NCC).

### Root config

- `package.json`
  - Monorepo scripts and workspace configuration.
  - Key scripts:
    - `dev`: `turbo dev` (runs dev tasks for all apps/packages that define a `dev` script).
    - `dev:api`: `turbo dev --filter=api` (API-only dev).
    - `dev:all`: `turbo dev --parallel` (all dev targets in parallel; noisy but useful during local development).
    - `dev:clean`: `bash ./scripts/dev-clean.sh` (if present; use for cleaning/refreshing the dev environment).
    - `build`: `turbo build` (build all apps/packages that define a `build` script).
    - `lint`: `turbo lint` (fan-out lint tasks).
    - `check-types`: `turbo run check-types` (TS type checking across the workspace).
    - `format`: `prettier --write .` (opinionated formatting pass over the repo).
- `turbo.json`
  - Defines generic `dev`, `build`, `lint`, and `check-types` behaviors and dependencies.
  - `dev` is `persistent: true` and `cache: false` (long-running processes, e.g., API server, Next dev).
  - `build` tasks depend on `^build` (build upstream dependencies first).
  - `lint` and `check-types` also depend on their transitive equivalents.
- `tsconfig.json`
  - Root TS config extended by `apps/*` and `packages/*`.
  - Important `paths`:
    - `@repo/database/*` → `packages/database/src/*`
    - `@repo/types/*` → `packages/types/src/*` (planned or existing shared types package).

## Apps

### API (`apps/api`)

- Tech stack: NestJS 11, Fastify adapter, `@nestjs/config`, JWT auth, Passport, Redis, Prisma via `@repo/database`.
- Entry and build configuration:
  - `tsconfig.json` extends root config, sets `outDir` to `dist`, `rootDir` to `src`, and enables decorators.
  - `tsconfig.build.json` excludes `**/*.spec.ts`, `node_modules`, and `dist` for production builds.
- Scripts (from `apps/api/package.json`):
  - `dev`: `ts-node-dev --respawn --transpile-only src/main.ts` (start Nest API in watch mode).
  - `build`: `tsc -p tsconfig.build.json` (compile TS to JS in `dist/`).
  - `start`: `node dist/main.js` (run compiled API).
  - `check-types`: `tsc -p tsconfig.json --noEmit` (type-check API only).
  - `lint`: `eslint src --ext .ts` (API-only lint).

**Common API workflows**

- Run only the API in dev mode (preferred during backend work):
  - From repo root: `npm run dev:api`
  - Directly within `apps/api`: `npm run dev`
- Build and run compiled API:
  - From `apps/api`:
    - `npm run build`
    - `npm start`
- API-only lint and type-check:
  - From `apps/api`:
    - `npm run lint`
    - `npm run check-types`
- When editing Prisma/database logic used by the API, prefer to make changes in `packages/database` (see below) and import from there instead of accessing Prisma directly inside `apps/api`.

### Web (`apps/web`)

- Tech stack: Next.js 14, React 18, TypeScript.
- Scripts (from `apps/web/package.json`):
  - `dev`: `next dev -p 3000` (Next dev server on port 3000).
  - `build`: `next build` (production build).
  - `start`: `next start` (serve compiled app).
  - `lint`: `echo 'lint disabled'` (linting currently disabled at the app level; rely on root/Turbo lint if configured).
  - `check-types`: `tsc --noEmit` (type-check web app only).
- TS config: `apps/web/tsconfig.json` extends root TS config and enables Next.js-specific TS options (`jsx: preserve`, incremental builds, Next TS plugin).

**Common web workflows**

- Run only the web app in dev mode:
  - From repo root (if a script exists): `npm run dev:web` (see `docs/onboarding/README.md`).
  - Or from `apps/web`: `npm run dev` (Next dev server).
- Build and start web app:
  - From `apps/web`:
    - `npm run build`
    - `npm start`
- Web-only type-check:
  - From `apps/web`: `npm run check-types`

## Shared packages

### Database (`packages/database`)

- Purpose: shared database access layer using Prisma, reused by the API and any other services.
- `packages/database/package.json`:
  - Scripts:
    - `prisma:migrate`: `prisma migrate dev` (run dev migrations; requires `DATABASE_URL`).
    - `prisma:generate`: `prisma generate` (generate Prisma client).
    - `build`: `tsc -p tsconfig.json` (compile TS to `dist/`).
    - `check-types`: `tsc -p tsconfig.json --noEmit`.
    - `lint`: `eslint src --ext .ts`.
    - `import:xact`: `ts-node src/run-import-xact.ts` (custom CSV/Xact import routine – used for data ingestion/migrations).
  - Dependencies: `@prisma/client`, `csv-parse`.
- `tsconfig.json` extends root config, sets `outDir: dist`, and emits declarations/maps. Includes `src` and `prisma`, and configures `ts-node` in `transpileOnly` mode for scripts.

**Common database workflows**

- Run Prisma migrations (local dev):
  - From `packages/database`: `npm run prisma:migrate`
- Regenerate Prisma client after schema changes:
  - From `packages/database`: `npm run prisma:generate`
- Build and type-check the database package:
  - `npm run build`
  - `npm run check-types`
- Run the Xact import script:
  - From `packages/database`: `npm run import:xact`
  - Ensure required environment variables (e.g., `DATABASE_URL`) are configured before running.

## Infrastructure

### Docker (`infra/docker`)

- `infra/docker/docker-compose.yml` defines local infrastructure for backend services:
  - `postgres` (Postgres 16):
    - Port: `5432` on host.
    - Env vars: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.
    - Volume: `nexus-postgres-data`.
  - `redis` (Redis 7):
    - Port: `6380` on host mapped to `6379` in container.
    - Volume: `nexus-redis-data`.

**Common infra workflows**

- Start local Postgres and Redis for API development:
  - From repo root: `docker compose -f infra/docker/docker-compose.yml up -d`
- Stop local infra:
  - `docker compose -f infra/docker/docker-compose.yml down`

## Docs and domain knowledge

- `docs/README.md` explains doc layout:
  - `architecture/` for high-level system design.
  - `api-contracts/` for HTTP/tRPC contracts.
  - `onboarding/` for setup guides and runbooks.
- `docs/onboarding/README.md` contains additional app-level notes (including legacy references to `admin`, `mobile`, and tRPC migration plans). Treat these as context, not necessarily an exact reflection of the current filesystem.
- `docs/architecture/ncc-overview.md` and `docs/data/Migrate Nexus API from Laravel to Node+tRPC and align monorepo structure.md` describe the desired future architecture:
  - Monorepo with `apps` (web, admin, mobile, api, ncc), `packages` (ui, types, config, database, email), `infra` (docker, terraform, github, scripts), and `docs`.
  - Node + tRPC backend in `apps/api` using Prisma and shared packages.
  - NCC (`apps/ncc`) as the primary control surface for NEXUS.
- When making architectural changes, consult these docs to stay aligned with the intended target state and keep them updated as the implementation evolves.

## Running common tasks from the root

Use these when coordinating across multiple apps/packages:

- Start dev for all apps/packages with dev scripts:
  - `npm run dev` (may be noisy; prefer filtered dev scripts when working on a single app).
- API-only dev:
  - `npm run dev:api`
- Build everything:
  - `npm run build`
- Lint everything (where lint scripts exist):
  - `npm run lint`
- Type-check everything:
  - `npm run check-types`
- Format the repo:
  - `npm run format`

## How future agents should work here

- Prefer running tasks via root `npm` scripts when touching multiple apps; drop into app/package directories only when you need fine-grained control.
- Align code changes with the target architecture in `docs/architecture/ncc-overview.md` and the API migration plan in `docs/data/Migrate Nexus API from Laravel to Node+tRPC and align monorepo structure.md`.
- When adding new backend capabilities, consider placing shared logic in `packages/database` (or future shared packages like `packages/types`) and consuming it from `apps/api` rather than duplicating logic in the app.
- For significant architectural changes, update the relevant docs in `docs/architecture` and `docs/onboarding` so they remain the source of truth for future contributors and agents.
