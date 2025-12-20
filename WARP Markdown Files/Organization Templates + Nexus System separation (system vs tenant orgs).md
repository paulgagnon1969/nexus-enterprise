# Problem statement
We need a first-class “template” concept for organizations (companies) so that Super Admins can provision new organizations with predefined configuration, module access entitlements, and administrative policy articles. We also need to ensure the national applicant pool stays isolated to Nexus System and cannot be confused with tenant organizations.
# Current state (relevant)
* Tenancy is currently modeled via `Company` (org) + `CompanyMembership`.
* SUPER_ADMIN-only system endpoints exist under `apps/api/src/modules/admin/*`.
* `/system` exists in the web app and is SUPER_ADMIN-gated client-side; it lists companies via `GET /admin/companies`.
* Public recruiting flow creates “pool” users via `POST /onboarding/start-public` and attaches them to `RECRUITING_COMPANY_ID`.
# Proposed changes
## Data model (Prisma)
1) Add `CompanyKind` enum and `Company.kind` field:
* `Company.kind: CompanyKind @default(ORGANIZATION)`
* `CompanyKind = SYSTEM | ORGANIZATION`
Purpose: explicitly separate Nexus System from tenant orgs.
2) Add applicant user type:
* Extend `UserType` enum with `APPLICANT` (or `CONTRACTOR_POOL`).
Purpose: allow routing + access shaping for pool users.
3) Add templates:
* `OrganizationTemplate` (system-owned, global list)
    * `id`, `code` (unique), `label`, `description?`, `active`, `createdAt`, `updatedAt`
* `OrganizationTemplateModule`
    * `id`, `templateId`, `moduleCode`, `enabled`, `configJson?`
    * Unique constraint on `(templateId, moduleCode)`
* `OrganizationTemplateArticle`
    * `id`, `templateId`, `slug`, `title`, `body`, `sortOrder`, `active`
    * Unique constraint on `(templateId, slug)`
4) Org entitlements (resolved at runtime, with overrides):
* `OrganizationModuleEntitlement`
    * `id`, `companyId`, `moduleCode`, `enabled`, `configJson?`, `sourceTemplateId?`
    * Unique constraint on `(companyId, moduleCode)`
## API (NestJS)
1) Recruiting isolation
* In `OnboardingService.startPublicSession`, set `userType = APPLICANT`.
* Validate that `RECRUITING_COMPANY_ID` references a `Company` with `kind=SYSTEM` (fail fast if misconfigured).
2) Templates CRUD (SUPER_ADMIN)
* Add `SystemTemplatesController` under `apps/api/src/modules/admin` or a new `system` module with:
    * `GET /admin/templates` (list templates)
    * `POST /admin/templates` (create template)
    * `GET /admin/templates/:id` (template detail)
    * `PUT /admin/templates/:id` (edit template metadata)
    * `PUT /admin/templates/:id/modules` (set module entitlements)
    * `PUT /admin/templates/:id/articles` (set policy articles)
3) Provision org from template (SUPER_ADMIN)
* Add `POST /admin/companies/provision`
    * input: `name`, `templateId`
    * behavior:
        * create `Company(kind=ORGANIZATION)`
        * attach SUPER_ADMIN memberships (existing logic already does this on company creation; keep or explicitly ensure)
        * materialize `OrganizationModuleEntitlement` rows from template modules
        * optionally seed other config later (role profiles/tags) as a second phase
## Web (Next.js)
1) System templates UI
* Add `/system/templates`:
    * list templates
    * create template
    * edit template: modules + articles (simple forms)
2) Create organization dialog uses templates
* Update `/system` “New Organization” dialog to:
    * load templates from `GET /admin/templates`
    * call `POST /admin/companies/provision` with `name` + `templateId`
3) Applicant routing
* Update login redirect and `/` redirect logic:
    * If `userType === APPLICANT`, route to `/candidate` (new minimal candidate landing)
    * If `globalRole === SUPER_ADMIN`, route to `/system`
    * Else `/projects`
* Add `/candidate` placeholder page (later: candidate portal)
* Optionally hide top-nav modules in `AppShell` for `APPLICANT`.
## Enforcement (phase 1 vs phase 2)
* Phase 1 (this pass): store entitlements + hide/guard UI routes.
* Phase 2: add API enforcement guard (reject module endpoints when disabled for org).
# Open decisions required (blocking)
* Module/product list: initial `moduleCode` values we will support in the UI.
* Template inheritance semantics: entitlements inherit (recommended) vs snapshot-only.
# Rollout steps
1) Prisma schema change + migration.
2) API endpoints for templates + provision.
3) Web `/system/templates` UI.
4) Wire create-org dialog to provision endpoint.
5) Applicant userType + routing updates.
6) Type-check web + api.