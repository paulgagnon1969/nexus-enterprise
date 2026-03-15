---
cam_id: CMP-CMP-0001
title: "CNDA+ Gated Access System"
mode: CMP
category: CMP
revision: "1.0"
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
scores:
  uniqueness: 8
  value: 9
  demonstrable: 9
  defensible: 8
  total: 85
website: true
visibility:
  public: true
  internal: true
  roles: [all]
tags: [cam, cnda, gated-access, ip-protection, e-signature, identity-verification, compliance, token-gated, security, cam-access]
---

# CMP-CMP-0001: CNDA+ Gated Access System

> *Your IP, their identity, mutual accountability — enforced by code, not by trust.*

## Work ↔ Signal
> **The Work**: A multi-gate compliance pipeline that protects NCC's competitive intelligence — requiring CNDA+ acceptance, e-signature, and cryptographic identity verification before any CAM content is visible. Token-based session management with forensic logging, landing page persistence, and authenticated user re-entry.
> **The Signal**: A zero-compromise IP protection system that transforms competitive intelligence distribution from a legal risk into a controlled, auditable, and scalable channel. Every gate passage is a compliance event. Every failed attempt is a forensic record. Every successful viewer is a verified, accountable professional. (→ IP compliance, identity assurance, legal defensibility, controlled distribution)

---

## I. The Problem

Distributing competitive intelligence — the CAM library that documents every defensible feature of the platform — is inherently risky:

- **Uncontrolled sharing**: Emailing PDFs or sharing links without identity verification means anyone can access, copy, or redistribute proprietary content. No legal recourse without proof of identity and agreement.
- **No compliance trail**: When competitive intelligence is shared informally, there's no record of who agreed to what terms. If a competitor obtains the content, the legal position is indefensible.
- **Binary access models fail**: Full NCC accounts are too heavy for prospect evaluation. Public URLs are too open. The industry needs a middle ground — controlled access with progressive identity verification.
- **URL-based attacks**: If a malicious actor obtains a CAM portal URL and forwards it to an unauthorized person, there's no second layer of defense. The URL alone shouldn't grant access.
- **No return path**: Viewers who sign a CNDA+ have no clean way to return to the content later. Bookmarked URLs expire in sessions, and there's no "come back" mechanism.

No construction SaaS platform has a multi-gate compliance pipeline for IP-protected content delivery with identity verification, forensic logging, and authenticated re-entry.

---

## II. The Multi-Gate Pipeline

### Gate Architecture

Access to CAM content requires passing three sequential gates. Each gate must be completed before the next is presented. No gate can be bypassed, even with a valid token.

```
Token URL → Gate 1: CNDA+ Acceptance → Gate 2: E-Signature → Gate 3: Identity Verification → Content
```

### Gate 1: CNDA+ Acceptance

The viewer sees the full Corporate Non-Disclosure Agreement Plus text. They must:
- Read the complete agreement (scroll-to-bottom detection optional, explicit "I Accept" required)
- Click "Accept" to acknowledge the terms

The `cndaAccepted` flag and `cndaAcceptedAt` timestamp are recorded on the `DocumentShareToken`. This is a permanent, immutable record.

### Gate 2: E-Signature

After acceptance, the viewer signs electronically:
- Full legal name input
- Signature capture (typed or drawn, depending on implementation)
- `cndaSigned` flag and `cndaSignedAt` timestamp recorded
- Signer name stored on the token for audit

The signature binds the named individual to the CNDA+ terms — creating personal legal accountability, not just a checkbox.

### Gate 3: Identity Verification

The final gate ensures the person viewing content is the person who was invited:
- The viewer enters their email address
- The system compares it (case-insensitive) against the `inviteeEmail` on the token
- **Match**: Access granted. Email stored in `sessionStorage` for the session.
- **Mismatch**: Access denied. The system logs a forensic record: timestamp, entered email, token ID, IP address.

This gate prevents URL forwarding attacks. Even if someone copies the URL and sends it to an unauthorized person, they can't pass identity verification without knowing the original invitee's email.

