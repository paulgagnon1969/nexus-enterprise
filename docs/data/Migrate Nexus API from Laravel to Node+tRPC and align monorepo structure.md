# Goal
Replace the existing Laravel API in `apps/api` with a Node.js + TypeScript tRPC backend using Prisma, and align the repository with the desired monorepo structure (apps, packages, infra, docs) while keeping web, admin, and mobile apps working.
## Current state (high level)
* Root
    * `package.json` with Turbo scripts (`build`, `dev`, `dev:web`, `dev:admin`, `dev:mobile`, `dev:api`, etc.) and workspaces `apps/*` and `packages/*`.
    * `turbo.json` defines generic `build`, `dev`, `dev:api`, `lint`, and `start` tasks.
* Apps
    * `apps/web`: Next.js 16 app with `app/`, `src/`, `public/`, and package name `web`. Depends on `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config`.
    * `apps/admin`: Next.js 16 app with `app/` and minimal dependencies, currently not using shared `@repo/ui` or shared configs.
    * `apps/mobile`: Expo Router app with `app/`, `components`, and Jest tests configured.
    * `apps/api`: Laravel 12 app (PHP + Composer) with `composer.json`, `artisan`, `routes`, `database`, etc.
* Packages
    * `packages/ui`: shared UI components (React/React Native) published as `@repo/ui`.
    * `packages/eslint-config`: shared ESLint config published as `@repo/eslint-config`.
    * `packages/typescript-config`: shared TSConfig presets published as `@repo/typescript-config`.
    * `packages/utils`: shared helpers.
The desired target design introduces:
* `apps/api` as a Node + tRPC backend with `src/router`, `src/procedures`, `src/middleware`, `src/context.ts`, `src/trpc.ts`, and a Prisma schema.
* Additional shared packages: `packages/types`, `packages/config`, `packages/database`, `packages/email`.
* Infra and docs directories: `infra/*`, `docs/*`, `.github/workflows/*`.
## Proposed approach
We will:
1. Archive the existing Laravel app in a safe place (without deleting it) to keep it as a reference.
2. Scaffold a new TypeScript-based tRPC backend in `apps/api` with a minimal but correct structure.
3. Introduce `packages/database` and a root-level Prisma schema as a single source of truth for the data model.
4. Introduce `packages/types` to host shared domain types and Zod schemas used by both the backend and frontends.
5. Optionally reorganize existing config packages under `packages/config` while keeping existing imports working or updated.
6. Adjust Turbo configuration and workspace scripts so `npm run dev:api` runs the new Node API.
7. Gradually wire web, admin, and mobile apps to consume the new tRPC API.
## Detailed steps
### 1. Archive Laravel API safely
* Move current Laravel app out of the `apps/api` path used by the monorepo:
    * Rename `apps/api` → `apps/api-laravel` (or similar) so we keep the code but free up `apps/api` for the Node backend.
* Ensure `apps/api-laravel` is not treated as a workspace by the root `package.json` (workspaces are currently `apps/*` and `packages/*`). If necessary, adjust workspace globs later so `api-laravel` is excluded.
* Keep Docker and any DB migrations from the Laravel app around as a reference when designing the Prisma schema.
### 2. Scaffold new Node + tRPC app in `apps/api`
* Create a new `apps/api` directory with:
    * `package.json` for a TypeScript Node service, including dependencies:
        * Runtime: `@trpc/server`, `zod`, `@prisma/client`, `ts-node` (for dev), possibly `express` or `fastify` and `@trpc/server/adapters/express`.
        * Dev: `typescript`, `ts-node-dev` or `nodemon`, `@types/node`, `eslint` if we want local linting.
    * `tsconfig.json` extending the shared TS config from `@repo/typescript-config`.
    * `src/` structure:
        * `src/trpc.ts`: tRPC initialization and helper for building routers and procedures.
        * `src/context.ts`: request context, including Prisma client and auth info stub.
        * `src/router/index.ts`: root app router that merges sub-routers.
        * `src/router/auth.router.ts`, `project.router.ts`, `log.router.ts`, `tag.router.ts`, `workflow.router.ts`, `invoice.router.ts` as empty or minimally implemented routers.
        * `src/procedures/`: base procedures (e.g., `publicProcedure`, `protectedProcedure`).
        * `src/middleware/`: tRPC middlewares for logging and authentication (initially stubbed).
        * `src/server.ts`: actual HTTP server bootstrap (Express or similar) exposing `/trpc` endpoint.
    * Set up `scripts` in `apps/api/package.json`:
        * `dev`: run the server in watch mode (`ts-node-dev src/server.ts` or equivalent).
        * `build`: `tsc` (and emit to `dist/`).
        * `start`: `node dist/server.js`.
