---
cam_id: OPS-VIS-0001
title: "Intelligent Feature Discovery — Admin-Targeted Launch Awareness"
mode: OPS
category: VIS
revision: "1.0"
status: draft
created: 2026-03-07
updated: 2026-03-07
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
tags: [cam, operations, visibility, feature-discovery, onboarding, admin, adoption, product-led-growth]
---

# OPS-VIS-0001: Intelligent Feature Discovery — Admin-Targeted Launch Awareness

> *Every new feature finds the people who can buy it.*

## Work ↔ Signal
> **The Work**: Auto-redirects tenant admins to a 'What's New' page on login (max 3 times). Per-user tracking, role-scoped targeting, direct billing page links.
> **The Signal**: Feature engagement telemetry reveals which capabilities drive the most interest — the marketplace learns what to build next from actual admin behavior. (→ Demand: feature interest signals)

## Elevator Pitch

When NCC ships a new module or major capability, the platform automatically identifies tenant admins who haven't seen it yet and redirects them to a "What's New" page for their next 3 logins. The page highlights unseen features with glowing cards, links directly to the billing page to enable them, and tracks acknowledgment per user. Once the admin clicks "Got it" or has been redirected 3 times, the nudge stops. This closes the critical gap between "feature shipped" and "admin knows it exists" — the #1 blocker to module adoption in a modular SaaS product.

## The Problem

Modular SaaS platforms have a silent killer: **feature invisibility**.

- **Admins don't check changelogs**: Construction company admins log in to do work, not browse product updates. A new $39/mo module can sit in the catalog for months before anyone notices.
- **No targeted awareness**: Email blasts are generic. Push notifications are noisy. Neither targets the person who has purchasing authority (the admin) at the moment they're most engaged (login).
- **Zero feedback loop**: Without per-user tracking, the vendor has no idea whether the admin has even seen the new feature, let alone considered it. There's no signal to differentiate "not interested" from "not aware."
- **Revenue left on the table**: Every day an admin doesn't know about a feature is a day of lost subscription revenue. For a $39/mo module across 200 tenants, that's $7,800/mo in potential MRR that's invisible.

## The NCC Advantage

NCC solves this with a production-ready feature announcement pipeline:

1. **Per-User Tracking**: `FeatureAnnouncement` records link to modules/CAMs. `UserFeatureView` tracks each admin's first-seen, redirect count, and acknowledgment timestamp. The system knows exactly who has seen what.

2. **Smart Redirect on Login**: After authentication, the API checks for unseen announcements. If the user is Admin+ and has unseen features with `redirectCount < 3`, the login response includes `featureRedirect: true`. The web app redirects to `/whats-new` before the dashboard.

3. **Highlighted Discovery Page**: The `/whats-new` page renders recent announcements as cards. Unseen features get a glowing blue border + "NEW" badge. Already-seen features display normally. Each card links to the billing toggle or the downloads page.

4. **Graceful Decay**: After 3 redirects OR an explicit "Got it" click, the announcement is marked acknowledged. No more redirects. A subtle badge in the nav persists until all announcements are acknowledged, but it never interrupts the workflow again.

5. **CAM Content Integration**: Announcement cards pull their content from the CAM system — elevator pitch, use cases, pricing. No duplicate content maintenance. Ship a CAM, create an announcement row, and the discovery page auto-populates.

6. **Role-Scoped Targeting**: Only `OWNER`, `ADMIN`, and `SUPER_ADMIN` get redirects. Regular users see a subtle notification dot — informed but not disrupted.

**Key insight**: The discovery system turns every login into a product marketing touchpoint for the exact person who has budget authority, without disrupting their workflow after 3 touches.

## Expected Operational Impact

| Category | Impact | What It Represents |
|----------|--------|-------------------|
| **Feature awareness rate** | ~95% within 2 weeks | Admins who have seen the announcement (vs. ~15% from email alone) |
| **Time to first awareness** | < 3 days | Average time from launch to admin seeing the feature |
| **Module enable rate** | +30-50% lift | Expected increase in module adoption from direct billing page links |
| **Revenue acceleration** | 2-4 weeks faster | Time saved between "shipped" and "first paying tenant" |
| **Admin engagement** | Measurable | Per-announcement view/acknowledge/enable funnel metrics |

### Revenue Impact Example

A new module at $39/mo launched to 200 tenants:
- **Without discovery**: ~30 tenants notice within 3 months → $1,170/mo after 90 days
- **With discovery**: ~120 tenants aware within 2 weeks → $4,680/mo after 14 days
- **Delta**: $3,510/mo incremental MRR, 76 days faster to scale

## Competitive Landscape

| Competitor | Changelog Page? | Per-User Tracking? | Admin-Targeted Redirect? | Billing Integration? |
|---|---|---|---|---|
| Buildertrend | Blog only | No | No | No |
| Procore | Release notes | No | No | No |
| CoConstruct | Email newsletter | No | No | No |
| Xactimate | Version notes | No | No | No |
| JobNimbus | In-app banner | No | No | No |
| Monday.com | What's New widget | Partial | No | No |

