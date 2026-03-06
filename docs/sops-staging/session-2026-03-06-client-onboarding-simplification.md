---
title: "Session Export — Client Onboarding Simplification"
session_date: 2026-03-06
topics: [client-onboarding, project-creation, tenant-architecture, client-portal]
status: decisions-captured
---

# Session: Client Onboarding Simplification
**Date:** 2026-03-06
**Participants:** Paul, Warp

## Context
Discussed how to properly onboard a client by sending an invite directly from the application when creating a project, rather than the current multi-step process (create project → navigate to SUMMARY → Collaborating Organizations → invite client org).

## Decisions Made

### 1. Invite Default Behavior
- When creating a project and entering a client email, a checkbox "Invite client to view this project on Nexus" appears — **default: checked**
- User can manually uncheck to save contact info only (no invite)
- This is opt-in-by-default, opt-out-able

### 2. Existing vs. New Client
- If the client email matches an existing user, add them to the project automatically (no duplicate account)
- If new, create User account + send onboarding email
- Reuse existing TenantClient search ("Link to existing client") for known contacts

### 3. No Client Organization
**Key architectural decision:** Clients do NOT get a CLIENT-tier Company when invited to a project. Instead:
- Client = a User (`userType: CLIENT`) with a TenantClient record linking them to the project
- The TenantClient model already has a `userId` field — no schema migration needed
- If the client has projects from multiple contractors, they see all of them when they log in
- If the client wants to become a full contractor tenant, they register separately and the tenant-to-tenant collaboration rules apply

**Rationale:** Creating a full Company entity for every client was over-engineering. Most clients just need to see their project. The "client org" concept added unnecessary complexity (org onboarding, company management, tier system) for what is fundamentally individual-level access.

### 4. Role Defaults
- Client projects default to CLIENT role + LIMITED visibility
- Client sees: project updates, financials, daily logs
- Client does NOT see: estimating tools, scheduling, invoicing, PETL, crew management
- Exact module scoping to be defined in a follow-up session

### 5. Dual-Role Users (Client + Contractor)
- When a client later creates their own Company, their existing TenantClient links persist
- They see both their own projects and their client projects
- Project sidebar uses a badge/icon to indicate client-only projects vs. own projects
- Access is resolved per-project based on the relationship type, not per-user

### 6. Contact-Only Case
- PMs can still record client name/email/phone without inviting them to the platform
- Just uncheck the invite box — contact info saves to the project record as before
- This preserves the existing invoicing/correspondence use case

## Impact on Existing Systems
- **ProjectCollaboration model** — UNCHANGED. Still used for tenant-to-tenant collaboration (subs, GCs, consultants, inspectors)
- **CollaborationsPanel** — UNCHANGED. Still available on project SUMMARY tab for company-to-company collaboration
- **`inviteClientOrg()`** — Retained for backward compat, but deprecated for individual client invites
- **Existing CLIENT-tier companies** — Continue to work. No migration needed
- **Auth system** — Needs modification to allow client-only users (no CompanyMembership) to log in

## Artifacts Created
- **Plan:** "Client Onboarding — Direct Invite from Project Creation" (implementation plan with 7 steps)
- **SOP:** `docs/sops-staging/client-invite-from-project-creation-sop.md`
- **Updated:** `docs/sops-staging/client-collaboration-tenant-tier-sop.md` (added architectural note, rev 1.1)

## Next Steps (When Ready to Implement)
1. Auth changes — support client-only login (sentinel companyId + @ClientAllowed guard)
2. `inviteProjectClient()` service method
3. Project creation API — accept `inviteClient` flag
4. Frontend — invite checkbox on New Project form
5. Client onboarding page — simplified variant
6. Client portal — query via TenantClient.userId
7. Sidebar role indicator (deferrable)
