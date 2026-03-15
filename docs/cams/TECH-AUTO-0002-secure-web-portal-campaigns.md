---
cam_id: TECH-AUTO-0002
title: "Secure Web Portal Campaigns — Reusable CNDA-Gated Document Distribution"
mode: TECH
category: AUTO
revision: "1.0"
status: draft
created: 2026-03-13
updated: 2026-03-13
author: Warp
website: false
scores:
  uniqueness: 8
  value: 9
  demonstrable: 9
  defensible: 7
  total: 83
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, technology, automation, campaigns, cnda, secure-portal, document-sharing, gated-access, compliance, investor-relations]
---

# TECH-AUTO-0002: Secure Web Portal Campaigns

> *"Select the documents. Define the gate. Launch the portal. Every viewer is identified, every access is logged, every campaign is measurable."*

## Work ↔ Signal
> **The Work**: Admins select documents from the secure repository, attach a CNDA+ template, and launch a branded portal — no developer, no custom page, no code changes.
> **The Signal**: Every campaign generates a conversion funnel (invites → CNDA signed → questionnaire completed → documents viewed) that quantifies stakeholder engagement and content effectiveness. (→ Market Intelligence: document engagement analytics, investor pipeline velocity)

## Elevator Pitch

Nexus turns every document in its secure repository into a launchable campaign with a single workflow. An admin selects one or more eDocs, picks (or customizes) a CNDA+ compliance template, and hits "Launch." The system generates a unique portal URL with a multi-gate access pipeline: landing page → CNDA+ acceptance with e-signature → optional questionnaire → identity verification → gated content viewer. Every portal is independently branded, independently gated, and independently measured. No code changes, no developer involvement, no per-campaign engineering cost. The same infrastructure that powers the CAM Library PIP, investor packets, compliance documentation, and client-facing proposals — all from one reusable engine.

## The Problem

Every time a company needs to share sensitive documents with external stakeholders — investors, partners, insurers, regulators, prospective clients — the workflow is the same:

1. **Build a custom page** or use a generic file-sharing tool (Google Drive, Dropbox)
2. **Add access controls** — passwords, email gates, or nothing at all
3. **Hope for compliance** — no CNDA, no e-signature, no identity verification
4. **Guess at engagement** — no analytics, no funnel, no conversion data

The result: engineering builds a bespoke page for every campaign. Or worse, sensitive IP goes out via email attachments and shared folder links with zero accountability.

Construction-specific problems compound this:
- **Investor packets** need CNDA protection but also need to be easy to access
- **Insurance documentation** requires proof of viewer identity
- **Subcontractor pre-qualification packets** need selective document visibility
- **Client proposals** with proprietary pricing need audit trails

Every campaign is a one-off engineering project. The cost per campaign scales linearly with the number of campaigns.

## The Insight

The access pipeline is always the same: **identify → agree → verify → view**. The only things that change between campaigns are:
- Which documents are included
- What the CNDA text says
- Who gets invited
- What the questionnaire asks (if anything)

**The compliance gate is the product. The documents are the payload.** By making the gate reusable and the payload configurable, every campaign becomes a database row instead of a codebase change.

## What It Does

### Campaign Builder (Admin UI)

Admins create campaigns from `System → Campaigns` with a visual builder:

1. **Campaign metadata** — name, slug, description, status (DRAFT → ACTIVE → PAUSED → ARCHIVED)
2. **CNDA template selection** — pick from saved templates or create custom CNDA+ text per campaign
3. **Document attachment** — select eDocs from the secure repository, set display order
4. **Invite management** — individual or batch email invites with branded templates
5. **Analytics dashboard** — real-time conversion funnel, visitor timeline, per-document engagement

### Multi-Gate Access Pipeline

Every campaign portal enforces a progressive compliance pipeline:

