---
title: "Field Security & Client Access SOP"
module: field-security
revision: "1.0"
tags: [sop, field-security, security, admin]
status: draft
created: 2026-03-02
updated: 2026-03-02
author: Warp
---

# Field Security & Client Access

## Purpose
Define how admins control field-level visibility/edit/export permissions across NCC using database-backed Field Security Policies, including an independent CLIENT visibility toggle.

## Who Uses This
- Admins / Owners: configure policies
- PMs / Execs: validate and audit access
- Support: troubleshoot “why can’t I see this field?”

## Workflow

### Step-by-Step Process
1. Open NCC → Admin → Security.
2. Find the security key (resource key) you want to control (example: `project.address`, `financial.revenue`).
3. Set the minimum internal role required (Crew+, Foreman+, PM+, etc.).
4. Set CLIENT visibility independently (Client can view is not inherited from the internal hierarchy).
5. Save.
6. Validate using either:
   - “View as Role” / Role Audit tools
   - The Security Inspector overlay (field highlights show which `secKey` applies)

### Flowchart
```mermaid
flowchart TD
  A[Admin selects Field Security key] --> B[Set min internal role]
  B --> C[Set Client Can View toggle]
  C --> D[Save policy]
  D --> E[UI renders field via RoleVisible(secKey)]
  E --> F{User internal role >= min role?}
  F -->|Yes| G[Allow view]
  F -->|No| H{User has Client role?}
  H -->|Yes & Client Can View| G
  H -->|No| I[Deny view]
```

## Key Features
- Internal hierarchy is **Crew+ → Super Admin** (CLIENT is not part of the chain).
- CLIENT access is a separate control: enabling CLIENT visibility does **not** implicitly allow Crew+/Foreman+/PM+.
- Policies are database-backed so changes take effect without code changes.
- Role Audit legend is draggable to avoid covering fields during audits.
- Fields can be tagged with `secKey` so policy changes apply dynamically.

## Related Modules
- Admin → Security (policy editor)
- Role Audit / View-as-Role
- Security Inspector overlay
- API: Field Security endpoints

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-03-02 | Initial draft |
