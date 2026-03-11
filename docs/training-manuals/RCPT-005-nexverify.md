---
title: "NexVERIFY: Multi-Source Expense Convergence"
code: RCPT-005
chapter: 3
module: expense-capture
revision: "1.0"
difficulty: 🔴 Advanced
roles: [ACCOUNTING, PM]
tags: [training, expense, nexverify, convergence, verification, gaap, duplicate]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [accounting, pm, admin]
cam_references:
  - id: FIN-ACC-0001
    title: "NexVERIFY: Multi-Source Expense Convergence"
    score: 34
  - id: FIN-ACC-0002
    title: "Zero-Loss Receipt Capture"
    score: 36
---

# RCPT-005 — NexVERIFY: Multi-Source Expense Convergence

🔴 Advanced · 💰 ACCOUNTING · 📋 PM

> **Chapter 3: Expense Capture & Receipt Management** · [← Auto-Bill Creation](./RCPT-004-auto-bill-creation.md) · [Next: Cross-Project Duplicates →](./RCPT-006-cross-project-duplicates.md)

---

## Purpose

When the same purchase is captured from two sources — a crew member snaps the receipt AND the credit card charge appears in the bank feed — every other system either misses the duplicate (inflating costs 2×) or deletes one (losing the audit trail). NexVERIFY detects the convergence, keeps both records, and uses a GAAP-clean offset to zero out the financial impact while preserving the audit chain.

## Who Uses This

- **Accounting** — convergence detection runs automatically during transaction assignment
- **PMs** — see verification badges on expenses, can drill into the convergence details

## How NexVERIFY Detects Convergence

Every time a bill is about to be created, NexVERIFY checks against existing bills on that project:

| Signal | Tolerance | Required? |
|--------|-----------|-----------|
| Vendor match | Fuzzy alias groups (11 merchant families, 60+ aliases) | Yes |
| Amount match | ±1% (floor $0.50 for micro-purchases) | Yes |
| Date proximity | ±3 calendar days | Yes |
| Amount precision | < 0.1% variance → +0.30 confidence bonus | No (bonus) |
| Date precision | Same day → +0.15 confidence bonus | No (bonus) |

## What Happens on Detection

1. The incoming bill is assigned a role:
   - **PRIMARY** — the source of truth (richest data — line items, SKUs, dispositions)
   - **VERIFICATION** — the corroborating record (nets to $0 via offset)
2. The VERIFICATION bill gets a `DUPLICATE_OFFSET` line item that zeroes its total.
3. Both bills remain visible — the PRIMARY shows as normal, the VERIFICATION shows with a "Verified ✓" badge and greyed-out amount.
4. The audit chain is complete: two independent sources corroborate the same purchase.

## Step-by-Step: Reviewing a Convergence

1. Open a project → **Expenses** section.
2. Look for bills with a **"Verified ✓"** badge — these have a convergence pair.
3. Click the badge to see the linked record:
   - Which record is PRIMARY (usually the receipt — it has line items)
   - Which is VERIFICATION (usually the CC charge — it corroborates the amount)
   - The variance between the two amounts
   - Timestamps showing when each was captured

## Powered By — CAM Reference

> **FIN-ACC-0001 — NexVERIFY: Multi-Source Expense Convergence** (34/40 ⭐ Strong)
> *Why this matters:* This is the highest-impact CAM in the portfolio at ~7.50% NexOP. The duplicate expense epidemic inflates project costs by an average of ~6% across the industry — most companies don't even know it's happening. NexVERIFY doesn't delete duplicates (losing the audit trail) — it converts them into verification evidence. The receipt stays as the source of truth with full line items. The CC charge becomes proof that the expense was corroborated by the bank. Two sources, one truth, zero phantom costs. No competitor offers this.
>
> **FIN-ACC-0002 — Zero-Loss Receipt Capture** (36/40 🏆 Elite)
> *Why this matters:* The receipt-first model is structurally broken — 15–25% of receipts are never captured. NCC inverts the model: the moment a banking transaction is assigned to a project, a bill materializes instantly. The receipt enriches it later — it's evidence, not the trigger. This eliminates three failure points: receipt loss, expense report abandonment, and bill creation neglect. Highest value score (10/10) in the entire CAM portfolio.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
