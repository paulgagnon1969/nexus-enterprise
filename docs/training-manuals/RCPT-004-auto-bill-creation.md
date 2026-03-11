---
title: "Auto-Bill Creation from Transactions"
code: RCPT-004
chapter: 3
module: expense-capture
revision: "1.0"
difficulty: 🟢 Basic
roles: [ACCOUNTING, PM]
tags: [training, expense, auto-bill, transaction, dual-role, approval]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [accounting, pm, admin]
cam_references:
  - id: FIN-AUTO-0002
    title: "Transaction-to-Bill Auto-Posting"
    score: 32
---

# RCPT-004 — Auto-Bill Creation from Transactions

🟢 Basic · 💰 ACCOUNTING · 📋 PM

> **Chapter 3: Expense Capture & Receipt Management** · [← Prescreening](./RCPT-003-prescreening.md) · [Next: NexVERIFY →](./RCPT-005-nexverify.md)

---

## Purpose

When a transaction is assigned to a project (either via prescreening or manual assignment), NCC automatically creates a bill — no second step required. If the person assigning the transaction is also the PM for that project, the bill skips the approval queue entirely.

## Who Uses This

- **Accounting** — assigns transactions; bills are created automatically
- **PMs** — see auto-created bills in their project expense list; dual-role PM detection skips approval

## How It Works

1. Transaction is assigned to a project (via prescreen accept, manual assignment, or receipt capture).
2. A `ProjectBill` is created instantly with:
   - Amount, vendor, date from the transaction
   - Status: `DRAFT` (if assigner is NOT the PM) or `APPROVED` (if assigner IS the PM)
   - Source linked to the original transaction for audit trail
3. The PM receives the bill in their review queue (unless they were the assigner).

## Powered By — CAM Reference

> **FIN-AUTO-0002 — Transaction-to-Bill Auto-Posting** (32/40 ⭐ Strong)
> *Why this matters:* In every other system, assigning a transaction to a project and creating a bill are two separate actions. Users do one and forget the other — creating the "assigned but never billed" gap. NCC eliminates this gap entirely. The dual-role PM detection is unique: if the bookkeeper who assigns the transaction is also the PM for that project, the bill auto-approves, saving another manual step. NexOP contribution: ~0.75% of revenue.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
