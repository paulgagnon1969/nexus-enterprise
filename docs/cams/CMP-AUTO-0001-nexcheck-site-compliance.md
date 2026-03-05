---
cam_id: CMP-AUTO-0001
module_code: COMPLIANCE
title: "NexCheck — Tap In. Sign Off. Stay Compliant."
mode: CMP
category: AUTO
revision: "1.0"
status: draft
created: 2026-03-02
updated: 2026-03-02
author: Warp
website: false
scores:
  uniqueness: 9
  value: 9
  demonstrable: 9
  defensible: 7
  total: 34
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
tags: [cam, compliance, automation, kiosk, nfc, check-in, jsa, safety, roster, signature, geofencing, nexcheck]
---

# CMP-AUTO-0001: NexCheck

> *Tap in. Sign off. Stay compliant.*

## Elevator Pitch
Every job site needs a sign-in sheet, a JSA acknowledgment, and an audit trail — and every GC still does it on paper. NexCheck turns any phone or tablet into an NFC-powered compliance kiosk that identifies workers with a tap, walks them through required safety documents, captures a legal finger signature, and builds a real-time digital roster. Combined with Nexus's existing geo-fence time tracking, NexCheck delivers a complete accountability chain: who's on site, what they acknowledged, when they arrived and left, and a signed record proving it.

## Problem
Construction and restoration job sites face daily compliance friction:
- **Paper sign-in sheets** get lost, damaged, or never completed — and there's no real-time visibility into who's on site
- **JSA and safety documents** are printed, passed around, and filed in binders that nobody audits
- **No proof of acknowledgment** — when OSHA asks "did every worker on site read the hazard communication?", the answer is a shrug or a stack of illegible signatures
- **Sign-out is forgotten** — workers leave without signing out, creating gaps in the daily roster
- **PM bottleneck** — only the PM can manage compliance paperwork, but they aren't always on site
- **Subcontractors and visitors** fall through the cracks entirely — no system captures their presence or acknowledgments

## How It Works
1. **Site Pass** — Each worker gets a unique cryptographic token stored on their phone. Nexus users get one automatically; visitors register once at the kiosk.
2. **NFC Tap-In** — Worker taps their phone on the kiosk device. NexCheck identifies them instantly: *"Paul Gagnon — Keystone Restoration — PM. Is this you?"*
3. **Document Queue** — The kiosk presents only the documents that worker needs to acknowledge *today*: daily JSA, first-visit onboarding docs, or updated safety policies. One-time docs don't repeat; daily docs refresh each morning.
4. **Finger Signature** — After acknowledging all documents, the worker signs once with their finger. That single signature is timestamped and applied to every document in the session.
5. **Three-Tier Sign-Out** — Manual sign-out at the kiosk (compliant), automatic sign-out via geo-fence departure (flagged), or end-of-day system cutoff (anomaly). Every scenario is captured.
6. **Kiosk Delegation** — PM isn't on site? They remotely delegate kiosk activation to a foreman for 24 hours (up to 7 days). Any phone becomes a kiosk in seconds.
7. **Live Roster** — PMs see a real-time composite roster merging check-in records with geo-fence presence data, complete with sign-out status indicators and downloadable PDF reports.

## Competitive Differentiation
- **No competitor unifies NFC identification + document queue + signature capture + geo-fence tracking** in a single mobile-first workflow. Procore, Buildertrend, and CoConstruct have basic time tracking but no compliance kiosk.
- **Kiosk Delegation is unique** — no platform allows remote, time-boxed delegation of compliance station activation to field crew. This eliminates the PM-as-bottleneck problem.
- **Document frequency engine** (ONCE / DAILY / ON_CHANGE) is smarter than static checklists — workers only see what's relevant, reducing friction and increasing actual compliance rates.
- **Three-tier sign-out** with geo-fence integration creates a defensible audit trail regardless of worker behavior. Paper sign-in sheets can't do this.
- **Zero hardware cost** — any phone or tablet becomes a kiosk. No dedicated terminals, no scanners, no badge printers.
- **Visitor/sub coverage** — external workers without the app can still register manually and get a site pass. The roster captures everyone, not just employees.

## Demo Script
1. Open the Nexus mobile app → Settings → "Enable Kiosk Mode" → select a project. *"Any device becomes a compliance kiosk."*
2. Hand the kiosk to someone in the room. Tap your phone on it. Show the identification screen: *"Is this you?"* Confirm.
3. Swipe through a JSA document on the kiosk. Tap "I acknowledge." *"Workers read it. They don't just sign a blank sheet."*
4. Show the signature pad. Sign with your finger. *"One signature, every document. Legally defensible."*
5. Kiosk resets. *"Next worker steps up. 15 seconds per person."*
6. Switch to the web app → project roster. Show the real-time check-in list with green/yellow/red sign-out indicators. *"You know exactly who's on site, what they signed, and whether they left properly."*
7. Show Kiosk Delegation: *"PM is offsite — delegate kiosk access to the foreman for 24 hours. One tap."*
8. Pull up the end-of-day PDF: names, times, documents acknowledged, embedded signatures. *"This is what you hand OSHA when they ask."*

## Metrics / Value Indicators
- **Compliance rate** — percentage of workers who completed all required documents before starting work (target: 95%+)
- **Check-in time** — average seconds per worker through the full NexCheck flow (target: <20 seconds for returning workers)
- **Sign-out compliance** — percentage of manual vs. auto vs. EOD sign-outs (lower auto/EOD = better worker compliance)
- **Document coverage** — percentage of on-site workers with complete acknowledgment records vs. total geo-fence-detected workers
- **Audit readiness** — time to produce a complete site roster with signatures for any given day (target: <5 seconds)

## Technical Implementation
- **Schema**: `SitePass`, `SiteCheckIn`, `SiteDocument`, `SiteDocumentAck`, `KioskSession`, `KioskDelegation` models in Prisma
- **API**: NestJS module with site-pass CRUD, kiosk activation, document queue resolution, check-in/sign-out flow, roster aggregation
- **Mobile**: Kiosk mode toggle with dual-session architecture (owner session + kiosk session), NFC HCE (Android) + QR fallback (iOS), signature capture via SVG paths
- **Geo-fence integration**: Extended `handleGeofenceExit` triggers auto sign-out on open check-in sessions after grace period
- **Signature storage**: SVG path data (~1-5KB), rendered to high-res PNG on demand for PDF/print
- **Document queue engine**: Frequency-based resolution (ONCE/DAILY/ON_CHANGE) with per-worker acknowledgment tracking

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-02 | Initial draft — NexCheck concept, architecture, demo script |
