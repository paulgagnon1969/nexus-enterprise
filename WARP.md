# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Monorepo layout and architecture

- JavaScript/TypeScript monorepo managed by Turborepo with npm workspaces.
- Root workspaces are `apps/*` and `packages/*` (configured in `package.json`).
- High-level structure (current state):
  - `apps/api`: NestJS 11 Fastify HTTP API using Prisma and a shared `@repo/database` package.
  - `apps/web`: Next.js 14 app (React 18) for the main web experience.
  - `packages/database`: Shared Prisma + TypeScript database access layer, exposed as `@repo/database`.
  - `infra/docker`: Docker Compose for local Postgres and Redis.
  - `docs/*`: Architecture notes, API contracts, and onboarding docs for Nexus Connect (NCC).
- Some docs reference additional apps/packages (admin, mobile, ncc, ui, types, config, email). Treat those as **target/plan**, not necessarily present in the filesystem yet.

### Root config

- `package.json`
  - Monorepo scripts and workspace configuration.
  - Key scripts:
    - `dev`: `turbo dev` (runs dev tasks for all apps/packages that define a `dev` script).
    - `dev:api`: `turbo dev --filter=api` (API-only dev).
    - `dev:all`: `turbo dev --parallel` (all dev targets in parallel; noisy but useful during local development).
    - `dev:clean`: `bash ./scripts/dev-clean.sh` (if present; use for cleaning/refreshing the dev environment).
    - `build`: `turbo build` (build all apps/packages that define a `build` script).
    - `lint`: `turbo lint` (fan-out lint tasks; note that some workspaces currently have `lint` as a no-op `echo`).
    - `check-types`: `turbo run check-types` (TS type checking across the workspace).
    - `format`: `prettier --write .` (opinionated formatting pass over the repo).
- `turbo.json`
  - Defines generic `dev`, `build`, `lint`, and `check-types` behaviors and dependencies.
  - `dev` is `persistent: true` and `cache: false` (long-running processes, e.g., API server, Next dev).
  - `build` tasks depend on `^build` (build upstream dependencies first).
  - `lint` and `check-types` also depend on their transitive equivalents.
  - `globalEnv`: `DATABASE_URL`, `REDIS_URL` are propagated to tasks.
- `tsconfig.json`
  - Root TS config extended by `apps/*` and `packages/*`.
  - Important `paths`:
    - `@repo/database/*` → `packages/database/src/*`
    - `@repo/types/*` → `packages/types/src/*` (planned or existing shared types package).

## Apps

### API (`apps/api`)

- Tech stack: NestJS 11, Fastify adapter, `@nestjs/config`, JWT auth, Passport, Redis, Prisma via `@repo/database`.
- Config and build:
  - `tsconfig.json` extends the root config, sets `outDir` to `dist`, `rootDir` to `src`, and enables decorators.
  - `tsconfig.build.json` excludes `**/*.spec.ts`, `node_modules`, and `dist` for production builds.
  - `ConfigModule.forRoot` is global and reads env vars from `.env` in both the app and repo root via `envFilePath: [".env", "../../.env"]`.
- Scripts (from `apps/api/package.json`):
  - `dev`: `ts-node-dev --respawn --transpile-only src/main.ts` (start Nest API in watch mode).
  - `worker:dev`: `ts-node-dev --respawn --transpile-only src/worker.ts` (start background worker in watch mode).
  - `build`: `tsc -p tsconfig.build.json` (compile TS to JS in `dist/`).
  - `start`: `node dist/main.js` (run compiled API).
  - `worker`: `node dist/worker.js` (run compiled worker).
  - `check-types`: `tsc -p tsconfig.json --noEmit` (type-check API only).
  - `lint`: `echo 'lint disabled'` (no-op; relies on root/Turbo lint if/when configured).

**API dev workflows**

- Run only the HTTP API in dev mode (preferred during backend work):
  - From repo root: `npm run dev:api`
  - Or from `apps/api`: `npm run dev`
- Build and run compiled API + worker:
  - From `apps/api`:
    - `npm run build`
    - `npm start` (HTTP API)
    - `npm run worker` (background worker processing BullMQ queues).
- API-only type-check:
  - From `apps/api`: `npm run check-types`

**API module layout (Nest)**

