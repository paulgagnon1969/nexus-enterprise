---
cam_id: CLT-COLLAB-0003
title: "Viral Document Sharing & Graduated Identity System"
mode: CLT
category: COLLAB
revision: "1.0"
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
scores:
  uniqueness: 9
  value: 9
  demonstrable: 9
  defensible: 8
  total: 35
website: true
visibility:
  public: true
  internal: true
  roles: [all]
tags: [cam, viral-sharing, referral-chain, graduated-identity, marketplace, viewer, token-gated, document-sharing, conversion, network-effects, collaboration]
---

# CLT-COLLAB-0003: Viral Document Sharing & Graduated Identity System

> *Every document shared is a seed. Every viewer who registers is a root. Every marketplace participant is a branch.*

## Work ↔ Signal
> **The Work**: Token-gated document sharing with viewer-invites-viewer viral mechanics and a four-tier graduated identity model — from anonymous visitor to marketplace participant — with zero-friction registration and progressive opt-in.
> **The Signal**: A self-propagating referral engine that transforms every shared NexFIT report or CAM document into a network expansion event. Each share creates a tracked, attributable chain — turning content consumption into qualified pipeline. (→ Organic growth, viral coefficient, referral attribution, marketplace density)

---

## I. The Problem

NCC documents — NexFIT reports, CAM Library entries, IP-protected publications — are currently either fully public (anyone views, nobody is identified) or fully private (requires a complete NCC account). There is no middle ground.

The consequences:
- **Zero referral signal**: When a contractor shares a NexFIT report link with a colleague, there's no way to know it happened, who shared it, or who received it.
- **High registration friction**: Asking a casual viewer to create a full NCC account with company details, trade info, and billing is a conversion killer. They're here for a document, not a commitment.
- **No network effect**: Each visitor is an island. There's no mechanism for "I found this useful, let me send it to Dave" that the system can observe, measure, and amplify.
- **Lost compounding**: Without graduated identity, every anonymous viewer who leaves is a lost opportunity. With it, every viewer is a potential node in an expanding network.

No competitor in construction SaaS has a token-gated viral document sharing system with referral chain tracking. Most don't even track document views beyond basic analytics.

---

## II. The Four-Tier Graduated Identity Model

### Tier 0 — Anonymous Viewer
Arrives via a shared token link (`/nexfit?token=abc123`). Gets instant document access. Zero friction. The system logs the view (timestamp, view count) on the share token — the *document* knows it was viewed, even though the *viewer* is anonymous.

### Tier 1 — Document Account (VIEWER userType)
Lightweight self-registration: email + password only. A single unchecked checkbox: "Share my portfolio on the Nexus Marketplace." On submit, the system creates a `VIEWER` user, issues a JWT, and the person is immediately logged in. They can now:
- View all documents shared with them
- **Share documents with colleagues** — creating their own referral chain
- Subscribe to updates
- Return and log in (their session persists via JWT)

The key insight: **sharing requires registration**. This is the conversion gate. It's not a paywall — it's a "to share, we need to know who you are" gate. Natural, non-coercive, and it captures exactly the people who are engaged enough to want to share.

### Tier 2 — Marketplace Participant
On return visits, VIEWER users who haven't opted into the marketplace see a dialog explaining what the marketplace offers:
- Company listed in the contractor directory
- Access to bid requests from property managers and carriers
- Vendor pricing intelligence from aggregated NexOP data
- Ability to share and receive referrals across the network

The dialog includes a countdown: "This dialog will appear N more time(s)." After 3 dismissals, it stops showing — but a persistent "Add me to Marketplace" pill button remains in the lower-right corner. Always visible, never intrusive.

### Tier 3 — NCC Subscriber
Activates modules. Runs their business on the platform. The flywheel is spinning.

---

## III. The Viral Referral Chain

### Token-Based Tracking

Every share creates a `DocumentShareToken` record:
- **token**: Unique 48-character hex string
- **documentType**: NEXFIT_REPORT, CAM_LIBRARY, or CAM_DOCUMENT
- **inviterEmail / inviterName**: Who shared
- **inviteeEmail / inviteeUserId**: Populated when the recipient registers
- **parentTokenId**: The token that led to *this* share (self-referential FK)
- **depth**: 0 = original share, 1+ = viral chain depth
- **viewCount / firstViewedAt / lastViewedAt**: Engagement tracking

### Viewer-Invites-Viewer

When a VIEWER user shares a document, their share token becomes the `parentToken` for the new share. This creates a tree:

```
Paul (depth 0) → shares with Dave (depth 1)
                      Dave → shares with Mike (depth 2)
                      Dave → shares with Sarah (depth 2)
                                Sarah → shares with Tom (depth 3)
```

The `GET /nexfit/chain/:token` endpoint returns the full ancestry for any share token — showing exactly how a document propagated through the network.

### Viral Metrics

