---
cam_id: FIN-AUTO-0002
title: "Transaction-to-Bill Auto-Posting with Dual-Role PM Routing"
mode: FIN
category: AUTO
revision: "1.0"
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
website: false
scores:
  uniqueness: 8
  value: 9
  demonstrable: 8
  defensible: 7
  total: 32
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
tags: [cam, financial, automation, banking, transactions, tentative-bill, dual-role, pm-approval, project-billing]
---

# FIN-AUTO-0002: Transaction-to-Bill Auto-Posting with Dual-Role PM Routing

> *Every dollar assigned to a project becomes a bill — instantly. If you're the PM, it's already approved.*

## Elevator Pitch

When an admin assigns a banking transaction to a project, Nexus instantly creates a bill in the project financials — no manual bill creation, no separate workflow. If the assigning admin also happens to be the PM for that project, the bill skips the approval queue and goes straight to draft. Two roles, one click, zero delay. PMs who aren't admins only see transactions when they materialize as tentative bills in their project — nothing to miss, nothing to chase.

## The Problem

### The Invisible Transaction Gap

In restoration and construction, financial transactions are captured in one place (banking/CSV imports) and project costs are tracked in another (project financials). The gap between these two systems is where money disappears:

1. **Admin imports credit card transactions** — 150 transactions this month across 30 projects
2. **Admin assigns transactions to projects** — sets a project on each transaction
3. **Nothing happens in the project** — the PM has no idea a $2,400 HD purchase was just tagged to their job
4. **PM submits an invoice** — based on what they *know* about, not what *actually happened*
5. **Month-end reconciliation** — bookkeeper discovers 40 transactions were assigned to projects but never became bills. Cost reports are wrong. Invoices are wrong.

This gap exists because "assigning a transaction to a project" and "creating an expense bill" are two completely separate actions in every other system. Users must do both. They rarely do.

### The PM Visibility Blind Spot

PMs don't have access to the banking transaction screen — that's an admin/finance function. So when an admin assigns a $3,000 lumber purchase to the Johnson Roof project, the PM for Johnson Roof has no way to know unless someone tells them. The transaction sits in limbo: tagged to a project in the banking module, invisible in the project financials.

This creates a cascade of downstream problems:

|| Problem | Impact |
||---------|--------|
|| PM doesn't know about the expense | Budget decisions made on incomplete data |
|| PM submits invoice without the expense | Under-billing, margin erosion |
|| Bookkeeper catches it at month-end | Retroactive corrections, delayed close |
|| Auditor finds unbilled expenses | Compliance findings, client disputes |

### The Dual-Role Friction

Many small-to-mid restoration firms have owner/operators or senior PMs who are both admin users *and* the PM for specific projects. In these firms, the same person who sees the banking transaction is the person who would approve it for the project. Making them:

1. Assign the transaction in the banking module
2. Then navigate to the project
3. Then manually create a bill
4. Then approve their own bill

...is four steps of pure friction for a decision they already made in step 1.

## The NexVERIFY Solution

### Auto-Posting: Assignment = Bill

When any transaction (Plaid, HD CSV, Chase, Apple Card) is assigned to a project, Nexus automatically creates a `ProjectBill` in that project's financials. This happens:

- On **single assignment** — click "Assign to Project" on any transaction
- On **bulk assignment** — select multiple transactions and assign at once
- On **prescreen acceptance** — when the 6-signal algorithm suggests a project and the user confirms

The bill inherits all source data: vendor name, amount, date, and a line item describing the transaction. The source transaction ID is linked for full traceability.

### Dual-Role Detection

Before creating the bill, the system checks the project's `teamTreeJson` to determine if the assigning user is the PM for the target project.

**Not the PM (standard path):**
- Bill status: `TENTATIVE`
- Transaction disposition: `PENDING_APPROVAL`
- Bill memo: "Assigned from Banking Transactions — pending PM review"
- PM sees the tentative bill in their project financials and must approve or reject

**Also the PM (dual-role path):**
- Bill status: `DRAFT` (auto-approved)
- Transaction disposition: `ASSIGNED`
- Bill memo: "Assigned by PM — auto-approved for review"
- Bill is immediately visible and actionable — PM still must disposition as billable/not

### PM Review Workflow

PMs who are NOT admins only encounter banking transactions when they appear as tentative bills in their project's expense tab:

1. **Tentative bill appears** — "HD Pro Xtra — $485.23 — Pending PM Review"
2. **PM reviews** — is this actually for my project? Is the amount correct?
3. **Approve** → bill promotes to `DRAFT`, PM can edit details, mark billable, attach receipts
4. **Reject** → bill deleted, transaction unassigned, returned to the banking queue

### Unassign = Cleanup

If an admin unassigns a transaction from a project (sets project to null), the system automatically deletes any `TENTATIVE` or `DRAFT` bill linked to that transaction. Already-approved or paid bills are preserved — the system never destroys confirmed financial records.

### Idempotency

Re-assigning a transaction to the same project doesn't create duplicate bills. The system checks for an existing bill with the same `sourceTransactionId` + `projectId` before creating a new one.