* Update `turbo.json` and root `package.json` so that `npm run dev:api` runs `turbo dev --filter=api` and the `api` app has a `dev` script recognized by Turbo.
### 3. Introduce Prisma and packages/database
* At the root, create a `prisma/` directory with a `schema.prisma` that represents the canonical data model.
* Create `packages/database` with:
    * `package.json` configured as a workspace (e.g., `@repo/database` or similar name).
    * `prisma/schema.prisma` (can re-use or reference the root `prisma/schema.prisma`).
    * `prisma/migrations/` for generated migrations.
    * `seeders/` for seed scripts.
* Configure Prisma:
    * Add `prisma` CLI as a dev dependency (likely at the root or inside `packages/database`).
    * Ensure `@prisma/client` is installed where it will be used (probably `apps/api` and possibly shared).
    * Set `DATABASE_URL` expectation (Env-based; infra will define actual values later).
* In `apps/api`, import and use Prisma client via `packages/database` (e.g., a helper that returns a singleton Prisma client).
### 4. Introduce packages/types
* Create `packages/types` with:
    * `package.json` defining a shared types package (e.g., `@repo/types`).
    * `src/index.ts` exporting domain types and Zod schemas, starting with a minimal set:
        * `User`, `Project`, `DailyLog`, etc.
* Use these schemas both in:
    * `apps/api` routers (for input/output validation with Zod).
    * Frontend apps (`apps/web`, `apps/admin`, `apps/mobile`) for typed API usage.
### 5. Optional: Introduce packages/config
* Create `packages/config` with:
    * `package.json` for a config meta-package (e.g., `@repo/config`).
    * Subdirectories or files for:
        * ESLint configs re-exporting or wrapping `packages/eslint-config`.
        * TSConfig presets re-exporting or wrapping `packages/typescript-config`.
        * Tailwind/PostCSS configs as they are introduced.
* Gradually migrate consumers to import from `@repo/config/*` instead of individual config packages while keeping compatibility.
### 6. Align app directory structures (web, admin, mobile)
* `apps/web`:
    * Create `app/(marketing)` and `app/(app)` directories.
    * Under `app/(app)`, create empty route directories for `dashboard`, `projects`, `logs`, `reports`, and `settings`.
    * Add `lib/`, `hooks/`, and `server/` directories for future API clients and server actions.
* `apps/admin`:
    * Under `app/`, create route directories: `users`, `companies`, `roles`, `billing`, and `billing/audit`.
    * Create `components/admin/` for admin-specific UI.
* `apps/mobile`:
    * Under `app/`, create `(tabs)`, `(modals)`, and `project` directories.
    * Ensure `components/`, `lib/`, and `services/` directories exist for shared UI and API clients.
* Keep existing pages/screens functioning; these steps are mostly structural and can start as empty directories.
### 7. Wire frontends to new tRPC API (initially minimal)
* Implement a minimal `health` or `ping` query in the new tRPC backend.
* From `apps/web`, `apps/admin`, and `apps/mobile`, implement a simple client call to this endpoint to validate end-to-end wiring.
    * For web/admin: either call via server components/server actions or a small client fetch helper.
    * For mobile: a simple React Query or direct tRPC client invocation.
* Once the plumbing works, gradually add real domain routers and migrate UX flows from Laravel-based endpoints.
## Out of scope for initial implementation
* Full domain modeling and migration of all Laravel routes to tRPC on day one.
* Production-ready authentication/authorization and multi-tenant handling.
* Full CI/CD workflows and infra (Terraform, Docker, etc.); we will only create placeholders for now if needed.
## Success criteria
* `apps/api` is a Node + TypeScript tRPC backend that:
    * Compiles and starts via `npm run dev:api` (through Turbo) without errors.
    * Exposes at least one working tRPC procedure (`health`/`ping`).
* `packages/database` and root `prisma/schema.prisma` exist and can be used to run `prisma generate`.
* `packages/types` exists and is used both by backend and at least one frontend app.
* Web, admin, and mobile apps still start and build successfully after the structural changes.
* The old Laravel API is preserved in `apps/api-laravel` (or similar) but no longer used by the monorepo tooling.
