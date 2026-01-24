# Goal
Wire up assignment metadata for Nex-Net / NCC so that:
* Prospective candidate views can distinguish **assigned vs unassigned** candidates across tenants.
* Assignment history (which tenant a candidate worked for, when) is persisted in the Nexus System in a way that can later be extended with pay-rate snapshots.
# Current state (high level)
* **Prospective candidates per tenant** are driven by `OnboardingSession` via:
    * `OnboardingService.listSessionsForCompany` and `listProspectsForCompany` (apps/api/src/modules/onboarding/onboarding.service.ts).
    * `Company Prospective Candidates` UI in `apps/web/app/company/users/page.tsx` expects a `CandidateRow` shape with session-level data (id, email, status, createdAt, profile, checklist, detailStatusCode, userId).
* **Global Nex-Net pool** is represented by:
    * Prisma `NexNetCandidate`, `CandidatePoolVisibility`, `CandidateTraining*`, `CandidateCertification*`, `CandidateInterest` models (packages/database/prisma/schema.prisma).
    * System view `/system/nex-net` backed by `ReferralsService.listCandidatesForSystem` and `ReferralsService.listCandidatesForFortified` (apps/api/src/modules/referrals/referrals.service.ts) returning raw `NexNetCandidate` + related refs.
* **Employment / membership** is encoded via:
    * `User` + `CompanyMembership` for tenant-specific employment.
    * Payroll/worker imports feed `Worker`, `DailyTimeEntry`, `PayrollWeekRecord` etc., but there is no explicit candidate-centric assignment history yet.
# Proposed changes
## 1. Introduce explicit DTOs for candidate views
We will standardize the shapes returned by the API without changing existing URL contracts.
### 1.1 Tenant-facing Prospective Candidate DTO
In `OnboardingService` (apps/api/src/modules/onboarding/onboarding.service.ts), define an internal TypeScript type (or interface) to describe what `listProspectsForCompany` returns, e.g.
```ts
interface AssignedTenantSummaryDto {
  companyId: string;
  companyName: string;
  companyRole: string | null; // primary role for the user in that tenant
  interestStatus: 'NONE' | 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'HIRED';
  isCurrentTenant: boolean;
}
interface ProspectiveCandidateDto {
  id: string;              // OnboardingSession.id
  companyId: string;       // owning company for this session
  candidateId: string | null;  // NexNetCandidate.id when linked
  userId: string | null;       // User.id when linked
  email: string;
  status: string;
  detailStatusCode: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  profile: any | null;        // onboardingProfile snapshot
  checklist: any | null;      // parsed from checklistJson
  profileCompletionPercent: number | null;
  assignedTenantCount: number;
  assignedHere: boolean;
  assignedElsewhere: boolean;
  assignedTenants: AssignedTenantSummaryDto[];
}
```
We will not export this type publicly from the module (to avoid tight coupling), but we will shape responses accordingly.
### 1.2 System-facing Nex-Net candidate DTO
In `ReferralsService` (apps/api/src/modules/referrals/referrals.service.ts), define a DTO used by `listCandidatesForSystem` and `listCandidatesForFortified`, e.g.
```ts
interface NexNetProspectDto {
  candidateId: string;      // NexNetCandidate.id
  userId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  createdAt: Date | null;
  primaryReferrerEmail: string | null;
  assignedTenantCount: number;
  assignedTenants: AssignedTenantSummaryDto[];
}
```
The system UI (`apps/web/app/system/nex-net/page.tsx`) can continue to treat the response as `any[]` or we can later align the front-end type with this DTO; for now we just add extra fields, keeping existing ones.
## 2. Compute assignment metadata from existing models
We will derive assignment information primarily from `CompanyMembership` and optionally from `CandidateInterest`.
### 2.1 Mapping OnboardingSession → NexNetCandidate → CompanyMembership
For `listProspectsForCompany(companyId, actor, statuses, detailStatusCodes)`:
1. **Fetch local + shared sessions** using the existing logic (reuse `listSessionsForCompany` for non-Fortified tenants; keep Fortified special-case behavior).
2. Extract:
    * `userIds` for sessions where `session.userId` is non-null.
    * Normalized emails for sessions as a fallback if `userId` is missing.
3. Query `NexNetCandidate` for candidates whose `userId` or `email` matches these identifiers, building maps:
    * `candidateByUserId: Map<string, NexNetCandidate>`
    * `candidateByEmail: Map<string, NexNetCandidate>`
