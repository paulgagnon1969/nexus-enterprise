---
cam_id: "CMP-INTG-0001"
title: "Live OSHA Construction Standards (29 CFR 1926) — Auto-Synced from eCFR"
mode: CMP
category: INTG
status: draft
created: 2026-02-21
updated: 2026-02-21
author: Warp
website: false
scores:
  uniqueness: 8
  value: 9
  demonstrable: 9
  defensible: 7
  total: 33
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# CMP-INTG-0001 — Live OSHA Construction Standards Auto-Sync

## Elevator Pitch
NEXUS is the only construction management platform that automatically imports and continuously synchronizes the complete OSHA Construction Safety Standards (29 CFR Part 1926) directly from the official U.S. Government Electronic Code of Federal Regulations. Every section, every subpart, always current — with zero manual data entry.

## What It Does
- **One-click import** of the entire 29 CFR 1926 (all subparts A through CC, hundreds of sections) from the eCFR public API
- **Automatic change detection** — compares eCFR amendment dates against the stored version to surface when OSHA has published updates
- **Content-hash deduplication** — only creates new document versions when section content actually changes, maintaining a clean audit trail
- **Structured manual** — each OSHA subpart becomes a navigable chapter, each section (§1926.XXX) is a versioned, searchable document
- **Full eDocs integration** — the OSHA manual supports Views, saved views, compact TOC, PDF export, and tenant publishing

## Why It Matters

### For Safety & Compliance
Construction companies are legally required to comply with OSHA regulations. Having the actual regulations — not summaries, not interpretations, but the official text — embedded directly in the project management platform eliminates the gap between "knowing the rules exist" and "having them at hand when you need them."

### For Project Managers
When a PM is planning fall protection for a roof job, they don't need to leave NCC to look up §1926.501. It's right there in the Safety & Compliance section, organized by subpart, always up to date.

### For Business Development
No competitor in the restoration/construction management space provides live-synced OSHA regulations as a built-in feature. This is a concrete, demonstrable differentiator in sales demos and RFP responses.

## Planned Enhancement: OSHA Links on PETL Line Items
The next phase will parse OSHA section references and link them directly to relevant PETL (SowItem) line items. When a line item involves work governed by a specific OSHA section (e.g., scaffolding → §1926.451, fall protection → §1926.501, electrical → §1926.405), the PETL row will display a clickable OSHA reference badge. This creates a direct, contextual bridge between estimating/scheduling and safety compliance — at the line-item level.

Example: A PETL line for "Install temporary guardrails — 2nd floor perimeter" would show a 🛡️ §1926.502 badge linking to the Fall Protection Systems section.

## Competitive Scoring

**Uniqueness: 8/10**
No major construction management competitor (Procore, Buildertrend, CoConstruct, Xactimate) auto-imports live OSHA regulations into their document system. Most link out to OSHA.gov or rely on third-party safety add-ons.

**Value: 9/10**
OSHA compliance is non-negotiable in construction. Having the actual regulations embedded in the platform — searchable, versionable, distributable to tenants — directly supports safety culture and reduces compliance risk.

**Demonstrable: 9/10**
Extremely easy to demo: click "Sync Now," watch 200+ sections import in under a minute, browse the full structured manual with subpart chapters, show the live eCFR sync status. The PETL link feature (when built) will be even more compelling.

**Defensible: 7/10**
The eCFR API is public, so the data source isn't proprietary. However, the XML parsing pipeline, content-hash versioning, structured manual assembly, and future PETL-level OSHA linking create meaningful technical depth. The integration into a full document management system with Views, publishing, and tenant distribution is non-trivial to replicate.

## Demo Script
1. Open System Documents → show the 🛡️ Safety & Compliance section
2. Click "OSHA eCFR Sync" → show the admin panel
3. Click "Check for Updates" → show the eCFR date comparison
4. Click "Sync Now" → watch the import complete (show section/subpart counts)
5. Click into the OSHA manual → browse subparts, expand a section (e.g., §1926.501 Fall Protection)
6. Show the manual in Reader Mode / Preview → professional, structured, printable
7. Mention: "This syncs automatically from the eCFR — when OSHA publishes an update, we detect it and pull it in"
8. (Future) Show a PETL line item with a 🛡️ OSHA badge linking to the relevant section

## Technical Summary
- **Data source**: eCFR public REST API (`ecfr.gov/api/versioner/v1/`)
- **Content**: Public domain (U.S. Government work — no licensing required)
- **Backend**: NestJS service with XML parser (`fast-xml-parser`), content hashing (SHA-256), Prisma transaction-based upsert
- **Storage**: OshaSyncState model + SystemDocument/Manual/ManualChapter models
- **Frontend**: Admin panel at `/system/osha-sync`, integrated card on eDocs dashboard
- **PETL integration** (planned): SowItem → OSHA section cross-reference based on category codes, activity types, and keyword matching

## Related
- SOP: `docs/sops-staging/osha-29cfr1926-import-sync-sop.md`
- eCFR source: https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1926
- Manual code: `osha-29cfr1926`
