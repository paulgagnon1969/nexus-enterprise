---
cam_id: CLT-COLLAB-0001
title: "Client Tenant Tier — Collaborator-to-Subscriber Acquisition Flywheel"
mode: CLT
category: COLLAB
revision: "1.0"
tags: [cam, client-relations, collaboration, tenant-tier, project-sharing, viral-growth, network-effect]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
scores:
  uniqueness: 7
  value: 7
  demonstrable: 8
  defensible: 6
  total: 28
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# CLT-COLLAB-0001: Client Tenant Tier — Collaborator-to-Subscriber Acquisition Flywheel

> *Your clients don't just view projects — they become your next subscribers.*

## Elevator Pitch

When a contractor shares a project with a client, the client doesn't get a throwaway guest link — they get their own organization in Nexus. A CLIENT-tier company with its own users, its own portal, and a one-click upgrade path to a full CONTRACTOR subscription. Every project collaboration is a product demo running on real data. The more contractors use Nexus, the more client organizations exist on the platform, and the more of those clients convert to paying subscribers when they realize they need the full toolset for their own construction division.

## The Problem

Construction software has a client communication gap:

1. **Email is the default.** Contractors share project updates via email, PDFs, and phone calls. Clients have no centralized view of their projects.
2. **"Client portals" are dead ends.** Competitor portals give clients a read-only view, maybe some documents. The client never builds an identity on the platform. When the project ends, they vanish.
3. **Zero viral distribution.** Traditional client portals create no incentive for the client to become a subscriber. The client's experience is a stripped-down view of someone else's software.
4. **Dual-role clients are invisible.** Many clients have their own construction divisions (insurance restoration companies, property management firms, large GCs who sub out specialty work). Existing software can't model a company that is both a client on some projects and a contractor on others.

The core issue: **every client interaction is a missed acquisition opportunity** because the client is treated as a transient viewer, not a potential subscriber.

## The Insight

A client organization that already has users, login credentials, and project data on your platform is **90% of the way to being a subscriber.** They just need a reason to activate full features.

The tenant-tier model solves this by treating client organizations as real companies — not guests. They have:
- Their own Company record (just like a contractor)
- Their own users with real auth credentials
- Their own portal showing all projects shared with them across multiple contractors
- A visible upgrade path to unlock contractor features (estimating, scheduling, invoicing)

This means every time a contractor shares a project with a client, Nexus gains a pre-qualified lead that has already experienced the platform firsthand.

## How It Works

### The Tier Architecture

Companies in Nexus have a `tier` field:

- **CONTRACTOR** (default) — Full-featured subscription. Estimating, scheduling, PETL, invoicing, daily logs, everything.
- **CLIENT** — Limited tenant. Can view shared projects, accept/decline collaborations, see project data scoped to their visibility level. Cannot create projects, run estimates, or generate invoices. Costs the contractor nothing.

CLIENT-tier companies are real companies in the system. They have users, memberships, roles — the full identity model. They just can't access contractor-only features.

### Collaboration Flow

```
Contractor                        Client Org                      Nexus Platform
──────────                        ──────────                      ──────────────
Opens project SUMMARY tab    
  → Collaborating Organizations
  → + Add                    
  → "Invite new organization"
  → Enters client details ─────→  Email received ──────────────→  Company (CLIENT tier)
                                  Sets password                   User (OWNER)
                                  Lands on /client-portal         CompanyMembership
                                  Sees shared projects            ProjectCollaboration
                                  Accepts invitation              
                                    ↓                             
                                  Uses portal over weeks/months   
                                    ↓                             
                                  "We need estimating for our     
                                   own restoration division"      
                                    ↓                             
                                  Upgrades to CONTRACTOR ────────→ Full subscription revenue
```

### Cross-Tenant Access Model

The `ProjectCollaboration` model enables:
- One project can have multiple collaborating companies
- Each collaboration has a **role** (CLIENT, SUB, PRIME_GC, CONSULTANT, INSPECTOR)
- Each collaboration has a **visibility** level (LIMITED or FULL)
- Collaborations are accepted/declined by the client org — no forced access
- The primary project owner always retains control — collaborations can be revoked at any time

This is not a shared database. Each company operates in its own tenant context. ProjectCollaboration is a cross-tenant bridge that grants scoped read access.

### Client Portal Experience

Client org users see:
- All projects shared with their organization, grouped by contractor
- Project status, role, and visibility level for each
- Pending invitations with accept/decline
- Project detail views scoped to their visibility level

This is a real product experience — not a guest link. The client gets a dashboard, authentication, multiple projects across multiple contractors, and persistent access.

## The Flywheel