From the share token tree, the system can derive:
- **Viral coefficient (k)**: Average number of downstream shares per share
- **Chain depth**: How many hops a document travels
- **Conversion rate per depth**: What % of viewers at depth N register vs. bounce
- **Attribution**: Which original sharer generated the most downstream registrations

---

## IV. Bookmark Prompt & Return Loop

Browsers don't allow JavaScript to create bookmarks (security restriction). Instead, the system uses a non-intrusive prompt:

- After 5 seconds on the results page, a banner slides in: **"Bookmark this page"** with ⌘D / Ctrl+D keyboard shortcut highlighted
- The banner is dismissible and remembers the dismissal via localStorage
- The Web App Manifest (`apps/web/app/manifest.ts`) enables "Add to Home Screen" on mobile — functioning as a progressive web app bookmark

The goal: get the VIEWER to return. Every return visit is another opportunity for the marketplace dialog, another chance for them to share, another node in the network.

---

## V. Technical Implementation

### Schema

| Model | Purpose |
|-------|---------|
| `DocumentShareToken` | Tracks every share link, view counts, referral chain |
| `ShareDocumentType` enum | NEXFIT_REPORT, CAM_LIBRARY, CAM_DOCUMENT |
| `UserType.VIEWER` | New user type for lightweight document accounts |
| `User.marketplaceOptIn` | Boolean flag for marketplace participation |

### API Endpoints (All Public — No Auth)

| Endpoint | Purpose |
|----------|---------|
| `POST /nexfit/share` | Generate share token + URL with referral chain |
| `GET /nexfit/view/:token` | Validate token, log view, return document metadata |
| `POST /nexfit/register` | Lightweight VIEWER registration, returns JWT |
| `GET /nexfit/chain/:token` | Return referral chain ancestry for analytics |

### Web UI Additions

- **Share section** on NexFIT results page — warm yellow card below lead capture
- **Registration modal** — email + password + marketplace checkbox, triggered when unregistered user tries to share
- **Marketplace opt-in dialog** — appears for returning VIEWER users, max 3 times, with countdown text
- **Persistent marketplace pill** — fixed lower-right button for VIEWER users who haven't opted in
- **Bookmark prompt banner** — Cmd+D hint with keyboard shortcut styling, auto-dismissible

### Files Created / Modified

| Component | Path |
|-----------|------|
| Share DTOs | `apps/api/src/modules/nexfit/dto/share.dto.ts` |
| NexFIT Service (extended) | `apps/api/src/modules/nexfit/nexfit.service.ts` |
| NexFIT Controller (extended) | `apps/api/src/modules/nexfit/nexfit.controller.ts` |
| NexFIT Module (JwtModule added) | `apps/api/src/modules/nexfit/nexfit.module.ts` |
| NexFIT Web Page (extended) | `apps/web/app/nexfit/page.tsx` |
| Prisma Schema | `packages/database/prisma/schema.prisma` |
| This CAM | `docs/cams/CLT-COLLAB-0003-viral-document-sharing.md` |

---

## VI. Competitive Advantage

### Why This Compounds

1. **Every share is free distribution**: The system doesn't pay for ads. Engaged users do the distribution by sharing documents with colleagues. Each share is a qualified referral — the recipient was hand-picked by someone who found value.

2. **The referral chain creates attribution**: Unlike UTM parameters that track the first click, share tokens track the entire propagation tree. "This registration came from a share by Dave, who was shared to by Paul, who found us via NexFIT." Multi-level attribution for free.

3. **Graduated identity minimizes friction**: Asking for email + password is the minimum viable identity. No company name, no trade selection, no billing info. The marketplace dialog introduces those asks *after* the user has already derived value and established trust. This is the opposite of the typical SaaS registration wall.

4. **The marketplace opt-in is inevitable**: With a persistent button and up to 3 dialog prompts, engaged VIEWER users will eventually opt in. The system is patient — it doesn't nag, it nudges. And it never blocks access to do so.

5. **Network density drives marketplace value**: Every VIEWER registration adds a node. Every marketplace opt-in adds a participant. As the network grows, the marketplace becomes more valuable — more contractors, more bid requests, more supplier data, more referral opportunities. Classic network effect.

### CAM Score Justification

- **Uniqueness (9/10)**: No construction SaaS has token-gated viral document sharing with referral chain tracking and graduated identity. This is a consumer-grade growth mechanic applied to B2B construction software.
- **Value (9/10)**: Converts passive content viewers into identified prospects, then into marketplace participants, then into subscribers. Each step is a measurable funnel stage with compounding network effects.
- **Demonstrable (9/10)**: The entire flow can be demonstrated live — share a NexFIT link, see the token in the URL, register in 10 seconds, see the share chain, watch the marketplace dialog appear on return.
- **Defensible (8/10)**: The share token mechanics are technically simple. The defensibility comes from the *data* — the referral chain graph, the VIEWER user base, and the marketplace density that accumulates over time. A competitor can copy the code; they can't copy the network.

---

## VII. Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — 4-tier identity, token-gated sharing, referral chain, marketplace opt-in dialog, bookmark prompt |