```
Visitor arrives at /portal/{token}
    │
    ├─ Gate 1: Token Validation
    │   └─ Invalid/expired → branded error page
    │
    ├─ Gate 2: CNDA+ Acceptance
    │   ├─ Display campaign-specific CNDA text (HTML-rendered)
    │   ├─ Require typed full name + e-signature checkbox
    │   └─ Record: name, email, IP, user-agent, timestamp
    │
    ├─ Gate 3: Questionnaire (if configured)
    │   └─ Campaign-specific questions with structured responses
    │
    ├─ Gate 4: Identity Verification
    │   └─ Email confirmation loop (returning viewers skip via localStorage)
    │
    └─ Gate 5: Content Viewer
        ├─ Campaign documents rendered in branded viewer
        ├─ Navigation sidebar with document list
        └─ Session persisted — return visits skip completed gates
```

### CNDA Template System

Templates are first-class entities with full CRUD:
- **Default template**: "Standard CNDA+" seeded on first migration
- **Custom templates**: Admins create, edit, and version CNDA text per use case
- **Per-campaign override**: Each campaign can use a shared template or define inline CNDA text
- **HTML rendering**: Full rich-text CNDA display with legal formatting preserved

### Campaign Analytics

Every campaign tracks a complete conversion funnel:

```
Invites Sent → Portal Visits → CNDA Signed → Questionnaire Done → Docs Viewed
     100           72              58              52                 48
                  72%             81%             90%                92%
```

Analytics include:
- **Funnel metrics**: conversion rates at each gate
- **Visitor list**: name, email, company, CNDA status, last activity, documents viewed
- **Activity timeline**: chronological event log across all visitors
- **Per-document engagement**: which documents are most/least viewed

### Batch Operations

- **Batch invite**: Upload a list of emails, all receive branded portal invitations
- **Campaign cloning**: Duplicate a campaign with new slug (same documents, same CNDA, fresh analytics)
- **Status lifecycle**: DRAFT → ACTIVE → PAUSED → ARCHIVED with automatic portal access control

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                        Campaign Builder UI                            │
│                  apps/web/app/system/campaigns/page.tsx                │
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌────────────┐  │
│  │ Campaign List │  │ Create/Edit  │  │ Detail    │  │ Analytics  │  │
│  │ Table        │  │ Modal        │  │ Tabs (4)  │  │ Funnel     │  │
│  └──────────────┘  └──────────────┘  └───────────┘  └────────────┘  │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ REST API
┌───────────────────────────────┴───────────────────────────────────────┐
│                           API Server                                  │
│                                                                       │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │ CampaignsModule     │  │ CndaTemplates    │  │ PortalAccess   │  │
│  │                     │  │ Module           │  │ Module         │  │
│  │ CRUD + Invite +     │  │                  │  │                │  │
│  │ Analytics           │  │ CRUD + Default   │  │ Gate Flow:     │  │
│  │                     │  │ Template Seed    │  │ validate →     │  │
│  │ POST /campaigns     │  │                  │  │ cnda → quest → │  │
│  │ POST /:id/invite    │  │ GET/POST/PATCH   │  │ identity →     │  │
│  │ POST /:id/batch     │  │ /cnda-templates  │  │ content        │  │
│  │ GET  /:id/analytics │  │                  │  │                │  │
│  └──────────┬──────────┘  └────────┬─────────┘  └───────┬────────┘  │
│             │                      │                     │           │
│  ┌──────────┴──────────────────────┴─────────────────────┴────────┐  │
│  │ Prisma (PostgreSQL)                                             │  │
│  │                                                                  │  │
│  │ SecurePortalCampaign ←→ CampaignDocument ←→ Document            │  │
│  │ CndaTemplate          ShareDocumentAccess (SECURE_PORTAL type)  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────┐                                                 │
│  │ EmailService     │  sendPortalInvite() — branded campaign emails  │
│  └──────────────────┘                                                 │
└───────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┴───────────────────────────────────────┐
│                     Portal Viewer (Public)                             │
│              apps/web/app/portal/[token]/page.tsx                      │
│                                                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Landing │→ │ CNDA+    │→ │ Questionnaire│→ │ Document Viewer  │  │
│  │ Page    │  │ Accept   │  │ (optional)   │  │ (gated content)  │  │
│  └─────────┘  └──────────┘  └──────────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### Database Schema (4 new models + 1 enum extension)

