---
title: "Document Visibility & Role-Based Access SOP"
module: document-visibility
revision: "1.0"
tags: [sop, documents, visibility, roles, access-control, admin-only]
status: draft
created: 2026-02-21
updated: 2026-02-21
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin]
---

# Document Visibility & Role-Based Access

## Purpose

Define how documents (SOPs, CAMs, handbooks, guides) are controlled for visibility across the NCC ecosystem—internal docs, public website, and role-specific views.

## Who Uses This

- **Admins**: Configure visibility settings, publish documents
- **Content Authors**: Tag documents with appropriate visibility
- **Warp/AI**: Auto-assign default visibility during document creation

## Core Concepts

### The Visibility Object

Every document includes a `visibility` block in its frontmatter:

```yaml
visibility:
  public: false              # Visible on public website?
  internal: true             # Visible in internal NCC docs?
  roles: [admin, pm, exec]   # Which roles can access?
```

### Visibility Levels

<div class="mermaid">
graph LR
    A[Document] --> B{public?}
    B -->|true| C[Website + Internal]
    B -->|false| D{internal?}
    D -->|true| E[Internal Only]
    D -->|false| F[Archived/Hidden]
    
    E --> G{Role Check}
    G -->|Match| H[✓ Visible]
    G -->|No Match| I[✗ Hidden]
    
    style C fill:#c8e6c9,stroke:#2e7d32
    style H fill:#c8e6c9,stroke:#2e7d32
    style F fill:#ffcdd2,stroke:#c62828
    style I fill:#ffcdd2,stroke:#c62828
</div>

| Setting | Description | Example Use |
|---------|-------------|-------------|
| `public: true` | Visible on marketing website | Published features, case studies |
| `internal: true` | Visible in NCC internal docs | SOPs, workflows, competitive intel |
| `internal: false` | Hidden/archived | Deprecated docs, sensitive drafts |

## Standard Roles

| Role | Code | Description | Typical Access |
|------|------|-------------|----------------|
| All Users | `all` | Any authenticated NCC user | General SOPs, announcements |
| Administrator | `admin` | System administrators | All documents (implicit) |
| Executive | `exec` | Leadership team | Strategy, financials, competitive intel |
| Project Manager | `pm` | Project managers | Operations, scheduling, client workflows |
| Estimator | `estimator` | Estimating department | Pricing, PETL, cost books, Xactimate |
| Accounting | `accounting` | Finance/payroll team | Invoicing, payroll, AR/AP, reporting |
| Field | `field` | Field crews & supers | Daily logs, timecards, safety, materials |
| Client | `client` | External (Collaborator Tech) | Scoped project docs, approvals |

## Default Visibility by Document Type

| Document Type | Default `public` | Default `internal` | Default `roles` |
|---------------|------------------|--------------------|--------------------|
| **SOP** | `false` | `true` | `[all]` |
| **CAM (draft)** | `false` | `true` | `[admin]` |
| **CAM (validated)** | `false` | `true` | `[admin, exec, pm]` |
| **CAM (published)** | `true` | `true` | `[all]` |
| **Handbook** | `false` | `true` | `[role-specific]` |
| **Session Export** | `false` | `true` | `[admin]` |

## Workflow

### Creating a New Document

<div class="mermaid">
flowchart TD
    A[Create Document] --> B[Add visibility frontmatter]
    B --> C{Document Type?}
    C -->|SOP| D["roles: [all]"]
    C -->|CAM| E["roles: [admin]"]
    C -->|Handbook| F["roles: [target-role]"]
    D --> G[Save to appropriate folder]
    E --> G
    F --> G
    G --> H[Push to main]
    H --> I[Auto-sync to Nexus Docs]
</div>

### Publishing to Website

1. Document must be in `validated` or `published` status
2. Admin reviews content for marketing appropriateness
3. Set `visibility.public: true`
4. Add `website` metadata block:
   ```yaml
   website:
     section: features|case-studies|why-ncc
     priority: 1-100
     headline: "Marketing headline"
     summary: "2-3 sentence summary"
   ```
5. Commit and push—website pipeline picks up automatically

### Changing Visibility

To expand access:
```yaml
# Before (draft)
visibility:
  public: false
  internal: true
  roles: [admin]

# After (validated, expanded)
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
```

To archive/hide:
```yaml
visibility:
  public: false
  internal: false
  roles: []
```

## Handbook Auto-Filtering

Handbooks are generated per-role by filtering the document library:

```typescript
function getHandbookForRole(role: string): Document[] {
  return allDocs.filter(doc => {
    // Must be internal
    if (!doc.visibility.internal) return false;
    
    // Check role access
    if (doc.visibility.roles.includes('all')) return true;
    if (doc.visibility.roles.includes(role)) return true;
    
    return false;
  });
}

// Generate PM Handbook
const pmHandbook = getHandbookForRole('pm');

// Generate Field Handbook  
const fieldHandbook = getHandbookForRole('field');
```

This enables:
- **Single source of truth** for all documentation
- **Role-appropriate views** without content duplication
- **Automatic updates** when source docs change

## Access Control Logic

When a user requests a document:

```typescript
function canAccess(doc: Document, user: User, context: 'web' | 'internal'): boolean {
  const vis = doc.visibility;
  
  // Public website context
  if (context === 'web') {
    return vis.public === true;
  }
  
  // Internal context - must have internal: true
  if (!vis.internal) return false;
  
  // Admin always has access
  if (user.roles.includes('admin')) return true;
  
  // Check role match
  if (vis.roles.includes('all')) return true;
  return user.roles.some(r => vis.roles.includes(r));
}
```

## Examples

### Public Feature (Website + Internal)
```yaml
title: "Real-Time Project Dashboard"
visibility:
  public: true
  internal: true
  roles: [all]
website:
  section: features
  priority: 90
  headline: "See Everything, Instantly"
  summary: "Track projects, budgets, and crews in real-time."
```

### Competitive Intel (Exec Only)
```yaml
title: "Competitor Analysis: Buildertrend vs NCC"
visibility:
  public: false
  internal: true
  roles: [admin, exec]
```

### Field-Specific SOP
```yaml
title: "Daily Log Photo Requirements"
visibility:
  public: false
  internal: true
  roles: [field, pm, admin]
```

### Archived Document
```yaml
title: "Legacy Timecard Process (Deprecated)"
visibility:
  public: false
  internal: false
  roles: []
```

## Related Documents

- [CAM System SOP](./cam-competitive-advantage-system-sop.md)
- [SOP Production Contract](../WARP.md#sop-production-contract)
- [Session Memorialization Contract](../WARP.md#session-memorialization-contract)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-21 | Initial release |
