---
cam_id: CLT-COLLAB-0001
title: "Client Tenant Tier — Collaborator-to-Subscriber Acquisition Flywheel"
mode: CLT
category: COLLAB
revision: "1.2"
tags: [cam, client-relations, collaboration, tenant-tier, project-sharing, viral-growth, network-effect]
status: draft
created: 2026-03-05
updated: 2026-03-06
implementation_status: complete
author: Warp
scores:
  uniqueness: 7
  value: 8
  demonstrable: 9
  defensible: 6
  total: 30
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# CLT-COLLAB-0001: Client Tenant Tier — Collaborator-to-Subscriber Acquisition Flywheel

> *Your clients don't just view projects — they become your next subscribers.*

## Elevator Pitch

When a contractor creates a project and enters a client email, the client is on the platform — one checkbox, zero extra steps. The client gets their own login, a portal showing every project they're on (across any contractor using Nexus), and a clear upgrade path to a full CONTRACTOR subscription. Every project invite is a product demo running on real data. The more contractors use Nexus, the more clients exist on the platform, and the more of those clients convert to paying subscribers when they realize they need the full toolset for their own construction division.

## The Problem

Construction software has a client communication gap:

1. **Email is the default.** Contractors share project updates via email, PDFs, and phone calls. Clients have no centralized view of their projects.
2. **"Client portals" are dead ends.** Competitor portals give clients a read-only view, maybe some documents. The client never builds an identity on the platform. When the project ends, they vanish.
3. **Zero viral distribution.** Traditional client portals create no incentive for the client to become a subscriber. The client's experience is a stripped-down view of someone else's software.
4. **Dual-role clients are invisible.** Many clients have their own construction divisions (insurance restoration companies, property management firms, large GCs who sub out specialty work). Existing software can't model a company that is both a client on some projects and a contractor on others.

The core issue: **every client interaction is a missed acquisition opportunity** because the client is treated as a transient viewer, not a potential subscriber.

## The Insight

A client organization that already has users, login credentials, and project data on your platform is **90% of the way to being a subscriber.** They just need a reason to activate full features.

The simplified client model solves this by giving every client a real identity on the platform — not a guest link, not a throwaway portal. They have:
- Their own user account with real auth credentials
- A portal showing all projects shared with them across multiple contractors
- A visible upgrade path to unlock contractor features (estimating, scheduling, invoicing)
- Zero friction on entry — the invite happens during project creation, not as a separate workflow

This means every time a contractor creates a project with a client email, Nexus gains a pre-qualified lead that has already experienced the platform firsthand.

## How It Works

### Client Access Model

Clients are individual users (`userType: CLIENT`) linked to projects via TenantClient records. No separate company/org is created for a client — they're a person with scoped access to their project(s).

- **CONTRACTOR** — Full-featured subscription. Estimating, scheduling, PETL, invoicing, daily logs, everything.
- **CLIENT** — Individual user. Can view their projects (updates, financials, daily logs). Cannot create projects, run estimates, or generate invoices. Costs the contractor nothing.

Multiple TenantClient records can point to the same User (one per contractor), enabling cross-contractor project aggregation without any company overhead.

### Invite Flow

```
Contractor                        Client                          Nexus Platform
──────────                        ──────                          ──────────────
Creates new project
  → Enters client name + email
  → "Invite client" ✓ (default) 
  → Create Project ──────────────→  Email received ──────────────→  User (CLIENT)
                                    Sets password                   TenantClient link
                                    Lands on /client-portal         Project access
                                    Sees their project(s)          
                                      ↓                             
                                    Uses portal over weeks/months   
                                      ↓                             
                                    "We need estimating for our     
                                     own restoration division"      
                                      ↓                             
                                    Registers as CONTRACTOR ───────→ Full subscription revenue
```

### Access Resolution

Access is resolved per-project, not per-user:
- Client projects: scoped visibility (updates, financials, daily logs)
- If the same user later becomes a contractor, their client project access persists alongside their own projects
- The project sidebar shows a "Client" badge on client-only projects
- Tenant-to-tenant collaboration (subs, GCs, consultants, inspectors) uses the separate ProjectCollaboration model

### Client Portal Experience

Client users see:
- All projects where they've been invited, grouped by contractor
- Project status for each
- Project detail views scoped to client visibility (updates, financials, daily logs)

This is a real product experience — not a guest link. The client gets a dashboard, authentication, multiple projects across multiple contractors, and persistent access.

## The Flywheel

```
Contractor creates project → enters client email → invite sent automatically
       ↓
Client sets password → sees their project in the portal
       ↓
Client has multiple contractors sharing projects → portal becomes central hub
       ↓
Client's own construction team wants estimating / scheduling / invoicing
       ↓
Client registers as CONTRACTOR (subscription activated)
       ↓
New contractor invites THEIR clients during project creation
       ↓
More clients enter the platform — zero extra effort per invite
       ↓
Cycle repeats — exponential platform growth
```

**Key property: the flywheel is self-reinforcing AND zero-friction.** Every project creation is a potential client acquisition. PMs don't have to remember a separate workflow — the invite is a checkbox that defaults to ON. Growth compounds without additional marketing spend or behavioral change.

