---
title: "NexDocs — Integrated Document Management & Knowledge Platform"
cam_id: OPS-VIS-0004
mode: OPS
category: VIS
revision: "1.0"
tags: [cam, ops, visibility, documents, knowledge-management, mermaid, sop, edocs]
status: validated
created: 2026-03-10
updated: 2026-03-10
author: Warp
score:
  uniqueness: 8
  value: 8
  demonstrable: 8
  defensible: 6
  total: 30
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# OPS-VIS-0004 — NexDocs: Integrated Document Management & Knowledge Platform

## Work ↔ Signal
> **The Work**: Full document management with HTML editor, Mermaid diagrams, reader mode, PDF export, group/category organization, and role-based access — all inside the platform.
> **The Signal**: Companies that maintain structured, accessible documentation demonstrate professional rigor — document completeness feeds the operational integrity score. (→ Reputation: documentation quality)

## Elevator Pitch
Nexus ships a complete document management system inside the platform — no Confluence, Notion, or SharePoint required. SOPs, competitive advantage modules, handbooks, and training materials are authored, versioned, published, and role-filtered within the same application employees already use for project management.

## Problem
Restoration and construction companies scatter their operational knowledge across disconnected tools: Google Docs for SOPs, Notion for onboarding, email for policy updates, shared drives for templates. This creates:
- **Knowledge silos**: New hires can't find procedures; field crews lack access to current SOPs.
- **Version drift**: Outdated copies circulate while the canonical version sits in someone's personal drive.
- **No role filtering**: Accounting SOPs get pushed to field crews; field procedures get buried under admin docs.
- **No audit trail**: No record of who read what, when content was last reviewed, or whether policies are current.

## Solution

### Core Document Engine
- **Rich HTML editor** with WYSIWYG editing via TipTap, raw HTML editing mode, and live preview toggle.
- **Version history** — every save creates a new version; previous versions are preserved and diffable.
- **DOMPurify sanitization** — all HTML is sanitized server-side and client-side. No `<script>`, `<iframe>`, or event handlers pass through. Security-first architecture.

### Mermaid Diagram Support
- Documents containing `<div class="mermaid">` blocks automatically render as interactive flowcharts, architecture diagrams, org charts, and Gantt charts.
- **Dynamic import** — Mermaid.js is lazy-loaded only when a document contains diagram blocks, keeping bundle size lean.
- **Error handling** — Invalid syntax shows inline error messages with the problematic code, not a blank space.
- **Strict security** — `securityLevel: 'strict'` prevents any code execution inside diagrams.

### Reader Mode
- Full-screen distraction-free reading view with optimized typography.
- Mermaid diagrams re-render in reader mode with full width.
- Print / PDF export preserves all formatting and diagrams.

### Publication & Distribution Pipeline
- **SOP staging workflow**: SOPs are authored in `docs/sops-staging/`, synced to an "Unpublished SOPs" group, reviewed by admins, and published to role-appropriate audiences.
- **Tenant publishing**: Documents can be published to all tenants or to specific companies.
- **Retraction**: Published documents can be retracted without deletion, preserving audit history.
- **Public slugs**: Select documents can be assigned public URLs for website or client-facing access.

### Role-Based Visibility
- Every document carries visibility metadata: `public`, `internal`, and `roles[]`.
- The platform automatically filters documents by the reader's role — a field crew member sees only field-relevant SOPs; accounting sees financial procedures.
- Handbook auto-generation: role-specific handbooks are dynamically assembled by filtering the document corpus.

### CAM Library Integration
- Competitive Advantage Modules (CAMs) are scored, versioned, and stored in eDocs.
- CAMs flagged `website: true` feed into the website content pipeline.
- The CAM scoring rubric (Uniqueness, Value, Demonstrable, Defensible) is applied during development sessions and tracked as document metadata.

### Code-to-Docs Sync
- `npm run docs:sync` pushes markdown files from `docs/sops-staging/` and `docs/cams/` directly to the Nexus Documents API.
- Frontmatter (title, tags, revision, visibility) maps to document metadata automatically.
- Development session exports are automatically staged for review.

## Competitive Landscape
- **Procore**: Has a Documents module but no WYSIWYG editing, no Mermaid diagrams, no SOP staging workflow. Documents are static file uploads.
- **Xactware/Xactimate**: No document management at all — purely estimating software.
- **Buildertrend**: Basic document storage (upload/download). No versioning, no role filtering, no rich content.
- **Restoration-specific platforms (PSA, DASH, CoreLogic)**: File storage only. No knowledge management features.

## Key Differentiators
1. **Diagrams in documents** — no restoration platform renders flowcharts and architecture diagrams natively.
2. **SOP staging → publish workflow** — operational procedures go through a review pipeline, not just file uploads.
3. **Role-filtered knowledge** — the system shows each user only what's relevant to their role, automatically.
4. **Code-to-docs pipeline** — development work automatically generates operational documentation.
5. **Single platform** — no context-switching between project management and knowledge management tools.

## Demo Script
1. Open eDocs → show document list with categories and tags.
2. Open an SOP with a Mermaid flowchart → diagram renders inline.
3. Toggle Reader Mode → full-screen optimized view.
4. Show version history → click a previous version to compare.
5. Open the Unpublished SOPs group → show staging workflow.
6. Switch user roles → demonstrate role-filtered document visibility.
7. Run `npm run docs:sync` → show how code-generated docs appear in eDocs.

## Technical Architecture
```
docs/sops-staging/*.md  ─┐
docs/cams/*.md           ─┤── npm run docs:sync ──→ Nexus API ──→ SystemDocument table
Manual WYSIWYG editing   ─┘                                            │
                                                                       ▼
                                                              Version history
                                                              Publication records
                                                              Role-based filtering
                                                                       │
                                                                       ▼
                                                              eDocs viewer (Next.js)
                                                              ├── DOMPurify sanitization
                                                              ├── Mermaid lazy rendering
                                                              ├── Reader Mode
                                                              └── PDF export
```

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-10 | Initial CAM creation |
