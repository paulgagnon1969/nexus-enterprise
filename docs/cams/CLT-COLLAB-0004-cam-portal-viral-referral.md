---
cam_id: CLT-COLLAB-0004
title: "CAM Portal Viral Referral System"
mode: CLT
category: COLLAB
revision: "1.0"
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
scores:
  uniqueness: 8
  value: 9
  demonstrable: 8
  defensible: 8
  total: 83
website: true
visibility:
  public: true
  internal: true
  roles: [all]
tags: [cam, viral-referral, referral-chain, token-gated, cam-access, network-effects, collaboration, cnda, invite]
---

# CLT-COLLAB-0004: CAM Portal Viral Referral System

> *Every viewer becomes a recruiter. Every referral is a tracked, attributable link in a self-propagating chain.*

## Work ↔ Signal
> **The Work**: Embedded referral mechanics inside the token-gated CAM access portal — viewers who have passed the CNDA+ gate can invite colleagues directly from the content view, generating child tokens with full ancestry tracking, depth limits, and branded invite emails.
> **The Signal**: A self-propagating distribution engine that converts every satisfied CAM viewer into an active referral channel. Each referral creates a new tracked token with parent-chain attribution — turning IP-protected content consumption into measurable, organic pipeline expansion. (→ Viral coefficient, referral depth, conversion attribution, qualified lead generation)

---

## I. The Problem

NCC's Competitive Advantage Modules represent the company's most valuable intellectual property — detailed documentation of every defensible feature, its architecture, and its business impact. Sharing this content with potential clients, partners, and investors requires a controlled, trackable mechanism.

The existing problem:
- **No organic distribution**: CAM content is either locked behind full NCC accounts or shared via email attachments with zero tracking. There's no way for an impressed viewer to say "let me send this to my colleague" within the system.
- **Lost attribution**: When a PDF is forwarded, the chain is invisible. Who shared with whom? Did the recipient actually read it? Did they share it further? All unknown.
- **No network effect on IP distribution**: Each CAM share is a one-time event. There's no mechanism for the system to observe, measure, and amplify the propagation of its own competitive intelligence.
- **Manual referral overhead**: Without embedded referral mechanics, every new CAM viewer requires a manual invite from an admin — creating a bottleneck at the exact moment momentum matters most.

No competitor in construction SaaS has a self-propagating referral system embedded inside IP-protected content delivery.

---

## II. The Solution: Embedded Viral Referral Chain

### How It Works

Once a viewer has passed all CNDA+ gates (accept → sign → verify identity) and is viewing CAM content, three referral surfaces are available:

1. **Floating Referral Button** — A persistent "Refer Someone" button (lower-right corner) visible throughout the content browsing experience. Always accessible, never intrusive.

2. **CTA Banner** — A contextual banner within the content view: *"Know someone who'd benefit from this? Invite them to explore NCC's capabilities."* with a direct "Invite a Colleague" action.

