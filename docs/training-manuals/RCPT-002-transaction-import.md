---
title: "Transaction Import (Apple Card, Bank CSV, Plaid)"
code: RCPT-002
chapter: 3
module: expense-capture
revision: "1.0"
difficulty: 🟡 Intermediate
roles: [ACCOUNTING, ADMIN]
tags: [training, expense, transactions, import, apple-card, plaid, csv]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [accounting, admin]
cam_references:
  - id: FIN-VIS-0001
    title: "Purchase Reconciliation Audit Chain"
    score: 33
---

# RCPT-002 — Transaction Import (Apple Card, Bank CSV, Plaid)

🟡 Intermediate · 💰 ACCOUNTING · 🔧 ADMIN

> **Chapter 3: Expense Capture & Receipt Management** · [← Receipt Capture](./RCPT-001-receipt-capture.md) · [Next: Prescreening →](./RCPT-003-prescreening.md)

---

## Purpose

Import credit card and bank transactions into NCC to create a complete financial picture. Supports Apple Card CSV, generic bank CSV exports, and Plaid-connected accounts for automatic import.

## Who Uses This

- **Accounting/Bookkeepers** — weekly or monthly transaction imports
- **Admins** — configure Plaid connections for automatic bank feeds

## Step-by-Step: CSV Import

1. Navigate to **Financial** (`/financial`) → **Import Transactions** (or the import section on the financial page).
2. Click **Upload CSV**.
3. Select your CSV file (Apple Card statement, Chase CSV, generic bank export).
4. NCC auto-detects the format and maps columns.
5. Transactions appear in the **Prescreen Queue** for assignment.

## Step-by-Step: Plaid Connection

1. Navigate to **Settings → Billing** or the Financial integration section.
2. Click **Connect Bank Account**.
3. Follow the Plaid Link flow to authenticate with your bank.
4. Transactions are imported automatically on a recurring basis.
5. New transactions appear in the Prescreen Queue.

## Powered By — CAM Reference

> **FIN-VIS-0001 — Purchase Reconciliation Audit Chain** (33/40 ⭐ Strong)
> *Why this matters:* Imported transactions are the first link in a 5-layer audit chain. A $14K Apple Card payment is one lump sum on the bank statement — NCC decomposes it into the 247 individual charges it covers, then traces each charge to a receipt, then to individual line items, then to a PM-approved project allocation. No other construction platform provides this level of financial traceability.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
