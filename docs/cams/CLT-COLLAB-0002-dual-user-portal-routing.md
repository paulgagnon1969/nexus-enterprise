---
cam_id: CLT-COLLAB-0002
title: "Dual-User Portal Routing & Cross-Company Project Access"
mode: CLT
category: COLLAB
revision: "1.0"
status: draft
created: 2026-03-08
updated: 2026-03-08
author: Warp
score:
  uniqueness: 7
  value: 8
  demonstrable: 8
  defensible: 6
  total: 29
tags: [cam, client-relations, collaboration, dual-user, portal, routing, cross-company]
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# CLT-COLLAB-0002 — Dual-User Portal Routing & Cross-Company Project Access

## Elevator Pitch
A single user identity can span both client and internal roles across multiple companies. Nexus detects this at login and always routes portal-eligible users to the client-first experience, while giving them one click to access the full internal project workspace — with per-project role enforcement.

## Problem
Traditional construction PM software forces users into rigid role silos: you're either a client or an internal user. This breaks down when:
- A homeowner (client) on Project A is also a subcontractor (crew member) on Project B
- An insurance adjuster reviews multiple projects across different GC tenants
- Internal team members need to preview exactly what clients see
- Company principals wear both hats depending on the project

## How It Works

### Client-First Login Routing
After authentication, the API returns a `hasPortalAccess` flag computed from the user's cross-company project affiliations. Portal-eligible users always land on the clean client portal — no confusing internal dashboards on first touch.

### Project Portal Bridge
Every client portal user sees a "Project Portal" button that opens the full internal workspace. The sidebar shows ALL projects the user is affiliated with — across every company — grouped by contractor with per-project role labels (CLIENT, CREW, ADMIN, etc.).

### Per-Project Role Enforcement
Clicking into any project applies that project's specific role and visibility level. A user who is CLIENT on one project and ADMIN on another sees exactly the right view for each — no manual context switching.

### Seamless Navigation
A "Return to Client Portal" pill in the app header lets users bounce back to the client experience at any time. The transition is instant — no re-authentication, no page reloads.

## Technical Implementation
- `GET /users/me` returns `hasPortalAccess` (checks `ProjectMembership` EXTERNAL_CONTACT scope + `ProjectCollaboration` records)
- `GET /projects/all-affiliated` aggregates projects from direct memberships, cross-tenant collaborations, and OWNER/ADMIN company access
- Login routing chain: SUPER_ADMIN → /system, hasPortalAccess → /client-portal, APPLICANT → /settings/profile, else → /projects
- `hasPortalAccess` persisted in localStorage for instant nav bootstrap without waiting for API

## Competitive Advantage
- **Buildertrend / CoConstruct**: Separate client and internal logins; no unified identity
- **Procore**: Role-based but single-company scoped; no cross-tenant client view
- **Monday.com**: Generic workspace tool with no construction-specific client portal concept
- **Nexus**: One identity, one login, automatic routing to the right experience per project across unlimited companies

## Demo Script
1. Log in as a dual-credentialed user (e.g., internal NFS member who is also a client on another company's project)
2. Show automatic routing to client portal with clean project cards
3. Click "Project Portal" → full workspace with company-grouped sidebar showing role per project
4. Click a CLIENT project → limited client view
5. Click an ADMIN project → full admin view
6. Click "Client Portal" pill in header → instant return to client experience
7. Highlight: one login, zero confusion, every role respected

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-08 | Initial release — dual-user routing, cross-company project list, portal navigation |