3. **Referral Modal** — A clean form collecting the referral's name and email. On submission, the system:
   - Validates the email isn't already in the system (duplicate prevention)
   - Creates a new `DocumentShareToken` with `parentTokenId` pointing to the referrer's token
   - Increments depth (referrer's depth + 1, capped at 5)
   - Sends a branded HTML invite email from the referrer's name
   - Returns confirmation with the generated share link

### Token Chain Architecture

Every referral creates a parent-child relationship in the `DocumentShareToken` table:

```
Admin invites Paul (depth 0)
  └─ Paul refers Dave (depth 1)
       ├─ Dave refers Mike (depth 2)
       └─ Dave refers Sarah (depth 2)
            └─ Sarah refers Tom (depth 3)
```

The `parentTokenId` field is a self-referential foreign key — each token knows exactly who invited the person who created it. The full ancestry is traversable in either direction.

### Depth Limiting

Maximum referral depth is capped at 5 to maintain quality control:
- Depth 0: Original admin invite
- Depth 1–3: High-trust organic referrals
- Depth 4–5: Extended network reach
- Beyond 5: Blocked — the referrer sees a message explaining the limit

This prevents unbounded viral spread while allowing meaningful network expansion.

### Duplicate Prevention

Before creating a referral token, the system checks:
- Is there already a `DocumentShareToken` for this email with the same document type?
- If yes, the referrer is informed the person already has access — no duplicate token created

This prevents spam, avoids confusing the recipient with multiple links, and keeps the referral chain clean.

---

## III. The Invite Email

Referral emails are branded HTML with:
- **Referrer attribution**: "Paul Gagnon thinks you'd be interested in NCC's capabilities"
- **One-click access**: Direct link to the CAM portal with the recipient's unique token
- **CNDA+ context**: Brief explanation that the content is IP-protected and requires a quick agreement
- **Professional styling**: Matches NCC brand guidelines with dark header, clean typography

The email comes from the system (not the referrer's personal email), ensuring deliverability and brand consistency.

---

## IV. Referral Analytics

From the token chain, the system derives:

- **Viral coefficient (k)**: Average referrals per viewer — k > 1 means exponential growth
- **Chain depth distribution**: How many hops content typically travels
- **Conversion rate by depth**: What % of referrals at each depth complete the CNDA+ gates
- **Top referrers**: Which viewers generate the most downstream activity
- **Time-to-refer**: How quickly viewers refer after gaining access (engagement signal)

These metrics are available in the CAM Dashboard for admin visibility.

---

## V. Technical Implementation

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /cam-access/:token/refer` | Submit a referral — creates child token, sends email |
| `POST /cam-access/recover` | Recover access link by email (enumeration-safe) |

### Key Service Methods

| Method | Location | Purpose |
|--------|----------|---------|
| `submitReferral()` | `cam-access.service.ts` | Validates parent token, checks duplicates, creates child token, sends email |
| `recoverLink()` | `cam-access.service.ts` | Looks up token by email, re-sends invite email |

### Schema

| Field | Type | Purpose |
|-------|------|---------|
| `DocumentShareToken.parentTokenId` | FK (self-referential) | Links to the token that generated this referral |
| `DocumentShareToken.depth` | Int | 0 = original invite, 1+ = referral chain depth |
| `DocumentShareToken.inviterEmail` | String | Who made the referral |
| `DocumentShareToken.inviterName` | String | Display name for the invite email |

### Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Floating referral button | `cam-access/[token]/page.tsx` | Persistent lower-right button in content view |
| CTA banner | `cam-access/[token]/page.tsx` | Contextual banner encouraging referrals |
| Referral modal | `cam-access/[token]/page.tsx` | Name + email form with submission handling |

### Files Created / Modified

| Component | Path |
|-----------|------|
| CAM Access Service (extended) | `apps/api/src/modules/cam-access/cam-access.service.ts` |
| CAM Access Controller (extended) | `apps/api/src/modules/cam-access/cam-access.controller.ts` |
| CAM Access Module (EmailService added) | `apps/api/src/modules/cam-access/cam-access.module.ts` |
| CAM Access Portal (referral UI) | `apps/web/app/cam-access/[token]/page.tsx` |
| CAM Access Landing Page | `apps/web/app/cam-access/page.tsx` |
| This CAM | `docs/cams/CLT-COLLAB-0004-cam-portal-viral-referral.md` |

---

## VI. Relationship to CLT-COLLAB-0003

CLT-COLLAB-0003 (Viral Document Sharing & Graduated Identity) describes the *general* viral sharing architecture for NexFIT reports and documents — the four-tier graduated identity model, marketplace opt-in, and viewer-invites-viewer mechanics.

CLT-COLLAB-0004 (this CAM) is the *specific application* of viral referral mechanics to the **CAM access portal** — the CNDA+-gated, IP-protected content delivery system. Key differences:

- **Gate requirement**: CAM portal requires CNDA+ acceptance, e-signature, and identity verification before any content is visible. NexFIT sharing is lighter-weight.
- **Content sensitivity**: CAM content is competitive intelligence — referral depth limits and identity verification are more restrictive.
- **Referral context**: Referrals happen *inside* the content view (after full gate passage), not from a landing page.
- **Attribution chain**: Designed for tracking how IP-protected competitive intelligence propagates through professional networks, not general document views.

Both systems share the `DocumentShareToken` schema and `parentTokenId` chain mechanism, but serve distinct content types with different security postures.

---

## VII. Competitive Advantage

### Why This Compounds

1. **Zero-cost distribution of IP**: Every satisfied viewer becomes a distribution channel. No ad spend, no sales outreach — the content sells itself through trusted professional referrals.

2. **Attribution creates intelligence**: The referral chain reveals *how* competitive intelligence moves through professional networks. Which industries share most? Which CAMs generate the most referrals? Which referral depth converts best? This is market intelligence generated passively.

3. **Trust propagation**: A referral from a colleague who has already signed the CNDA+ and read the content carries implicit endorsement. The CNDA+ gate means only serious professionals refer — spam is structurally impossible.

4. **Network density compounds**: Each referral adds a node to the professional network. Over time, the referral graph becomes a map of the construction industry's professional relationships — an asset that appreciates with every share.

### CAM Score Justification

- **Uniqueness (8/10)**: Embedded viral referral mechanics inside IP-protected content delivery is extremely rare in B2B SaaS. No construction software has this. Deducted 2 points because referral systems exist generally — the uniqueness is in the *application* to gated competitive intelligence.
- **Value (9/10)**: Converts every content viewer into a potential distribution channel. Solves the fundamental problem of IP distribution — how to share competitive intelligence broadly while maintaining tracking and control.
- **Demonstrable (8/10)**: The referral flow can be demonstrated end-to-end in 60 seconds — click button, enter name/email, receive email, click link, see CNDA+ gate. Chain visible in admin dashboard.
- **Defensible (8/10)**: The referral mechanism is technically reproducible. The defensibility is in the *network* — the accumulated referral graph, the CNDA+ signer base, and the content library that makes referral worthwhile. A competitor can build the plumbing; they can't replicate the professional network or the 48 CAMs that make the referral worth making.

---

## VIII. Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — embedded referral mechanics in CAM access portal, token chain with depth limiting, branded emails, duplicate prevention |