## Competitive Landscape

- **Procore** — Has a "Client" user type that gives read-only access to a project. But the client doesn't get an org identity, can't see projects across contractors, and has no upgrade path. It's a permission level, not a business entity.
- **Buildertrend** — "Client login" is a stripped-down view. Clients see selections, schedules, and photos. No org model. No cross-contractor aggregation. No conversion funnel.
- **CoConstruct** — Client portal shows selections, change orders, and schedules. Single-project view. No multi-contractor experience.
- **JobNimbus** — Sends clients a public link to view job status. No authentication, no org, no identity.
- **Fieldwire** — Project-level guest access. No client org concept.

**No competitor embeds client onboarding into project creation.** The universal approach is guest access or a separate portal setup — which creates friction, reduces adoption, and generates zero conversion opportunity.

## Why This Is Defensible

1. **Data gravity.** Once a client has login credentials, multiple projects across multiple contractors, switching costs are real. Leaving Nexus means losing their centralized project view.
2. **Network effects.** The value of the platform increases with the number of contractor-client relationships. A client working with 3 contractors all on Nexus gets a unified view impossible to replicate by switching one contractor.
3. **Conversion data advantage.** Nexus accumulates detailed usage data on client accounts: which features they try to access, how often they log in, when they ask about pricing. This enables precision upselling that competitors with no client identity model can't match.
4. **Viral coefficient > 1.** If each contractor creates 20+ projects/year with client emails and 5-10% of clients convert to contractors, each of whom creates 20+ projects... the math works.
5. **Zero-friction activation.** Because the invite is embedded in project creation (not a separate workflow), the adoption rate approaches 100% of projects with client emails. Competitors who bolt on a separate "invite client" step will always have lower activation.

## Expected Business Impact

### Direct Revenue

Assuming:
- Average contractor creates 20+ projects/year with client emails
- ~90% invite rate (checkbox defaults to ON, minimal opt-out)
- 5-10% of clients upgrade to CONTRACTOR within 12 months
- Average CONTRACTOR subscription: $200/mo

Per 100 contractors:
- ~1,800 client accounts created per year (20 × 100 × 0.9)
- 90-180 convert to contractors
- $18,000-$36,000/mo incremental MRR from organic conversion

### Indirect Value

- **Reduced CAC.** Clients who convert are pre-qualified by usage — no cold outreach, no demo scheduling, no trial activation friction.
- **Higher retention.** Contractors whose clients are on the platform have higher switching costs (breaking the collaboration chain).
- **Network density.** Each metro area builds a web of contractor-client relationships on Nexus, making the platform progressively harder to displace.

## Demo Script

1. Click **New Project** → enter project details
2. Enter client name + email → point out the "Invite client" checkbox (already checked)
3. Click **Create Project** → show the confirmation: "Invite sent to client@example.com"
4. Switch to the client's email → show the invite → click the link → set password
5. Land on the Client Portal → show the project with contractor name, status, key details
6. Pitch: "That's it. One checkbox during project creation. The client is on the platform, seeing their project, across every contractor using Nexus. When they need estimating or invoicing for their own work, the upgrade is one click."

## Technical Implementation

### Data Model
- **User** (`userType: CLIENT`) — The client's account
- **TenantClient** — Links client to a contractor's company via `userId`. Multiple records can point to the same User (one per contractor)
- **Project.tenantClientId** — Links project to the TenantClient record
- No CLIENT-tier Company created. No CompanyMembership required for client users.

### Key Services
- `ProjectService.inviteProjectClient()` — Creates/finds User + TenantClient, links to project, stores 7-day Redis token, sends invite email
- `ProjectService.createProject()` — Accepts `inviteClient` flag in `CreateProjectDto`, triggers invite when client email present
- `AuthService.login()` — Supports CLIENT users (no CompanyMembership) — issues tokens with empty `companyId` and `userType: CLIENT`
- `AuthService.completeClientRegistration()` — Sets password, returns `accessToken`/`refreshToken` for immediate auto-login
- Portal query: TenantClient records by userId → linked Projects → grouped by contractor

### UI Components
- Project creation form — "Invite client" checkbox (default: checked when email present)
- `/client-portal` — Project listing grouped by contractor
- `/register/client` — Simplified onboarding page (project name + contractor name, set password)
- Project sidebar — "Client" badge on client-only projects for dual-role users

### Tenant-to-Tenant Collaboration (Separate System)
For company-to-company collaboration (subs, GCs, consultants, inspectors), the existing `ProjectCollaboration` model and `CollaborationsPanel` remain unchanged.

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-03-05 | Initial release — full system (Phases 1-4) |
| 1.1 | 2026-03-06 | Simplified architecture: TenantClient+User model replaces CLIENT-tier Company for individual clients. Scores updated (Value 7→8, Demonstrable 8→9, Total 28→30). Demo script streamlined. Flywheel updated to reflect zero-friction activation. |
| 1.2 | 2026-03-06 | Implementation complete. Updated Key Services to reflect actual code: `ProjectService.inviteProjectClient()` (not CompanyService), `completeClientRegistration()` returns tokens for auto-login, `AuthService.login()` handles CLIENT userType. Added `implementation_status: complete` to frontmatter. |
