# NCC Architecture Plan

## Executive summary
NCC will be the primary control surface for NEXUS: a unified, web-based control center that brings together project and team management, daily operational insights, and configuration in a single, coherent experience. It is implemented as a first-class app (`apps/ncc`) within the existing Turborepo monorepo, reusing shared UI components, a common Laravel API backend, and shared types/config packages.

In v1, NCC focuses on providing a robust shell (navigation, layout, theming), consolidated dashboards, and configuration panels, all backed by the existing Laravel API and MySQL database. Over time, its architecture is designed to support additional services (analytics, notifications, integrations) without major rewrites, through clear domain boundaries, a shared API client, and documented contracts.

## Problem statement
NEXUS needs a clearly documented architecture for the new “NCC” experience that fits into the existing monorepo and clarifies system boundaries, data flows, and responsibilities across apps, backend services, and shared packages.

## Goals
- Describe the intended role of NCC within the broader NEXUS ecosystem.
- Align NCC with the existing monorepo layout (apps, packages, infra, docs) without breaking current flows.
- Define high-level system components (frontends, backend, shared services) and their responsibilities.
- Capture key data flows (auth, projects, daily logs, any new NCC-specific domains).
- Identify open questions and decisions that need your input before detailed design.

## Current context (high level)
- Monorepo managed by Turborepo with multiple apps (web, admin, mobile, api) and shared packages (UI, TS config, ESLint config, etc.).
- Frontend apps share core business flows (login, project dashboard, daily logging) via a shared UI package.
- Backend is a Laravel API with MySQL, exposed via HTTP and consumed by the frontends using bearer tokens.
- Docs folder exists but architecture docs are currently skeletal and not NCC-specific.

## NCC high-level vision (draft)
This is intentionally a draft to be refined with you.

- NCC acts as the primary control surface for NEXUS: a unified experience to manage projects, teams, and operational insights.
- NCC should feel like a “first-class app” within the monorepo, reusing as much of the existing shared UI and API as possible while allowing new NCC-specific modules.
- NCC should be designed from day one with clear boundaries so future services (analytics, notifications, integrations) can plug in without a major rewrite.

## Proposed monorepo placement

### apps/
- `apps/web` – public/login + lightweight project interactions.
- `apps/admin` – admin-specific controls; may evolve into or be superseded by NCC.
- `apps/mobile` – on-the-go logging and basic dashboards.
- `apps/api` – Laravel backend.
- `apps/ncc` (NEW) – NCC frontend (Next.js or similar) as the primary control center.

### packages/
- `packages/ui` – shared components; extend with NCC-specific layout primitives where applicable.
- `packages/types` – shared TypeScript types for API contracts, domain models (projects, users, logs, NCC-specific entities).
- `packages/utils` – shared utilities (API client, auth helpers, feature flags, date/time, etc.).
- `packages/config` – shared configuration (ESLint, TSConfig, design tokens if appropriate).

### infra/
- `infra/docker` – Docker and compose definitions for local dev.
- `infra/terraform` – cloud infra definitions (VPC, DB, queues, storage, etc.).
- `infra/github` – GitHub Actions / CI workflows.
- `infra/scripts` – helper scripts for local/dev/prod automation.

### docs/
- `docs/architecture/ncc-overview.md` – this plan plus diagrams.
- `docs/api-contracts/ncc/*.md` – NCC-facing API contracts.
- `docs/onboarding/ncc.md` – how to run and work on NCC.

## System components

### 1. NCC frontend (`apps/ncc`)
- Likely built on Next.js, aligned with existing web/admin apps.
- Responsibilities:
  - Shell (navigation, layout, theming) for NCC.
  - Feature surfaces for:
    - Project and team management.
    - Operational dashboards (metrics, recent activity, alerts).
    - Configuration panels (integrations, notification settings, feature flags).
  - Auth integration using the same token model as existing apps (or a well-defined evolution of it).
- Implementation notes:
  - Reuse shared UI from `packages/ui` where possible; add NCC-specific components in either `packages/ui` or a new `packages/ui-ncc` namespace.
  - Consume a shared API client layer (see below) to avoid scattering `fetch` calls.

### 2. Backend services (`apps/api` and beyond)
- Start with the existing Laravel API as the primary backend for NCC.
- Responsibilities:
  - Auth, authorization, and user management.
  - Project and team CRUD, plus any NCC-specific concepts (e.g., workspaces, organizations, roles).
  - Daily logs and operational data ingestion.
  - Aggregate endpoints for NCC dashboards (e.g., metrics, summaries, trend lines).
- Future-proofing:
  - Define clear domain modules (e.g., Projects, Teams, Logs, Analytics) in Laravel so they can be separated into services later if needed.
  - Consider a lightweight internal API versioning strategy for NCC-critical endpoints.

### 3. Shared API client and types
- Introduce or formalize a shared API client, used by `apps/web`, `apps/admin`, `apps/mobile` (where appropriate), and `apps/ncc`:
  - Centralized base URL resolution (env-based, avoids hard-coded `http://localhost/...`).
  - Automatic injection of auth token.
  - Standardized error handling and response shaping.
- Backed by shared TypeScript types in `packages/types` to describe:
  - Core entities: `User`, `Project`, `Team`, `DailyLog`, `Organization`, `Role`, etc.
  - NCC-specific DTOs: dashboard summaries, filter/query parameters, configuration payloads.

### 4. Auth and session model
- Short term:
  - Keep the current bearer-token-in-`localStorage` approach to minimize disruption.
  - Ensure NCC reads/writes the same token key, or introduce a new unified auth context consumed by all apps.
- Medium term (optional evolution):
  - Move to HttpOnly cookies and a backend session model for better security.
  - Introduce a small frontend auth SDK in `packages/utils` to hide storage details.

### 5. Data and persistence
- Continue using MySQL as the primary system of record.
- Organize NCC-specific tables and migrations under clearly named domains (e.g., `ncc_dashboards`, `ncc_settings`, `organizations`, `team_memberships`).
- Consider read-optimized views or materialized aggregates for NCC dashboards if performance requires it.

### 6. Observability and operations
- Log NCC-specific events (e.g., user actions, configuration changes) in a structured way.
- Plan for metrics and tracing (e.g., via Laravel telemetry plus your preferred APM).
- Define a basic SLO/SLA target for NCC (uptime, latency) to guide infra decisions.

## Documentation and diagrams
- Create `docs/architecture/ncc-overview.md` as the canonical document for NCC architecture.
- Include diagrams for:
  - High-level component map (frontends, backend, DB, external integrations).
  - Request flow for a typical NCC operation (e.g., loading the main dashboard).
  - Auth flow for login and token/session management.

## Open questions
- What is the exact scope of NCC v1? (e.g., is it primarily an admin console, or a combined admin + operations dashboard for day-to-day users?)
- Do you want NCC to replace the existing admin app, or sit alongside it initially?
- Any hard constraints on tech choices for `apps/ncc` (Next.js vs another framework, SSR/ISR needs, etc.)?
- Any specific third-party integrations that NCC must account for in its initial architecture (e.g., observability, billing, task trackers)?
- Are there compliance/security requirements (e.g., SOC 2, data residency) that should influence architecture from day one?