**No competitor in construction SaaS** combines per-user tracking, role-targeted redirects, and direct billing integration in a feature discovery system. Monday.com comes closest with their "What's New" widget but it's not role-scoped or connected to purchasing.

## Technical Implementation

```
Schema:
  FeatureAnnouncement:
    id, moduleCode?, camId?, title, description, launchedAt,
    highlightUntil, targetRoles[], active

  UserFeatureView:
    id, userId, announcementId, firstSeenAt, acknowledgedAt,
    redirectCount, enabledModule (boolean)

Login Flow:
  1. POST /auth/login → success
  2. Server checks: SELECT announcements WHERE active=true
       AND launchedAt > now-90d
       AND no UserFeatureView with acknowledgedAt for this user
       AND redirectCount < 3
  3. If matches exist → response includes:
       { unseenFeatures: N, featureRedirect: true }
  4. Web app checks flag → redirect to /whats-new
  5. Page load calls GET /features/announcements
  6. Admin clicks "Got it" → POST /features/:id/acknowledge

Redirect Rules:
  - Roles: OWNER, ADMIN, SUPER_ADMIN only
  - Max 3 redirects per announcement batch
  - Stops if user acknowledges or redirectCount >= 3
  - Feature flag to disable globally if needed

Content Source:
  - FeatureAnnouncement.camId → pull elevator pitch from CAM
  - FeatureAnnouncement.moduleCode → link to billing toggle
  - Falls back to title + description if no CAM linked
```

## Use Cases

1. **NexBRIDGE launch**: We create a `FeatureAnnouncement` linked to `NEXBRIDGE`. Next time any tenant admin logs in, they're redirected to `/whats-new` where they see the NexBRIDGE card with pricing, features, and a download button. Three logins max, then it stops.

2. **NexPLAN add-on launch**: A second announcement for `NEXBRIDGE_NEXPLAN`. Only admins who haven't acknowledged it get redirected. Admins who already saw NexBRIDGE but not NexPLAN get targeted specifically.

3. **Measuring product-market fit**: After 2 weeks, we query `UserFeatureView` — 180 of 200 admins have seen NexPLAN, 45 acknowledged, 12 enabled the module. Clear funnel: 90% aware → 25% engaged → 6.7% converted. That's actionable data.

4. **Seasonal feature push**: Before hurricane season, we create an announcement for the Video Assessment module with a "Storm season is here" message. `highlightUntil` set to 60 days. Admins in relevant regions see it.

5. **Quiet acknowledgment**: An admin sees the feature, isn't interested, clicks "Got it." They're never bothered again. The system respects their decision while capturing the signal that they're aware.

## Scoring Rationale

- **Uniqueness (8/10)**: Per-user feature discovery with role-targeted login redirects connected to a billing system doesn't exist in construction SaaS. The closest analog is product-led growth tooling (Pendo, Appcues) but those are external SaaS add-ons, not native. Building it natively means zero additional vendor cost and deep integration with the module catalog.

- **Value (9/10)**: This is a revenue multiplier. Every other module CAM's revenue projection assumes admins know the feature exists. This system is what makes that assumption true. Without it, feature adoption depends on word-of-mouth and email open rates (~20%). With it, awareness reaches ~95% within 2 weeks.

- **Demonstrable (9/10)**: The demo is visceral — log in as an admin, get smoothly redirected to a beautiful "What's New" page, see a glowing card for NexBRIDGE, click "Enable" → redirected to billing → module toggles on → NexBRIDGE shows the feature within 60 seconds. The entire journey from "unaware" to "paying" in under 2 minutes.

- **Defensible (7/10)**: The concept (redirect admins to a what's-new page) is straightforward to replicate. The defensibility comes from integration depth: CAM content system, module catalog, Stripe billing, per-user tracking, and role-based targeting are all interconnected. A competitor would need to build (or buy) all of these independently and stitch them together.

**Total: 33/40** — Exceeds CAM threshold (24).

## Related CAMs

- `TECH-INTG-0001` — NexBRIDGE Modular Subscription (the primary beneficiary of discovery)
- `FIN-INTG-0001` — Living Membership Commerce (the billing system this feeds into)
- `EST-AUTO-0002` — NexPLAN AI-Assisted Selections (example of a feature that needs discovery)

## Expansion Opportunities

- **In-app tooltips**: After the admin enables a module, show contextual tooltips the first time they visit that module's page
- **Team notifications**: When an admin enables a new module, notify their team members: "Your admin just enabled Video Assessment — here's how to use it"
- **Usage nudges**: If an admin enables a module but nobody uses it after 14 days, trigger a "Getting Started" guide
- **A/B testing**: Test different announcement copy/images to optimize the awareness → enable conversion rate
- **Seasonal campaigns**: Time-boxed announcements tied to construction seasons (storm, winter, spring build)
- **Client-facing discovery**: Show clients (via Collaborator Technology) which modules their contractor uses — social proof that drives tenant adoption

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-07 | Initial draft — intelligent feature discovery system |