4. For all relevant **userIds** (from sessions and candidates), query `CompanyMembership`:
    * `where: { userId: { in: userIds } }`
    * Select `companyId`, `role`, and `company.name`.
    * Build `membershipsByUserId: Map<string, CompanyMembership[]>`.
5. Optionally, query `CandidateInterest` for all candidates we resolved so far (candidateIds), grouping by `(candidateId, requestingCompanyId)` to surface `interestStatus` per tenant; this will be useful for history and future UI, but step 1 can rely solely on `CompanyMembership`.
### 2.2 Populate assignment fields for tenant DTO
For each session:
1. Resolve underlying `userId` and normalized email.
2. Resolve `candidateId` via the maps built above.
3. Collect memberships for that `userId` across all companies; for each membership, map into an `AssignedTenantSummaryDto`:
    * `companyId`, `companyName` from `membership.company`.
    * `companyRole` from membership.role.
    * `interestStatus` from `CandidateInterest` (if present for `(candidateId, companyId)`), otherwise:
        * If `companyId === session.companyId` and session.status is in `APPROVED`/`HIRED` range, treat as `'HIRED'`.
        * Else `'NONE'`.
    * `isCurrentTenant = (companyId === actor.companyId)`.
4. Compute:
    * `assignedTenantCount = assignedTenants.length`.
    * `assignedHere = assignedTenants.some(t => t.companyId === companyId)` (the owning company of this session).
    * `assignedElsewhere = assignedTenantCount > 0 && !assignedHere`.
The DTO returned from `listProspectsForCompany` will then include these properties alongside the existing profile/checklist data.
### 2.3 Populate assignment fields for system Nex-Net DTO
For `listCandidatesForSystem(actor)` and `listCandidatesForFortified(actor)`:
1. Keep the existing `findMany` call over `NexNetCandidate` (including `user` and `referralsAsReferee`), but add:
    * A separate query over `CompanyMembership` for `userId` in the returned candidates.
    * A query over `CandidateInterest` for `candidateId` in the returned candidates.
2. For each candidate, build `AssignedTenantSummaryDto[]` by:
    * Looking up all memberships for their `userId`.
    * Enriching with any `CandidateInterest` rows matching `(candidateId, companyId)` to set `interestStatus` appropriately.
3. Set `assignedTenantCount = assignedTenants.length`.
The HTTP responses for `/referrals/system/candidates` and `/referrals/fortified/candidates` will now be reshaped into arrays of `NexNetProspectDto`, preserving all existing fields used by the web app and adding the assignment fields.
## 3. Persist basic assignment history with pay-rate snapshots
To keep an auditable assignment history in the Nexus System, we will start using the existing `CandidateInterest` model as the primary log of cross-tenant employment, and add optional pay snapshot fields.
### 3.1 Extend CandidateInterest with pay and date fields
In `packages/database/prisma/schema.prisma`, extend `CandidateInterest` as follows (conceptually):
* Add columns:
    * `employmentStartDate DateTime?`
    * `employmentEndDate DateTime?`
    * `baseHourlyRate Float?`
    * `dayRate Float?`
    * `cpHourlyRate Float?`
    * `cpFringeHourlyRate Float?`
These will capture the main pay-rate snapshot at the time a candidate is hired for a tenant, and optionally when assignments end.
A corresponding Prisma migration will be needed to add these nullable columns.
### 3.2 Create or update CandidateInterest entries on key lifecycle events
We will write service helpers in `OnboardingService` and/or `ReferralsService` to ensure `CandidateInterest` is populated when assignments change:
1. **When a tenant approves an onboarding session** (`OnboardingService.approveSession`):
    * After creating/upserting `User` + `CompanyMembership` and setting `session.status = APPROVED`, resolve (or create) a `NexNetCandidate` for the session’s user/email if one does not already exist.
    * Upsert a `CandidateInterest` row:
        * `candidateId`: NexNetCandidate.id
        * `requestingCompanyId`: `session.companyId`
        * `status`: `HIRED`
        * `employmentStartDate`: `new Date()` (or session.createdAt)
        * `baseHourlyRate`, `cpHourlyRate`, `cpFringeHourlyRate` from the best available source:
        * Prefer HR portfolio payload (`UserPortfolioHr`) if it already contains screening pay rates.
        * Otherwise, if a legacy `Worker` record exists, use its `defaultPayRate`, `cpRate`, `cpFringeRate`.
    * Do **not** block approval if this upsert fails; log errors and continue (similar to existing Nex-Net sync blocks).
