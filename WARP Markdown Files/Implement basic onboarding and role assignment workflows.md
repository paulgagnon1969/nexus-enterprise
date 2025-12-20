# Goal
Implement the first concrete pieces of the onboarding and role workflows we designed:
* Represent onboarding candidates separately from users.
* Expose a public, token-based onboarding link for candidates to submit basic info.
* Allow internal Hiring Managers to review and approve candidates, creating real users with no roles.
* Prepare the ground for later PM recommendation and Admin approval flows without fully enforcing them yet.
## Current state (relevant parts)
* Prisma models for `PermissionResource`, `RoleProfile`, `RolePermission` exist and are wired via `RolesService` and `RolesController`.
* New migration seeds standard permission resources and role profiles (SUPERUSER, OWNER, TENANT_ADMIN, HIRING_MANAGER, PROJECT_MANAGER, FOREMAN, CREW, CLIENT).
* Authentication uses `AuthenticatedUser` with `role` (company Role enum) and optional `profileCode` hook.
* Web UI includes:
    * `/settings/roles` for viewing role profiles and permission resources (read-only matrix).
    * `/company/users` as the organization-centric "Company users & roles" portal.
* No explicit onboarding/candidate models or API endpoints yet.
## Proposed changes
### 1. Database schema: onboarding candidates
Add minimal onboarding models to Prisma schema to support user-driven onboarding via public links.
1. `OnboardingSession` (top-level candidate/onboarding flow):
    * `id: String @id @default(cuid())`
    * `companyId: String` (FK to `Company`)
    * `email: String`
    * `token: String @unique` (for public URL)
    * `status: OnboardingStatus` enum: `NOT_STARTED`, `IN_PROGRESS`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`.
    * `checklistJson: String?` (JSON blob for flexible checklist state – which items done, timestamps, etc.).
    * `assignedHiringManagerId: String?` (FK to `User` – optional).
    * `createdAt`, `updatedAt`.
2. `OnboardingProfile` (basic personal info captured):
    * `id: String @id @default(cuid())`
    * `sessionId: String` (FK to `OnboardingSession`)
    * `firstName`, `lastName`, `phone`, `address` fields (initial subset; we can expand later).
3. `OnboardingDocument` (files like selfie and ID photo):
    * `id: String @id @default(cuid())`
    * `sessionId: String`
    * `type: OnboardingDocumentType` enum: `PHOTO`, `GOV_ID`, `OTHER`.
    * `fileUrl: String` (points to where we store it; initially local disk or S3 placeholder).
    * `fileName`, `mimeType`, `sizeBytes?`.
    * `createdAt`.
4. `OnboardingBankInfo` (direct deposit details – secure handling later):
    * `id: String @id @default(cuid())`
    * `sessionId: String`
    * Basic placeholders for now: `accountHolderName`, `routingNumberMasked`, `accountNumberMasked`, `bankName?`.
    * Real routing/account numbers stored encrypted or in a future secure store (out of scope for this pass, so we don’t collect actual numbers yet).
5. Enums:
    * `OnboardingStatus` with the values above.
    * `OnboardingDocumentType` with basic types.
This keeps onboarding flexible while avoiding premature commitment on fully normalized HR/payroll data.
### 2. API: onboarding flows
Create a new NestJS module `OnboardingModule` with controller + service to support:
#### Public (no auth) endpoints
* `POST /onboarding/start`  
    * Body: `{ email: string, companyCodeOrId?: string }` (for now we can require companyId from a pre-created session, but long-term we might look up by company slug).
    * Behavior: create an `OnboardingSession` with `status = NOT_STARTED` and `token`, then send the link externally (in this pass, just return the token/link in response).
* `GET /onboarding/:token`  
    * Returns basic session info and which checklist steps are expected / completed (from `checklistJson`).  
    * Used by the public web page to drive the onboarding form.
* `POST /onboarding/:token/profile`  
    * Body: basic personal info fields.
    * Creates or updates `OnboardingProfile`, marks relevant checklist step complete.
* `POST /onboarding/:token/document`  
    * Multipart upload for one document (photo or ID).  
    * Creates an `OnboardingDocument` row and updates checklist.
* `POST /onboarding/:token/submit`  
    * Marks `status = SUBMITTED` and moves to `UNDER_REVIEW` for Hiring Manager.
For this first implementation we can:
* Accept uploads but store them similarly to daily-log attachments (local disk + public URL) to avoid adding a new storage system.
* Keep checklistJson very simple (e.g. `{ profileComplete: true, photoUploaded: true, govIdUploaded: true }`).
#### Internal (auth required) endpoints
Guard these with `JwtAuthGuard` and RoleProfile awareness (initially coarse, then tie to RolePermissions later):
* `GET /onboarding/sessions`  
    * Visible to Hiring Manager, Tenant Admin, and Owner in the current company.  
    * Lists sessions by status (e.g. `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`).
* `GET /onboarding/sessions/:id`  
    * Returns full candidate info (profile + documents metadata + checklist).  
    * Hiring Manager/Admin can review details.
* `POST /onboarding/sessions/:id/approve`  
    * Allowed for Hiring Manager, Tenant Admin, Owner.  
    * Behavior:
        * Validates session belongs to actor.companyId.
        * Ensures status is `SUBMITTED` or `UNDER_REVIEW`.
        * Creates a `User` (if not already existing) with:
        * `email = session.email`.
        * Company membership entry with **no RoleProfile and default Role.MEMBER** (or a dedicated "UNASSIGNED" profile later).
        * Marks session `APPROVED`.
* `POST /onboarding/sessions/:id/reject`  
    * Marks `REJECTED` with optional reason; no user is created.
We will **not yet** implement PM role-recommendation or Admin approval here; that will be layered in a separate pass on the existing users/roles flows.
### 3. Web UI: minimal onboarding surfaces
Implement only the minimal UI needed to exercise the new flows.
1. **Public onboarding page**
    * New route: `apps/web/app/onboarding/[token]/page.tsx`.
    * Client component that:
        * Calls `GET /onboarding/:token` to load session + checklist info.
        * Renders a simple multi-step form:
        * Step 1: Personal details.
        * Step 2: Upload photo.
        * Step 3: Upload ID photo.
        * After completion, shows a "Submit" button that calls `POST /onboarding/:token/submit`.
    * For now, no direct-deposit fields (we can add these once we’re ready to handle them securely).
2. **Internal onboarding queue**
    * New route: `apps/web/app/onboarding/page.tsx` (internal, requires login via existing auth/guard patterns).
    * Shows two sections:
        * "Pending candidates" (SUBMITTED/UNDER_REVIEW) with columns: email, createdAt, status, actions.
        * "Recent decisions" (APPROVED/REJECTED).
    * Row actions:
        * View details (navigates to `/onboarding/:id` internal detail page or expands inline later).
        * Approve / Reject buttons that call the new internal endpoints.
    * Initially available to any logged-in user whose `role` is `OWNER` or `ADMIN` or whose `profileCode` is `HIRING_MANAGER` (we’ll add proper RolePermission checks later).
This gives Hiring Managers/Admins a basic UI to work the queue without overcomplicating the UX.
### 4. Wiring role awareness (lightweight)
We already have `AuthenticatedUser.profileCode` in the JWT payload and strategy. For this pass:
* When we create users from an approved onboarding session, we **do not** assign a RoleProfile yet. They remain effectively unassigned.
* In guards for onboarding internal endpoints we will:
    * Allow access if `actor.role` is `OWNER` or `ADMIN`.
    * Or if `actor.profileCode` is `HIRING_MANAGER`.
Later, when RolePermissions are fully wired, we can:
* Replace this with checks against `RolePermission` on `org.onboarding` resource (e.g. `canView`, `canApprove`).
### 5. Scope and non-goals for this pass
To keep this pass manageable:
* We **do not**:
    * Store real bank account/routing numbers yet (we only prepare a place for masked or placeholder values).
    * Implement PM role recommendation or Admin final role approval – those will be added on top of the current `CompanyMembership` + `RoleProfile` once onboarding-to-user is stable.
    * Implement cross-organization Superuser UI; that comes later with a "Manage Companies" card.
* We **do**:
    * Add Prisma models and migration for onboarding.
    * Implement the NestJS onboarding controller/service (public + internal endpoints).
    * Create minimal public onboarding form and internal onboarding queue pages.
    * Gate internal endpoints and UI by simple role/profile checks consistent with the hierarchy we defined.
This will give you a working, end-to-end skeleton:
* Hiring Manager (or Admin) can generate an onboarding link.
* Candidate can self-onboard via public link.
* Hiring Manager/Admin can approve, which creates a user with no role, ready for your future PM/Admin role workflows.
