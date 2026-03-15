---
cam_id: EST-ACC-0001
title: "NexDupE — Cross-Project Duplicate Expense Detection & Disposition"
mode: EST
category: ACC
revision: "1.0"
tags: [cam, estimating, accuracy, duplicate-detection, expense-management, nexdupe]
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
scores:
  uniqueness: 8
  value: 8
  demonstrable: 9
  defensible: 7
  total: 80
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# NexDupE — Cross-Project Duplicate Expense Detection & Disposition

## Executive Summary

NexDupE is an automated cross-project duplicate expense detection system that identifies when the same purchase appears on multiple projects. It provides a side-by-side comparison workflow, permanent visual snapshots of findings, and a GAAP-compliant archival mechanism (SibE — Sibling Expense) that preserves audit trail integrity while preventing double-billing.

## Work ↔ Signal
> **The Work**: Automated cross-project scanner detects when the same receipt is posted to multiple projects. Side-by-side comparison with permanent PNG snapshots and GAAP-compliant SibE archival.
> **The Signal**: Duplicate detection across the entire portfolio proves billing integrity at scale — every disposition is documented with frozen evidence. (→ Reputation: billing accuracy)

## Problem Statement

In multi-project restoration and construction operations, the same receipt or credit card transaction can accidentally be assigned to more than one project. This happens frequently when:

- HD Pro Xtra receipts with generic job names match multiple projects
- OCR-captured receipts from email are auto-assigned to a project that already has a CC transaction for the same purchase
- Manual data entry errors during high-volume periods

Without automated detection, these duplicate expenses inflate project costs, distort P&L reporting, and can lead to overbilling clients.

## How It Works

### Detection (Automatic)

1. **Exact match**: Same `sourceTransactionId` posted to bills on different projects → 100% confidence
2. **Fuzzy match**: Same vendor (alias-aware), similar amount (±1%), close date (±3 days), different projects → scored confidence

### Disposition (Human-in-the-loop)

When a potential duplicate is flagged, the user opens a side-by-side comparison modal showing full bill details, line items, attachments, and OCR data. Four disposition options:

- **Not Duplicate** — Different purchases, both stay active
- **Confirmed Duplicate (DupE)** — One bill stays PRIMARY, the other becomes SibE
- **Same Vendor, Different Purchase** — Distinct purchases from the same merchant
- **Intentional Split Across Projects** — Deliberate cost allocation

### Archival (Permanent)

On disposition:
1. A PNG screenshot of the comparison modal is captured and stored in MinIO
2. The full bill comparison data is frozen as JSON (survives bill deletion)
3. For confirmed duplicates, the losing bill is converted to **SibE** (Sibling Expense):
   - Greyed out in project expense lists
   - DUPLICATE_OFFSET line item nets to $0 (GAAP-compliant)
   - Does NOT count toward project totals
   - Permanently attached to the project for audit trail

### Re-scan Protection

Dispositioned groups are permanently excluded from future scans. However, SibE bills remain in the matching pool — if an old receipt resurfaces through a different import path, it will be flagged against the active PRIMARY expense, preventing the same purchase from sneaking back in.

## Competitive Differentiation

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| Uniqueness | 8/10 | No major contractor software does cross-project duplicate detection with visual evidence archival |
| Value | 8/10 | Prevents double-billing, protects margins, reduces accounting reconciliation time |
| Demonstrable | 9/10 | Side-by-side comparison with snapshot is highly visual — easy to demo |
| Defensible | 7/10 | Multi-signal detection (exact + fuzzy + vendor alias + historical patterns) + GAAP-compliant offset + permanent snapshot = non-trivial to replicate |
| **Total** | **32/40** | Exceeds CAM threshold (24) |

## Technical Components

- `DuplicateExpenseDisposition` — Prisma model storing decisions, notes, frozen data, snapshot URIs
- `DupEDecision` enum — NOT_DUPLICATE, CONFIRMED_DUPLICATE, SAME_VENDOR_DIFFERENT_PURCHASE, INTENTIONAL_SPLIT
- `BillRole.SIBE` — New bill role for archived duplicate expenses
- `DuplicateBillDetectorService.createDisposition()` — Handles snapshot upload, SibE conversion, and data freezing
- `scanCrossProjectDuplicates()` — Modified to exclude dispositioned groups and include SibE bills in matching pool
- Frontend: Disposition form in comparison modal, archive viewer with snapshot display

## Related Modules

- **NexVERIFY** — Within-project duplicate detection (same project, different sources)
- **Prescreening** — Auto-assignment of imported transactions to projects
- **Purchase Reconciliation** — CC-to-receipt matching

## NexOP Impact
- **Category**: Estimating Accuracy — Expense Integrity
- **Estimated NexOP contribution**: ~0.35%
- **Basis**: Cross-project duplicate expenses are more common than within-project duplicates because they span different accounting silos. For a $10M firm with $900K/year in material spend across 60 projects, a 0.5% duplicate rate = ~$4.5K/year in direct savings. The SibE archival mechanism also prevents historical duplicates from re-emerging through later imports.

## Demo Script
1. Open the Financial module → click **🔍 Duplicate Expenses**.
2. Scanner runs across all projects → results appear with EXACT and FUZZY badges.
3. Click **Compare Side-by-Side** on a fuzzy match → full-screen modal shows both bills with receipt images.
4. Choose **Confirmed Duplicate** → one bill becomes SibE (greyed out, $0 net impact).
5. Show the PNG snapshot saved in the disposition archive.
6. Re-run the scanner → the dispositioned group no longer appears.
7. Key message: *"Caught, documented, and permanently resolved in 30 seconds."*

## Future Extensions
- **Real-time detection**: Flag duplicates at bill creation time, not just on-demand scan.
- **Receipt image hashing**: Detect when the same physical receipt photo is uploaded to different projects.
- **Monthly digest**: Automated email to accounting with duplicate summary and savings metrics.

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial release — full NexDupE system with disposition, SibE, snapshots |