- `src/app.module.ts` wires the application:
  - Global infra modules: `PrismaModule` (database), `RedisModule` (Redis client), `CommonModule` (shared services such as email/audit).
  - Domain modules under `src/modules/*` (imported into `AppModule`):
    - Core/system: `health`, `auth`, `admin`, `job-status`.
    - Tenancy & org: `company`, `roles`, `tag`, `reputation`.
    - Work management: `project`, `task`, `parcel`, `daily-log`.
    - Lifecycle & onboarding: `onboarding`, `skills`, `import-jobs`.
  - `DevController` is registered directly on the root module for dev-only endpoints.
- `src/common/common.module.ts` is marked `@Global()` and exports shared infrastructure services (e.g., `AuditService`, `EmailService`).
- `src/infra/prisma/prisma.module.ts` and `src/infra/redis/redis.module.ts` are `@Global()` modules exposing `PrismaService` and `RedisService` singletons to the rest of the app.
- `src/modules/auth/auth.module.ts`:
  - Uses `JwtModule` with `JWT_ACCESS_SECRET` and `JWT_ACCESS_TTL` from env.
  - Provides `AuthService`, `JwtStrategy`, and role-based guards (`RolesGuard`, `GlobalRolesGuard`) backed by Nest's `Reflector`.
- Domain modules (e.g., `user`, `project`, `daily-log`, `import-jobs`) follow the standard `Module + Service + Controller` pattern and should encapsulate their domain-specific logic.

### Web (`apps/web`)

- Tech stack: Next.js 14, React 18, TypeScript.
- Scripts (from `apps/web/package.json`):
  - `dev`: `next dev -p 3000` (Next dev server on port 3000).
  - `build`: `next build` (production build).
  - `start`: `next start` (serve compiled app).
  - `lint`: `echo 'lint disabled'` (linting currently disabled at the app level; rely on root/Turbo lint if configured).
  - `check-types`: `tsc -p tsconfig.json --noEmit` (type-check web app only).
- TS config: `apps/web/tsconfig.json` is a standard Next.js TS config (ESNext modules, `jsx: "preserve"`, incremental, `next` TS plugin).
- `next.config.mjs` currently only enables `reactStrictMode: true`.

**Web dev workflows**

- Run only the web app in dev mode:
  - From `apps/web`: `npm run dev`
  - (Docs mention `npm run dev:web` at the root, but that script is not currently defined; prefer the app-local command.)
- Build and start web app:
  - From `apps/web`:
    - `npm run build`
    - `npm start`
- Web-only type-check:
  - From `apps/web`: `npm run check-types`

## Shared packages

### Database (`packages/database`)

- Purpose: shared database access layer using Prisma, reused by the API and any other services.
- `packages/database/package.json` scripts:
  - `prisma:migrate`: `prisma migrate dev` (run dev migrations; requires `DATABASE_URL`).
  - `prisma:generate`: `prisma generate` (generate Prisma client from `prisma/schema.prisma`).
  - `build`: `tsc -p tsconfig.json` (compile TS to `dist/`).
  - `check-types`: `tsc -p tsconfig.json --noEmit`.
  - `lint`: `echo 'lint disabled'` (no-op lint stub).
  - `import:xact`: `ts-node src/run-import-xact.ts`.
  - `import:xact-components`: `ts-node src/run-import-xact-components.ts`.
  - `allocate:xact-components`: `ts-node src/run-allocate-xact-components.ts`.
- `tsconfig.json` extends the root config, sets `outDir: dist`, and emits declarations/maps. Includes `src` and `prisma`, and configures `ts-node` in `transpileOnly` mode for scripts.

**Domain model (Prisma schema overview)**

- The canonical data model lives in `packages/database/prisma/schema.prisma` and is **rich**; treat it as the single source of truth for backend entities.
- Key domains (non-exhaustive):
  - **Tenants & organization templates**: `Company`, `CompanyKind`, `OrganizationTemplate`, `OrganizationTemplateVersion`, `OrganizationModuleOverride` and related module/article models.
  - **Users & membership**: `User`, `UserPortfolio`, `UserPortfolioHr`, `CompanyMembership`, `CompanyInvite`, `GlobalRole`, `UserType`.
  - **Permissions & roles**: `PermissionResource`, `RoleProfile`, `RolePermission`, plus per-project membership (`ProjectMembership`, `ProjectRole`, `ProjectParticipantScope`, `ProjectVisibilityLevel`).
  - **Projects & physical structure**: `Project`, `Parcel`, `ProjectBuilding`, `ProjectUnit`, `ProjectParticle`, `JobStatus`.
  - **SOW / financials / Xactimate imports**: `EstimateVersion`, `RawXactRow`, `RawComponentRow`, `ComponentSummary`, `Sow`, `SowItem`, `SowComponentAllocation`, `ComponentAllocationRule`, `ProjectFinancialSnapshot`.
  - **Tags & metadata**: `Tag`, `TagAssignment`, `NameAlias`.
  - **Daily operations**: `DailyLog`, `DailyLogAttachment`, `Task` (with `TaskStatus`, `TaskPriority`).
  - **Onboarding**: `OnboardingSession`, `OnboardingProfile`, `OnboardingDocument`, `OnboardingBankInfo`, `OnboardingSkillRating`, `OnboardingStatus`, `OnboardingDocumentType`.
  - **Skills & reputation**: `SkillCategory`, `SkillDefinition`, `UserSkillRating`, `EmployerSkillRating`, `ClientSkillRating`, `UserSkillSuggestion`, `ReputationRating` and related enums.
  - **Imports & ETL**: `ImportJob` (with `ImportJobType`, `ImportJobStatus`), `PetlEditSession`, `PetlEditChange`.