### Masked Email in Gate Status

When querying gate status (e.g., to show progress indicators), the API returns a masked version of the invitee email: `p***@example.com`. This prevents the gate status endpoint from leaking the full email to the frontend before verification is complete.

---

## III. Token-Based Session Management

### Token Lifecycle

Each `DocumentShareToken` has a complete lifecycle:

1. **Created**: Admin or referrer creates the token via the invite flow
2. **Sent**: Branded email delivered to the invitee
3. **First viewed**: `firstViewedAt` timestamp set on first URL access
4. **Gates passed**: `cndaAccepted` → `cndaSigned` → identity verified
5. **Content accessed**: Viewer browses CAM library
6. **Return visits**: Token persisted in `localStorage` enables seamless re-entry

### localStorage Persistence

The token is saved to `localStorage` from two sources:
1. **CAM access page**: When the viewer first accesses `/cam-access/[token]`, the token is saved
2. **Authenticated users**: When a logged-in NCC user has a signed CNDA+, their `camAccessToken` is returned in the `/users/me` response and saved to `localStorage`

This enables the landing page (`/cam-access`) to detect returning viewers and auto-redirect them to their content.

### Session Email Verification

On return visits, the viewer must re-verify their email (stored in `sessionStorage`, cleared on browser close). This ensures that even if someone accesses a shared computer, they can't view the previous user's CAM content without knowing the email.

---

## IV. Landing Page & Recovery

### Landing Page (`/cam-access`)

The landing page serves two purposes:

1. **Auto-redirect for returning viewers**: If a `camAccessToken` exists in `localStorage`, the page automatically redirects to `/cam-access/[token]` — zero-click re-entry.

2. **Access recovery**: If the viewer lost their link, they can enter their email. The system looks up their token and re-sends the invite email. This is enumeration-safe — the same success message is shown regardless of whether the email exists in the system.

### CAM Revisit Banner (Authenticated Users)

For NCC users who have signed a CNDA+, a prominent banner appears in the application shell (between the header and main content):

- Dark gradient background with CAM branding
- "Revisit CAM Library & Training" text with a direct link
- Session-dismissible (disappears for the rest of the session after clicking ×)
- Only appears for users with a valid `camAccessToken` from the `/users/me` response

This ensures that authenticated users who have earned CAM access can always find their way back.

---

## V. Forensic Logging & Security

### Failed Verification Logging

Every failed identity verification attempt is logged with:
- Timestamp
- Token ID
- Email address entered
- Expected email (masked in logs)
- Request metadata (IP, user-agent)

This creates a forensic trail for detecting unauthorized access attempts. Multiple failures on the same token trigger admin alerts (planned enhancement).

### Security Posture

| Threat | Mitigation |
|--------|------------|
| URL forwarding to unauthorized person | Identity verification gate (email must match invitee) |
| Brute-force email guessing | Rate limiting on verification endpoint, forensic logging |
| Session hijacking | `sessionStorage` email verification (cleared on browser close) |
| Token enumeration | Tokens are 48-character hex strings (cryptographically random) |
| CNDA+ bypass | Server-side gate enforcement — content endpoint checks all gates before serving |
| Content scraping | All content is rendered server-side and served via API, not static files |

---

