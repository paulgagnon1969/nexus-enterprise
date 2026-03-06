---
title: "Client Portal SOP"
module: client-portal
revision: "1.0"
tags: [sop, client-portal, client-access, project-management, onboarding, pm, admin]
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, pm, exec]
---

> 🚧 **PRE-IMPLEMENTATION — Feature Not Yet Built**
> The Client Portal is part of the simplified client invite model planned in the 2026-03-06 session.
> This SOP documents the intended design. See [Client Invite from Project Creation SOP](./client-invite-from-project-creation-sop.md) for the full implementation checklist.

# Client Portal

## Purpose
The Client Portal is the entry point for clients (homeowners, insurance adjusters, property managers) after they accept an invite to view their project on Nexus. It provides a scoped, read-focused view of their project(s) with no access to internal contractor tooling. A single client account can see projects from multiple contractors in one unified view.

## Who Uses This
- **Clients** — Individuals invited to one or more projects by a contractor
- **Dual-Role Users** — Users who are both a client on some projects and an active contractor on others

## Workflow

### First-Time Access (After Invite)

1. Client receives invite email: "{Contractor Name} has invited you to view your project on Nexus"
2. Client clicks **Set Up Your Account** → lands on `/register/client?token=...`
3. Page displays the project name and contractor name (token-resolved context)
4. Client sets a password (minimum 8 characters) and submits
5. On success, client is authenticated and redirected to `/client-portal`

### Returning Client Login

1. Client visits `/login`
2. Enters email and password
3. On login, system detects `userType: CLIENT` (no active `CompanyMembership`)
4. Redirected to `/client-portal` (not the standard NCC dashboard)

### Navigating the Client Portal

1. Client lands on `/client-portal` — sees all projects they have been invited to
2. Projects are **grouped by contractor company**
3. Each project card shows: name, address, status badge
4. Client clicks a project → scoped project detail view

### Scoped Project Detail View

Clients see a limited subset of the project detail page. Access is controlled via Field Security Policies (`secKey` + CLIENT visibility toggle).

**Visible to clients:**
- Project overview (name, address, status, dates)
- Updates / daily log summaries
- Financials (scoped — amounts relevant to the client, not internal cost breakdowns)
- Document uploads shared with the client

**NOT visible to clients:**
- Estimating tools (PETL, cost books, BOM pricing)
- Scheduling / Gantt charts
- Invoicing and billing workflows
- Crew management / time tracking
- Internal notes and admin settings

> Exact module scoping is enforced via Field Security Policies (Admin → Security). See [Field Security & Client Access SOP](./field-security-client-access-sop.md) for how to adjust visibility per field.

### Flowchart

```mermaid
flowchart TD
    A[Client receives invite email] --> B[Clicks Set Up Account link]
    B --> C[/register/client?token=...]
    C --> D[Sets password]
    D --> E[Authenticated → /client-portal]

    E --> F[Sees all projects grouped by contractor]
    F --> G[Clicks a project]
    G --> H[Scoped project detail view]
    H --> I[Views updates, financials, documents]

    subgraph Returning Client
        R1[Visits /login] --> R2[Email + password]
        R2 --> R3{userType CLIENT?}
        R3 -->|Yes| E
        R3 -->|No| R4[Standard NCC dashboard]
    end
```

## Dual-Role Users (Client + Contractor)

A user who is both invited as a client on some projects AND has their own contractor company will see both contexts.

### How It Works

- On login, the system checks both `CompanyMembership` (contractor role) and `TenantClient` (client role)
- If the user has an active `CompanyMembership`, they land on the standard NCC dashboard (contractor view)
- Their client projects appear in the project sidebar with a **"Client" badge** to distinguish them from own projects
- Clicking a client-badged project opens the scoped client view (not the full internal view)

### Sidebar Badge Behavior

| Project Type | Badge | Access Level |
|---|---|---|
| Own project (contractor) | None (default) | Full internal access |
| Client project | `CLIENT` badge (e.g. orange pill) | Scoped client view |

### Access Resolution Per Project

```
User logs in
  ├─ Has CompanyMembership?
  │    ├─ Yes → NCC Dashboard (contractor)
  │    │         └─ Sidebar: own projects + client-badged projects
  │    └─ No  → /client-portal (client only)
  │
  On project open:
  ├─ Project.tenantClientId links to TenantClient.userId = me?
  │    └─ Yes → Scoped client view (limited modules)
  └─ Project belongs to my company?
       └─ Yes → Full internal view
```

## Data Model

### How Client Portal Projects Are Resolved

```
TenantClient
  └─ userId → User (the logged-in client)

Project
  └─ tenantClientId → TenantClient

Access query:
  1. Find all TenantClient records where userId = current user
  2. Find all Projects where tenantClientId IN (those TenantClient IDs)
  3. Group by TenantClient.companyId (= the contractor's company) for display
```

## Key Features

### Single Account, Multiple Contractors
A client with projects from three different contractors sees all of them on one screen, grouped by contractor. No need for separate logins per contractor.

### No Organization Setup Required
Clients are individual users — no company registration, no org onboarding, no billing setup. Just name, email, and a password.

### Existing User Detection
If the invite email matches an existing Nexus user (e.g., a contractor who is also someone's client), no duplicate account is created. The new project is added to their existing account.

### Scoped by Design
Field Security Policies control what clients see per-field, not per-page. This means contractors can fine-tune visibility (e.g., show gross total but not line-item cost) without code changes.

## Related Modules
- [Client Invite from Project Creation](./client-invite-from-project-creation-sop.md) (how clients are added)
- [Client Contact Linking](./client-contact-linking-sop.md) (managing contact info on projects)
- [Field Security & Client Access](./field-security-client-access-sop.md) (controlling what clients see)
- [Client Collaboration & Tenant Tier System](./client-collaboration-tenant-tier-sop.md) (company-to-company collaboration, separate flow)
- Authentication (client login, `@ClientAllowed` guard)

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial draft — client portal design from 2026-03-06 session |