- When evolving the domain, prefer to:
  - Update `schema.prisma` first.
  - Run `npm run prisma:migrate` and `npm run prisma:generate` from `packages/database`.
  - Consume the generated client via the shared `@repo/database` package inside `apps/api` (through `PrismaService`).

**Database workflows**

- Run Prisma migrations (local dev):
  - From `packages/database`: `npm run prisma:migrate`
- Regenerate Prisma client after schema changes:
  - From `packages/database`: `npm run prisma:generate`
- Build and type-check the database package:
  - From `packages/database`:
    - `npm run build`
    - `npm run check-types`
- Xactimate/CSV import tooling (data ingestion experiments and backfills):
  - From `packages/database`:
    - `npm run import:xact`
    - `npm run import:xact-components`
    - `npm run allocate:xact-components`
  - Ensure `DATABASE_URL` (and any other required env vars) are set before running.

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

**Infra workflows**

- Start local Postgres and Redis for API development:
  - From repo root: `docker compose -f infra/docker/docker-compose.yml up -d`
- Stop local infra:
  - `docker compose -f infra/docker/docker-compose.yml down`

## Docs and migration plans

- `docs/README.md` explains doc layout:
  - `architecture/` for high-level system design.
  - `api-contracts/` for HTTP/tRPC contracts.
  - `onboarding/` for setup guides and runbooks.
- `docs/onboarding/README.md` contains additional app-level notes for a **larger target monorepo** (web, admin, mobile, api). Some of this is legacy and may not reflect the current directory layout; treat it as context, not ground truth.
- `docs/architecture/ncc-overview.md` describes the planned NCC app (`apps/ncc`) and surrounding ecosystem:
  - NCC as the primary control surface for NEXUS.
  - Target layout with `apps` (web, admin, mobile, api, ncc), `packages` (ui, types, config, database, email), and `infra` (docker, terraform, github, scripts).
- `docs/data/Migrate Nexus API from Laravel to Node+tRPC and align monorepo structure.md` is a **migration design doc** for moving from a Laravel API to a Node+tRPC backend:
  - It assumes a previous state with Laravel and additional apps/packages that may no longer exist exactly as described.
  - Use it as architectural guidance (target structure, shared `packages/types`, `packages/config`, tRPC layering), not as an exact description of the current codebase.

## Testing status

- There is currently **no test runner wired into the workspace**:
  - No `test` scripts are defined in the root `package.json` or in `apps/api`, `apps/web`, or `packages/database`.
  - There are no Jest/Vitest config files checked in.
- As a result, there is **no canonical command to run a single test** yet.
  - If you introduce tests, prefer to add `"test"` scripts in each workspace and (optionally) a Turbo `test` task, so future agents can run:
    - All tests in a workspace: `npm test` (from that workspace).
    - A single test file: `npm test -- path/to/file.test.ts` (or the equivalent for your chosen runner).

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
- Align code changes with the target architecture in `docs/architecture/ncc-overview.md` and the API migration plan in `docs/data/Migrate Nexus API from Laravel to Node+tRPC and align monorepo structure.md`, while respecting the **current** NestJS + Prisma implementation.
- When adding new backend capabilities, consider placing shared logic in `packages/database` (or future shared packages like `packages/types`) and consuming it from `apps/api` rather than duplicating logic in the app.
- For significant architectural changes, update the relevant docs in `docs/architecture` and `docs/onboarding` so they remain the source of truth for future contributors and agents.
