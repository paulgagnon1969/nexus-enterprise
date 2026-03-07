---
title: "Client Portal SOP"
module: client-portal
revision: "2.0"
tags: [sop, client-portal, client-access, project-management, onboarding, pm, admin]
status: draft
created: 2026-03-06
updated: 2026-03-07
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, pm, exec]
---

# Client Portal

## Purpose
The Client Portal gives clients (homeowners, insurance adjusters, property managers) a secure, read-only view of their projects on Nexus. Clients can view project details, invoices, daily logs, documents, and schedules — without access to internal contractor tooling. A single client account can see projects from multiple contractors in one unified view.

## Who Uses This
- **Clients** — Individuals invited to one or more projects by a contractor
- **Project Managers / Admins** — Send invitations and manage client portal access
- **Dual-Role Users** — Users who are both a client on some projects and a contractor on others

## Portal Pages

### 1. Projects List (`/client-portal`)
The landing page after login. Shows all projects the client has access to, grouped by contractor company.

- Each project card shows: name, address, status badge, company name
- Click a project → project detail page
- Tab navigation: **Projects** | **Finance**

### 2. Project Detail (`/client-portal/projects/[id]`)
Scoped view of a single project with collapsible sections:

- **Daily Logs** — Shared daily logs (only those marked `effectiveShareClient: true`). Shows log title, date, author, weather, work performed text, and downloadable attachments.
- **Invoices** — All non-draft, non-void invoices. Shows invoice number, date, total, balance due, status badge. Click for full invoice detail view.
- **Schedule** — Project tasks with start/end dates and duration.
- **Documents** — Project files excluding internal-only records (PETL archives, OCR results, reconciliation attachments). All downloads are proxied through the API (MinIO is not publicly accessible).
- **Messages** — Recent message threads with preview of last message.

### 3. Invoice Detail View
Accessed by clicking an invoice from the project detail page. Full invoice layout with:

- Status banner (Issued / Partially Paid / Paid / Overdue)
- Company and project info
- Bill-to details
- Line items table (description, qty, unit price, amount)
- Totals with paid/balance breakdown
- Supporting document attachments (downloadable)
- Payment history
- **Print button** — Opens browser print dialog with clean print stylesheet (white background, proper borders, status-colored banners)

### 4. Finance Summary (`/client-portal/finance`)
Aggregated financial view across all projects:

- Total invoiced, total paid, outstanding balance
- All invoices across all projects
- Recent payments

## Workflow

### Inviting a Client

1. PM/Admin opens a project in NCC
2. Sends invite via **Invite Client** action (provides client email and optional name)
3. System finds or creates a `User` record (`userType: CLIENT`)
4. System finds or creates a `TenantClient` record linking the user to the contractor company
5. `ProjectMembership` is created with `EXTERNAL_CONTACT` scope and `LIMITED` visibility
6. Invite email sent with registration link (7-day token TTL)

### First-Time Client Access

1. Client receives invite email: "{Contractor Name} has invited you to view your project on Nexus"
2. Client clicks **Set Up Your Account** → `/register/client?token=...`
3. Page shows project name and contractor name (resolved from token)
4. Client sets a password (minimum 8 characters) and submits
5. Authenticated and redirected to `/client-portal`

### Returning Client Login

1. Client visits `/login`
2. Enters email and password
3. System detects `userType: CLIENT` with no active `CompanyMembership`
4. Redirected to `/client-portal`

### Downloading Documents

1. Client clicks a document or attachment download link
2. Frontend sends authenticated request to `GET /projects/portal/:id/files/:fileId/download`
3. API validates portal access, fetches file from MinIO, streams to client
4. Browser triggers file download with correct filename and content type

### Flowchart

```mermaid
flowchart TD
    A[PM sends invite from project] --> B[System creates User + TenantClient + ProjectMembership]
    B --> C[Invite email sent with registration link]
    C --> D[Client clicks link → /register/client]
    D --> E[Sets password → authenticated]
    E --> F[/client-portal — Projects List]

    F --> G[Clicks a project]
    G --> H[Project Detail — Daily Logs, Invoices, Schedule, Docs, Messages]
    H --> I[Clicks invoice → Invoice Detail with print option]
    H --> J[Clicks document → API-proxied download]

    F --> K[Finance tab]
    K --> L[Aggregated finance across all projects]

    subgraph Returning Client
        R1[/login] --> R2[Email + password]
        R2 --> R3{CLIENT user type?}
        R3 -->|Yes| F
        R3 -->|No| R4[Standard NCC dashboard]
    end
```

## API Endpoints

All portal endpoints require JWT authentication and validate portal access per request.

- `GET /projects/portal/my-projects` — List all projects for the client
- `GET /projects/portal/:id` — Project detail (info, invoices, files, schedule, messages, daily logs)
- `GET /projects/portal/:id/invoices/:invoiceId` — Invoice detail with line items, attachments, payments
- `GET /projects/portal/:id/files/:fileId/download` — Proxy file download from MinIO
- `GET /projects/portal/finance` — Aggregated finance summary

### Access Management (Admin/PM endpoints)
- `POST /projects/:id/invite-client` — Invite a client to view a project
- `GET /projects/:id/portal-viewers` — List portal viewers for a project
- `DELETE /projects/:id/portal-viewers/:userId` — Revoke portal access

## Visibility Levels

Each `ProjectMembership` has a `visibility` field controlling what the client sees:

- **FULL** — All project data (same as internal users)
- **LIMITED** — Basic info, messages, files, schedule, invoices, daily logs; excludes PETL/cost book internals
- **READ_ONLY** — Same as LIMITED but explicitly no invoice access

## Key Features

### Single Account, Multiple Contractors
A client with projects from three different contractors sees all of them on one screen, grouped by contractor. No separate logins per contractor.

### No Organization Setup Required
Clients are individual users — no company registration, no org onboarding. Just email and password.

### Existing User Detection
If the invite email matches an existing Nexus user, no duplicate account is created. The new project is added to their existing account.

### Secure File Downloads
MinIO storage is not publicly accessible. All file downloads are proxied through the authenticated API, ensuring clients can only download files from their own projects.

### Light Theme
The portal uses a clean light theme (white cards, light gray backgrounds, blue accents) distinct from the main NCC dark-themed interface, signaling to clients that they are in a scoped, read-only environment.

### Print-Ready Invoices
Invoice detail view includes a print button and optimized print stylesheet with white backgrounds, proper borders, and status-colored banners.

## Related Modules
- Authentication — Client login, JWT auth, `@ClientAllowed` guard
- Nexus Documents — Shared document storage and file management
- Invoicing — Invoice creation and payment tracking (admin-side)
- Daily Logs — Field log creation and client sharing controls
- Project Management — Project creation, status, scheduling

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial draft — pre-implementation design |
| 2.0 | 2026-03-07 | Full rewrite reflecting actual implementation: project list, detail, finance, invoice detail, file download proxy, daily logs, light theme, print layout |
