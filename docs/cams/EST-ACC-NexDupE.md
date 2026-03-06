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
  total: 32
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# NexDupE — Cross-Project Duplicate Expense Detection & Disposition

## Executive Summary

NexDupE is an automated cross-project duplicate expense detection system that identifies when the same purchase appears on multiple projects. It provides a side-by-side comparison workflow, permanent visual snapshots of findings, and a GAAP-compliant archival mechanism (SibE — Sibling Expense) that preserves audit trail integrity while preventing double-billing.

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

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial release — full NexDupE system with disposition, SibE, snapshots |