## VI. Technical Implementation

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /cam-access/:token/status` | Gate status check — returns which gates are passed, masked email |
| `POST /cam-access/:token/accept` | Accept CNDA+ terms |
| `POST /cam-access/:token/sign` | Sign CNDA+ (e-signature) |
| `GET /cam-access/:token/content?email=` | Get CAM content (requires email matching invitee) |
| `POST /cam-access/recover` | Recover access link by email |

### Key Service Methods

| Method | Location | Purpose |
|--------|----------|---------|
| `getGateStatus()` | `cam-access.service.ts` | Returns gate progress + masked email |
| `acceptCnda()` | `cam-access.service.ts` | Records CNDA+ acceptance |
| `signCnda()` | `cam-access.service.ts` | Records e-signature |
| `getContent()` | `cam-access.service.ts` | Validates identity + returns CAM content |
| `recoverLink()` | `cam-access.service.ts` | Enumeration-safe token recovery |

### Schema Fields on DocumentShareToken

| Field | Type | Purpose |
|-------|------|---------|
| `cndaAccepted` | Boolean | CNDA+ terms accepted |
| `cndaAcceptedAt` | DateTime | When terms were accepted |
| `cndaSigned` | Boolean | E-signature completed |
| `cndaSignedAt` | DateTime | When signature was captured |
| `cndaSignerName` | String | Legal name of the signer |
| `inviteeEmail` | String | Expected email for identity verification |
| `firstViewedAt` | DateTime | First URL access |
| `lastViewedAt` | DateTime | Most recent access |
| `viewCount` | Int | Total view count |

### Files Created / Modified

| Component | Path |
|-----------|------|
| CAM Access Service | `apps/api/src/modules/cam-access/cam-access.service.ts` |
| CAM Access Controller | `apps/api/src/modules/cam-access/cam-access.controller.ts` |
| CAM Access Module | `apps/api/src/modules/cam-access/cam-access.module.ts` |
| CAM Access Portal | `apps/web/app/cam-access/[token]/page.tsx` |
| CAM Access Landing Page | `apps/web/app/cam-access/page.tsx` |
| App Shell (revisit banner) | `apps/web/app/ui-shell.tsx` |
| User Service (camAccessToken) | `apps/api/src/modules/user/user.service.ts` |
| This CAM | `docs/cams/CMP-CMP-0001-cnda-gated-access-system.md` |

---

## VII. Competitive Advantage

### Why This Compounds

1. **Legal defensibility scales with the network**: Every CNDA+ signature is a legally binding agreement. As the viewer network grows, the legal protection grows with it. If IP leaks, the audit trail identifies exactly who signed, when, and what chain they were part of.

2. **Identity verification prevents the weakest link**: The most common IP leak vector — "I forwarded the link to my colleague" — is structurally blocked. The URL alone is worthless without knowledge of the invitee's email. This is defense in depth that doesn't rely on user behavior.

3. **Authenticated re-entry creates stickiness**: The CAM revisit banner and landing page auto-redirect mean that once someone passes the gates, the content is always one click away. This transforms a one-time compliance event into an ongoing relationship with the IP library.

4. **Forensic logging is a deterrent**: The knowledge that every access attempt is logged — including failed ones — creates a chilling effect on casual IP redistribution. Professional accountability replaces honor-system trust.

5. **Progressive gates respect the viewer's time**: Accept → Sign → Verify takes under 60 seconds. Each gate is contextual and non-repetitive. The viewer understands why each step exists and doesn't feel friction — they feel professionalism.

### CAM Score Justification

- **Uniqueness (8/10)**: Multi-gate compliance pipelines exist in legal tech and healthcare, but not in construction SaaS. The combination of CNDA+ acceptance, e-signature, and email-based identity verification for IP-protected content is novel in this vertical. Deducted 2 points because gated content access is a known pattern — the uniqueness is in the application and the forensic depth.
- **Value (9/10)**: Solves the fundamental tension between "share IP broadly" and "protect IP legally." Without this system, competitive intelligence distribution is either too restrictive (killing reach) or too permissive (killing protection). This is the middle ground that enables both.
- **Demonstrable (9/10)**: The full gate flow can be demonstrated in under 90 seconds — receive email, click link, see CNDA+ text, accept, sign, enter email, view content. The forensic logging can be shown by entering a wrong email and watching the rejection. Highly visual, highly interactive.
- **Defensible (8/10)**: The gate mechanics are technically reproducible. The defensibility is in the *content behind the gates* — the 48+ CAM documents, the handbook pipeline, and the professional network of CNDA+ signers. A competitor can build gates; they can't populate the library that makes passing the gates worthwhile.

---

## VIII. Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — multi-gate CNDA+ pipeline, identity verification, forensic logging, landing page with auto-redirect, authenticated user re-entry banner |