| Model | Purpose |
|-------|---------|
| `CndaTemplate` | Reusable CNDA+ text templates with name, HTML body, default flag |
| `SecurePortalCampaign` | Campaign entity: name, slug, status, CNDA template ref, description |
| `CampaignDocument` | Join table: campaign ↔ document with display order |
| `CampaignStatus` enum | DRAFT, ACTIVE, PAUSED, ARCHIVED lifecycle |
| `ShareDocumentType.SECURE_PORTAL` | New enum value for portal access tracking |

### API Endpoints (8 routes)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/campaigns` | Create campaign |
| `GET` | `/campaigns` | List all campaigns |
| `GET` | `/campaigns/:id` | Get campaign detail with documents |
| `PATCH` | `/campaigns/:id` | Update campaign |
| `DELETE` | `/campaigns/:id` | Delete campaign |
| `POST` | `/campaigns/:id/invite` | Send individual portal invite |
| `POST` | `/campaigns/:id/batch-invite` | Send batch portal invites |
| `GET` | `/campaigns/:id/analytics` | Get conversion funnel + visitor data |

### Frontend Components

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/app/system/campaigns/page.tsx` | ~838 | Full campaign builder: list, create/edit modal, 4-tab detail view |
| `apps/web/app/portal/[token]/page.tsx` | ~880 | Generalized CNDA-gated portal viewer |
| `apps/web/app/system/layout.tsx` | +1 line | Campaigns link in system sidebar |

## Why Competitors Can't Replicate This Easily

1. **CNDA+ compliance pipeline is the moat**: The multi-gate access system (CNDA → e-signature → questionnaire → identity → content) is built into the platform's identity and compliance infrastructure. A competitor would need to build the entire compliance stack from scratch — it's not a feature you bolt on.

2. **Document repository integration**: Campaigns pull from the existing secure eDoc repository. Competitors using external file storage (S3, Google Drive) can't offer the same seamless document selection workflow.

3. **Shared access tracking**: The `ShareDocumentAccess` model unifies tracking across all sharing mechanisms (direct shares, CAM portal, campaigns). A single audit trail spans every way a document was ever shared. Building this retroactively on a platform that treats each sharing method as a silo would require a data model rewrite.

4. **Analytics are built-in, not bolted on**: Conversion funnels, visitor tracking, and per-document engagement are native to the campaign model. Competitors who use third-party analytics (Mixpanel, Amplitude) can't correlate viewer identity with CNDA compliance status.

5. **Template system enables scale**: The CNDA template CRUD means legal teams can maintain and version compliance language without developer involvement. Each campaign inherits institutional compliance knowledge.

## Integration Points

- **CAM Library PIP**: The original CNDA-gated viewer that this system generalizes. PIP is now a specialized campaign.
- **CLT-COLLAB-0003** (Viral Document Sharing): Campaign portals can leverage the same graduated identity system.
- **CLT-COLLAB-0004** (CAM Portal Viral Referral): Referral mechanics can be extended to campaign portals.
- **CMP-CMP-0001** (CNDA+ Gated Access): The campaign system reuses the same CNDA+ compliance pipeline.

## Future Extensions

- **Campaign templates**: Save entire campaign configurations (document sets + CNDA + questionnaire) as reusable templates
- **Scheduled campaigns**: Launch and expire campaigns on a schedule
- **A/B testing**: Run parallel campaigns with different CNDA text or document ordering to optimize conversion
- **Webhook integrations**: Fire events on CNDA acceptance, questionnaire completion, document view
- **CRM sync**: Push campaign analytics to external CRM systems (HubSpot, Salesforce)
- **Campaign-level permissions**: Role-based access to campaign management (not just SUPER_ADMIN)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-13 | Initial release — full campaign system with CNDA templates, multi-gate portal, analytics, batch invites |
