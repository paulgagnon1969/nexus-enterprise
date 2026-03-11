---
title: "NexDupE: Cross-Project Duplicate Expense Detection"
code: EST-007
chapter: 2
module: estimating-xactimate
revision: "1.0"
difficulty: 🔴 Advanced
roles: [PM, ACCOUNTING]
tags: [training, estimating, nexdupe, duplicates, cross-project, gaap, audit]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [pm, accounting, admin]
cam_references:
  - id: EST-ACC-0001
    title: "NexDupE: Cross-Project Duplicate Expense Detection"
    score: 32
---

# EST-007 — NexDupE: Cross-Project Duplicate Expense Detection

🔴 Advanced · 📋 PM · 💰 ACCOUNTING

> **Chapter 2: Estimating & Xactimate Import** · [← Field Qty Discrepancies](./EST-006-field-qty-discrepancies.md) · [Next Chapter: Receipt Capture →](./RCPT-001-receipt-capture.md)

---

## Purpose

The same receipt or credit card transaction can accidentally end up on multiple projects — especially with HD Pro Xtra receipts that have generic job names. NexDupE scans across all your projects simultaneously, finds the duplicates, and lets you disposition them with a GAAP-compliant archival that preserves the audit trail.

## Who Uses This

- **PMs** — run the scanner for their projects, disposition flagged duplicates
- **Accounting** — periodic company-wide scans, review archived dispositions

## Step-by-Step Procedure

1. Navigate to **Financial** (`/financial`) → click **🔍 Duplicate Expenses**.
2. The scanner runs across all projects in your company.
3. Results appear with badges:
   - **EXACT** — same `sourceTransactionId` on different projects (100% confidence)
   - **FUZZY** — same vendor (alias-aware), similar amount (±1%), close date (±3 days)
4. Click **Compare Side-by-Side** on any match.
5. The full-screen comparison modal shows both bills with:
   - All line items, amounts, and dates
   - Attached receipt images (if any)
   - OCR data (if applicable)
6. Choose a disposition:
   - **Not Duplicate** — different purchases, both stay active
   - **Confirmed Duplicate (DupE)** — one bill stays PRIMARY, the other becomes SibE
   - **Same Vendor, Different Purchase** — distinct purchases from the same merchant
   - **Intentional Split Across Projects** — deliberate cost allocation
7. On confirmation:
   - A **PNG screenshot** of the comparison is permanently saved
   - The bill comparison data is **frozen as JSON** (survives bill deletion)
   - For confirmed duplicates, the losing bill becomes **SibE** (Sibling Expense):
     - Greyed out in project expense lists
     - DUPLICATE_OFFSET line item nets to $0 (GAAP-compliant)
     - Does NOT count toward project totals
     - Permanently attached for audit trail

## Vendor Alias Map

NCC recognizes 11 merchant families (60+ aliases):
- Home Depot ↔ HD ↔ The Home Depot ↔ HD Pro ↔ HD Supply
- Lowe's ↔ Lowes ↔ Lowes Home Improvement
- Sherwin-Williams ↔ SW ↔ Sherwin Williams
- 84 Lumber ↔ Eighty Four Lumber
- (and 7 more families)

Store numbers are stripped before comparison — "Home Depot #0604" matches "HOME DEPOT #1832".

## Tips & Best Practices

- **Run the scanner monthly** — duplicates accumulate over time, especially with multiple credit cards.
- **Dispositioned groups are permanently excluded** from future scans, so the scanner gets faster over time.
- **SibE bills remain in the matching pool** — if an old receipt resurfaces through a different import, it will be flagged against the active PRIMARY expense.
- **The PNG snapshot is your evidence.** If an auditor questions a disposition, show them the frozen comparison screenshot.

## Powered By — CAM Reference

> **EST-ACC-0001 — NexDupE: Cross-Project Duplicate Expense Detection** (32/40 ⭐ Strong)
> *Why this matters:* No major contractor software does cross-project duplicate detection with visual evidence archival. Competitors check within a single project — NCC scans across your entire portfolio. The GAAP-compliant SibE mechanism zeros out the financial impact while keeping both records for the audit trail. The permanent PNG snapshot means the disposition evidence survives even if the original bills are later deleted. NexOP contribution: ~0.35% of revenue.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