2. **When HR updates worker compensation** (`WorkerService.updateWorkerComp`) and/or HR portfolio comp (`UserService.updateUserPortfolioHr`):
    * Best-effort: if the worker/user maps to a `NexNetCandidate` and there is a `CandidateInterest` row with `status = HIRED` for the current company, update that row’s pay fields and `updatedAt`.
    * This gives us a coarse-grained history (at least the latest known pay snapshot per tenant) without deeply coupling to every pay-change event yet.
3. **When an assignment ends** (future step):
    * Add a mechanism (e.g., explicit action or detection based on CompanyMembership removal) to set `employmentEndDate` and possibly change `status` away from `HIRED` (e.g., back to `APPROVED` or a terminal value).
    * For this iteration, we will not implement end-of-assignment logic yet; we will keep the schema ready.
## 4. Front-end integration
### 4.1 Company Prospective Candidates view
File: `apps/web/app/company/users/page.tsx`.
* Extend `CandidateRow` to optionally include the assignment metadata fields:
    * `assignedTenantCount?: number;`
    * `assignedHere?: boolean;`
    * `assignedElsewhere?: boolean;`
    * `assignedTenants?: { companyId: string; companyName: string; companyRole: string | null; interestStatus: string; isCurrentTenant: boolean; }[];`
* The existing fetch for `GET /onboarding/company/${companyId}/prospects` will receive the enriched DTO; TypeScript will be updated to reflect the new shape, but existing usage (status/profile/checklist) remains unchanged.
* Optionally add simple visual indicators in the candidates table:
    * A small badge for “Hired here” vs “Hired elsewhere”, based on `assignedHere` / `assignedElsewhere`.
    * This can be done as a follow-up UX pass; for now we just ensure the data is present.
### 4.2 Nex-Net System page
File: `apps/web/app/system/nex-net/page.tsx`.
* Keep the existing mapping for `NexNetCandidateRow` (id, name, email, phone, source, status, createdAt, referrerEmail) to avoid breaking the UI.
* Optionally extend `NexNetCandidateRow` to include assignment metadata:
    * `assignedTenantCount?: number;`
    * `assignedTenants?: { companyId: string; companyName: string; companyRole: string | null; interestStatus: string; }[];`
* Initially, we can simply ignore these new fields in the UI (the data is available for future tabs or tooltips without requiring immediate visual changes).
## 5. Implementation steps
1. **Backend DTO + mapping**
    * Update `OnboardingService.listProspectsForCompany` to return `ProspectiveCandidateDto[]` instead of raw Prisma entities.
    * Implement helper functions inside `OnboardingService` to:
        * Resolve candidates for sessions via NexNetCandidate.
        * Build `AssignedTenantSummaryDto[]` from CompanyMembership (+ CandidateInterest when available).
    * Update `ReferralsService.listCandidatesForSystem` and `listCandidatesForFortified` to:
        * Fetch memberships + interests for candidate.userId/candidateId.
        * Map Prisma results into `NexNetProspectDto[]` with `assignedTenantCount` and `assignedTenants`.
2. **Assignment history persistence**
    * Extend `CandidateInterest` model in Prisma schema with nullable date and pay fields.
    * Add a small helper in `OnboardingService` to upsert a HIRED `CandidateInterest` row when `approveSession` runs.
    * Add best-effort updates from worker/HR comp flows to refresh pay fields for the active HIRED interest row (optional for first pass).
3. **Front-end type updates**
    * Update `CandidateRow` and `NexNetCandidateRow` interfaces in `apps/web/app/company/users/page.tsx` and `apps/web/app/system/nex-net/page.tsx` respectively to allow the new optional fields.
    * Ensure fetch/parsing logic treats unknown fields permissively so existing UI continues to work.
4. **Verification**
    * Run backend unit/integration tests if present, or at least:
        * `npm run check-types` and `npm run lint` for `apps/api`.
    * From the web app, manually verify:
        * `/company/users?tab=candidates` still loads candidates correctly.
        * `/system/nex-net` still loads and renders prospects/referrals.
    * Optionally, log a single candidate’s DTO in dev mode to confirm `assignedTenantCount` and `assignedTenants` look correct.
This plan focuses on wiring assignment metadata into your existing NCC/API surfaces and starting to use `CandidateInterest` as a durable assignment history log, while keeping the current UIs stable and ready for incremental UX upgrades around employment history and pay visualization.