```
Contractor shares project with client org
       ↓
Client org created on Nexus (CLIENT tier)
       ↓
Client uses portal to track their project(s)
       ↓
Client has multiple contractors sharing projects → platform becomes central hub
       ↓
Client's own construction team wants estimating / scheduling / invoicing
       ↓
One-click upgrade: CLIENT → CONTRACTOR (subscription activated)
       ↓
New contractor invites THEIR clients to projects
       ↓
More CLIENT-tier orgs enter the platform
       ↓
Cycle repeats — exponential platform growth
```

**Key property: the flywheel is self-reinforcing.** Each new contractor creates client orgs. Some client orgs upgrade to contractors. Those contractors create more client orgs. Growth compounds without additional marketing spend.

## Competitive Landscape

- **Procore** — Has a "Client" user type that gives read-only access to a project. But the client doesn't get an org identity, can't see projects across contractors, and has no upgrade path. It's a permission level, not a business entity.
- **Buildertrend** — "Client login" is a stripped-down view. Clients see selections, schedules, and photos. No org model. No cross-contractor aggregation. No conversion funnel.
- **CoConstruct** — Client portal shows selections, change orders, and schedules. Single-project view. No multi-contractor experience.
- **JobNimbus** — Sends clients a public link to view job status. No authentication, no org, no identity.
- **Fieldwire** — Project-level guest access. No client org concept.

**No competitor models the client as a real tenant.** The universal approach is guest access — which creates zero switching costs, zero network effect, and zero conversion opportunity.

## Why This Is Defensible

1. **Data gravity.** Once a client org has login credentials, multiple projects, and accepted collaborations across contractors, switching costs are real. Leaving Nexus means losing their centralized project view.
2. **Network effects.** The value of the platform increases with the number of contractor-client relationships. A client working with 3 contractors all on Nexus gets a unified view impossible to replicate by switching one contractor.
3. **Conversion data advantage.** Nexus accumulates detailed usage data on CLIENT-tier orgs: which features they try to access, which visibility levels they need, when they ask about pricing. This enables precision upselling that competitors with no client identity model can't match.
4. **Viral coefficient > 1.** If each contractor creates 5+ client orgs and 10% convert to contractors, each of whom creates 5+ client orgs... the math works.

## Expected Business Impact

### Direct Revenue

Assuming:
- Average contractor creates 20 client org collaborations per year
- 5-10% of client orgs upgrade to CONTRACTOR within 12 months
- Average CONTRACTOR subscription: $200/mo

Per 100 contractors:
- 2,000 client orgs created per year
- 100-200 convert to contractors
- $20,000-$40,000/mo incremental MRR from organic conversion

### Indirect Value

- **Reduced CAC.** Clients who convert are pre-qualified by usage — no cold outreach, no demo scheduling, no trial activation friction.
- **Higher retention.** Contractors whose clients are on the platform have higher switching costs (breaking the collaboration chain).
- **Network density.** Each metro area builds a web of contractor-client relationships on Nexus, making the platform progressively harder to displace.

## Demo Script

1. Open a project → SUMMARY tab → Collaborating Organizations
2. Click "+ Add" → type a company name that doesn't exist
3. Click "Invite a new organization" → fill in client details → Send Invite
4. Show the onboarding email → click the link → set password
5. Land on the Client Portal → show projects grouped by contractor
6. Navigate to Pending Invitations → accept a collaboration
7. Return to the contractor view → show the collaboration as "Accepted"
8. Pitch: "Every one of these client orgs is a future subscriber. They're already on the platform, using real data, across real projects. When they need estimating or invoicing for their own work, the upgrade is one click."

## Technical Implementation

### Schema
- `CompanyTier` enum: `CLIENT | CONTRACTOR`
- `CollaborationRole` enum: `CLIENT | SUB | PRIME_GC | CONSULTANT | INSPECTOR`
- `ProjectCollaboration` model: `projectId + companyId` (unique), role, visibility, invited/accepted timestamps
- `Company.tier` field (default: CONTRACTOR)

### Key Services
- `ProjectCollaborationService` — CRUD, accept/decline, access resolution, smart notification routing
- `CompanyService.inviteClientOrg()` — Creates CLIENT-tier company, user, membership, invite token, sends email
- `ProjectService.listProjectsForClientPortal()` — Cross-tenant query merging memberships and collaborations
- `AuthService.clientOrgOnboarding()` — Token validation and password setup

### UI Components
- `CollaborationsPanel` — Inline on project SUMMARY tab (OWNER/ADMIN only)
- `/client-portal` — Project listing grouped by contractor
- `/client-portal/collaborations` — Pending invitations with accept/decline
- `/register/client-org` — Onboarding page for new client org users

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-03-05 | Initial release — full system (Phases 1-4) |
