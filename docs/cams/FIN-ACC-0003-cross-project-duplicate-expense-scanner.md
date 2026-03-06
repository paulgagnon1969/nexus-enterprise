---
cam_id: "FIN-ACC-0003"
title: "Cross-Project Duplicate Expense Scanner with Side-by-Side Comparison"
mode: FIN
category: ACC
revision: "1.0"
tags: [cam, fin, acc, duplicate-detection, expense-management, fraud-prevention, receipt-verification]
status: validated
created: 2026-03-06
updated: 2026-03-06
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# FIN-ACC-0003 — Cross-Project Duplicate Expense Scanner

## Elevator Pitch

One-click scan detects when the same receipt or expense is posted to more than one project — then lets you compare the bills side-by-side with full receipt images, OCR data, and line items. Catches double-billing that manual review misses.

## Problem Statement

In multi-project restoration and construction firms, the same receipt frequently appears on more than one job. Common causes:

- A field crew member submits a Home Depot receipt to Project A, while the office assigns the same bank transaction to Project B.
- An OCR-captured receipt creates a tentative bill on one project, and a manual CSV import creates another on a different project.
- A purchaser buys materials for two jobs in one trip and the full receipt gets attached to both.

Without cross-project duplicate detection, these double-posts inflate job costs, distort profitability reporting, and in worst cases constitute accidental (or intentional) fraud. Traditional accounting software only catches duplicates within a single job — never across the portfolio.

## Solution

### Dual-Strategy Scanner

The scanner uses two detection strategies against all active bills company-wide:

**Strategy 1 — Exact Match (100% confidence)**
Bills that share the same `sourceTransactionId` on different projects. This means the identical bank or imported transaction was used to create bills on multiple jobs.

**Strategy 2 — Fuzzy Match (scored confidence)**
Bills on different projects that match on:
- **Vendor**: Alias-aware normalization (e.g., "HD", "Home Depot", "The Home Depot Pro" all match). Store numbers stripped.
- **Amount**: Within ±1% of bill amount (absolute floor $0.50) — handles rounding, tax variations.
- **Date**: Within ±3 calendar days — handles posting delays, clearing dates.

Confidence scoring:
- Amount precision: <0.1% variance → +30%, <0.5% → +20%, <1% → +10%
- Date proximity: same day → +15%, 1 day → +10%, 2-3 days → +5%
- Base: 50%, cap: 98%

### Side-by-Side Comparison Viewer

Clicking "Compare Side-by-Side" on any duplicate group opens a full-screen modal with columns for each bill showing:
- **Bill metadata**: vendor, amount, date, status, role, billable flag, creator, memo
- **Line items**: kind, description, amount
- **Receipt attachments**: inline image preview for receipt photos (click to full-size)
- **OCR extracted data**: vendor name, store number, address, subtotal/tax/total, payment method, individual receipt line items with quantities and prices, confidence score

This lets accounting staff instantly determine whether two bills represent the same purchase or legitimately separate expenses.

## Competitive Advantage Scoring

- **Uniqueness: 7/10** — No major construction PM platform offers cross-project duplicate receipt scanning with fuzzy vendor matching. Most duplicate detection is within a single job or requires manual search.
- **Value: 8/10** — Directly prevents double-billing across jobs. A single caught duplicate on a $500 receipt pays for the feature. For firms running 20+ concurrent projects, the savings compound quickly.
- **Demonstrable: 9/10** — One click on "🔍 Duplicate Expenses" → immediate scan results → "Compare Side-by-Side" button → full receipt comparison. Takes 5 seconds to demo.
- **Defensible: 7/10** — The combination of exact transaction ID matching, vendor alias groups with store-number stripping, percentage-based amount tolerance, and integrated OCR data comparison creates a non-trivial detection pipeline.

**Total: 31/40**

## NexOP Impact

- **Category**: Financial Accuracy — Expense Integrity
- **Estimated NexOP contribution**: ~0.45%
- **Basis**: Prevents revenue leakage from double-posted expenses. For a firm with $3M annual material spend across 25 projects, even 0.5% duplicate rate = $15K/year in caught double-billing. The scanner also serves as a fraud deterrent.

## Technical Architecture

### Backend

- `DuplicateBillDetectorService.scanCrossProjectDuplicates()` — Queries all active bills (TENTATIVE, DRAFT, POSTED) within a configurable lookback window (default 90 days). Runs exact + fuzzy strategies and returns deduplicated groups sorted by confidence.
- `DuplicateBillDetectorService.compareBills()` — Fetches full bill details (line items, attachments, OCR results, project context) for a set of bill IDs across projects.
- `GET /banking/duplicate-expenses` — Triggers the cross-project scan.
- `GET /banking/duplicate-expenses/compare?billIds=id1,id2` — Returns full bill details for side-by-side comparison.

### Frontend

- "🔍 Duplicate Expenses" button in the Banking Transactions filter bar.
- Results panel with EXACT/FUZZY badges, confidence scores, and bill summaries.
- "Compare Side-by-Side" button on each duplicate group → full-screen modal with grid columns per bill.

### Vendor Normalization

Reuses the existing vendor alias map (11 alias groups covering major construction suppliers: Home Depot, Lowe's, Menards, Ace, Sherwin-Williams, 84 Lumber, Harbor Freight, ABC Supply, Beacon Roofing, Ferguson, Fastenal). Store numbers and whitespace are stripped before comparison.

## Dependencies

- `ProjectBill` model with `sourceTransactionId`, `vendorName`, `totalAmount`, `billDate`
- `ReceiptOcrResult` for OCR data in comparison viewer
- `ProjectBillAttachment` for receipt image display
- Existing vendor alias normalization from `DuplicateBillDetectorService`

## Future Extensions

- **Auto-flag on assignment**: Run duplicate check at bill creation time (not just on-demand scan) and auto-flag with DUPLICATE disposition.
- **Batch resolution**: Allow accounting to mark a duplicate group as "resolved" or "legitimate" to suppress future scans.
- **Receipt image similarity**: Use perceptual hashing to detect when the same physical receipt image is uploaded to different projects (even with different file names).
- **Dashboard widget**: Show duplicate count on the financial dashboard for proactive monitoring.

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial release — dual-strategy scanner + side-by-side comparison viewer |