## Why It Matters

### For the PM
- **Complete expense visibility** — every dollar tagged to your project shows up as a bill, not buried in a banking module you can't access
- **Fewer surprises** — no more discovering $5K in HD purchases at month-end that you didn't know about
- **Faster invoicing** — bills already exist when it's time to bill the client

### For the Admin/Bookkeeper
- **One action, two results** — assign a transaction and the bill is created automatically
- **No bill creation backlog** — the most forgotten step in expense management is eliminated
- **Dual-role efficiency** — if you're also the PM, your assignment is your approval

### For the Business
- **Zero-gap cost tracking** — project financials always reflect actual spend, not just what someone remembered to enter
- **Faster monthly close** — no retroactive bill creation during reconciliation
- **Audit-ready** — every transaction has a bill, every bill has a source transaction

## Demo Script

1. Open **Financial → Banking Transactions** as an admin
2. Find an unassigned HD transaction ($485.23)
3. Click "Assign to Project" → select "Smith Residence"
4. Show that the transaction now shows disposition "Pending Approval"
5. Navigate to **Smith Residence → Financials → Bills**
6. Point out the new **TENTATIVE** bill: "HD Pro Xtra — $485.23 — Pending PM Review"
7. Now go back to Banking Transactions, find another transaction ($1,200)
8. Assign it to a project where **you are the PM**
9. Show the disposition is "Assigned" (not "Pending Approval")
10. Navigate to that project's bills — the bill is already **DRAFT** (auto-approved)
11. Demonstrate: select 5 transactions → Bulk Assign → bills appear on each project

## Expected Operational Impact

All impact figures are expressed as a **percentage of annual revenue** so they scale naturally across company sizes.

|| Category | % of Revenue | What It Represents |
||----------|-------------|---------------------|
|| **Unbilled expense elimination** | ~0.35% | Transactions assigned but never billed, caught only at month-end or audit |
|| **PM decision accuracy** | ~0.20% | Budget decisions made on complete cost data vs. partial data |
|| **Bill creation labor saved** | ~0.12% | Admin/bookkeeper time manually creating bills from banking transactions |
|| **Month-end reconciliation reduction** | ~0.08% | Less time spent matching transactions to bills during close |
|| **Total Auto-Posting Impact** | **~0.75%** | **Combined accuracy improvement and labor recovered** |

### Real-World Extrapolation by Tenant Size

|| Annual Revenue | Auto-Posting Impact (~0.75%) |
||---------------|------------------------------|
|| **$1M** | **~$7,500** |
|| **$5M** | **~$37,500** |
|| **$10M** | **~$75,000** |
|| **$50M** | **~$375,000** |

## Technical Differentiators

- **`teamTreeJson` PM detection** — reads the project's team tree to determine PM assignment without a separate role lookup
- **Idempotent bill creation** — checks `sourceTransactionId` + `projectId` before creating, preventing duplicates
- **Transaction disposition lifecycle** — `UNREVIEWED → PENDING_APPROVAL → ASSIGNED` tracks the full approval chain
- **Cascading unassign** — removing a project assignment automatically cleans up tentative/draft bills
- **Bulk assign with bill creation** — each transaction in a bulk operation gets its own bill, with individual dual-role checks

## Competitive Landscape

|| Competitor | Auto-bill on assign? | PM visibility? | Dual-role detection? | Bulk assign+bill? |
||-----------|---------------------|---------------|---------------------|-------------------|
|| Procore | No | Partial (manual) | No | No |
|| Buildertrend | No | No | No | No |
|| CoConstruct | No | No | No | No |
|| QuickBooks | No | N/A | N/A | No |
|| Sage 100 Contractor | No | No | No | No |

No competitor auto-creates project bills from banking transaction assignment. The dual-role PM detection is unique to Nexus.

## Scoring Rationale

- **Uniqueness (8/10)**: No PM software auto-posts banking transactions as project bills. The dual-role shortcut has no equivalent.
- **Value (9/10)**: Closes the most common gap in construction financial tracking — the "assigned but never billed" problem.
- **Demonstrable (8/10)**: Assign a transaction, navigate to the project, bill is already there. Dual-role demo is a clear "wow" moment.
- **Defensible (7/10)**: The `teamTreeJson` PM detection, disposition lifecycle, and idempotent bill creation are deeply integrated into NCC's data model.

**Total: 32/40** — Exceeds CAM threshold (24).

## Related CAMs

- `FIN-ACC-0001` — NexVERIFY (handles duplicate detection when both receipt OCR and auto-posted CC bill exist)
- `FIN-AUTO-0001` — Receipt OCR (receipts attach to auto-posted bills)
- `FIN-ACC-0002` — Zero-Loss Receipt Capture (the economic argument for tentative bill materialization)
- `FIN-INTL-0002` — Smart Prescreen (prescreened transactions also create tentative bills via the same pipeline)
- `FIN-VIS-0001` — Purchase Reconciliation (auto-posted bills feed the CC-to-checking audit chain)

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial release — auto-posting, dual-role detection, bulk assign, unassign cleanup |
