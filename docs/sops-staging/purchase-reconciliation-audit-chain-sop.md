---
title: "Purchase Reconciliation — Full Audit Chain SOP"
module: purchase-reconciliation
revision: "1.0"
tags: [sop, financial, reconciliation, audit-chain, credit-card, checking, receipt, pm-review, compliance]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
cam_ref: FIN-VIS-0001
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# Purchase Reconciliation — Full Audit Chain

## Purpose
Nexus traces every dollar from checking account outflow → credit card payment → individual CC charges → OCR receipt line items → project cost allocation, with forced PM review at every assignment. This SOP documents the 5-layer reconciliation workflow.

## Who Uses This
- **Bookkeepers / Accounting** — import transactions, run auto-classification, manage CC-to-checking links
- **PMs** — review and approve/reject project assignments in the PM Review Queue
- **Admins / Executives** — audit the full chain, run compliance reports

## Workflow

### Layer 1: Auto-Classification
Every imported transaction is automatically classified by merchant/category:

| Merchant Pattern | Classification | Confidence |
|-----------------|---------------|------------|
| Home Depot, Lowe's, lumber yards | `PROJECT_MATERIAL` | 0.95 |
| Restaurants, fast food | `ENTERTAINMENT` | 0.85 |
| Gas stations | `FUEL` | 0.85 |
| Harbor Freight, tool suppliers | `TOOL_EQUIPMENT` | 0.85 |
| Unrecognized merchants | `UNCLASSIFIED` | — |

**High-confidence (≥0.80)** classifications are auto-applied. Lower-confidence items are flagged for manual review.

### Layer 2: CC-to-Checking Linking

#### Step-by-Step
1. Navigate to **Financial → Reconciliation → CC ↔ Checking**
2. System identifies checking outflows matching CC payment patterns (e.g., "APPLE CARD PAYMENT $14,832.71")
3. For each outflow, system finds all CC charges in the 35-day window before the payment date
4. Charges accumulate FIFO until the payment amount is reached
5. Confidence scored: exact match = 0.95, <5% variance = 0.80, <15% = 0.60
6. Review suggested links → **Link All** or link individually
7. Result: every checking outflow is decomposed into the individual CC charges it funded

### Layer 3: Receipt Line Disposition
When a receipt is OCR-processed, each line item gets an individual disposition:

- **Keep on Job** (default) — stays on the current project
- **Credit (Personal)** — marked as personal expense, credited back to project total
- **Move to Project** — reassigned to a different project

#### How to Disposition Receipt Lines
1. Open a daily log with an OCR'd receipt
2. Click the receipt to expand line items
3. For each line: select Keep / Credit / Move
4. If Move: select the target project
5. Save — dispositions are timestamped and attributed to the user

### Layer 4: PM Review Queue
Any transaction assigned to a project lands in the PM's review queue.

#### PM Review Actions
1. Navigate to **Financial → PM Review** (or see badge count on dashboard)
2. For each pending item, review: description, amount, suggested project, confidence
3. **Approve** — confirms the assignment, advances to `CONFIRMED`
4. **Reject** — returns to `UNLINKED` pool, project assignment cleared
5. **Reassign** — moves to different project (triggers review for that PM)

### Layer 5: Full Audit Chain
All layers connect into a traceable chain:
```
Checking outflow ($14,832.71 to Apple Card)
  └─ CC Charge: Home Depot $485.23 [PROJECT_MATERIAL]
  │   └─ Receipt OCR → 8 line items
  │       ├─ Drywall sheets → KEEP on Job A ✓ PM Approved
  │       ├─ Paint → MOVE to Job B ✓ PM Approved
  │       └─ Snacks → CREDIT (Personal) ✓
  ├─ CC Charge: Chick-fil-A $32.17 [ENTERTAINMENT]
  │   └─ Assigned to Job A ✓ PM Approved
  └─ CC Charge: Amazon $12.99 [UNCLASSIFIED]
      └─ Pending PM review
```

### Reconciliation Status Flow
```
UNLINKED → SUGGESTED → LINKED → PM_REVIEW → CONFIRMED
```

## Monthly Reconciliation Checklist

1. **Import all CC statements** (HD Pro Xtra, Apple Card, Chase)
2. **Run auto-classification** — verify unclassified items
3. **Link CC-to-checking** — confirm payment matches
4. **Disposition receipt line items** — handle mixed-use receipts
5. **PM review queue** — ensure all items approved/rejected
6. **Generate reconciliation report** — confirm all transactions are `CONFIRMED`
7. **Archive** — export audit trail for the period

## Key Features
- **5-layer audit chain** — checking → CC → receipt → line item → project
- **Auto-classification** — 100+ merchant patterns across 5 expense categories
- **Forced PM review** — nothing hits project financials without PM sign-off
- **Per-line receipt disposition** — handle mixed personal/project purchases
- **FIFO CC-to-checking matching** — with confidence scoring

## Related Modules
- [Smart Prescreening](smart-prescreening-store-card-reconciliation-sop.md) — predictive project allocation
- [Inline Receipt OCR](inline-receipt-ocr-sop.md) — receipt line item extraction
- [NexPRICE Regional Pricing](local-price-extrapolation-sop.md) — HD SKUs dual-write to cost book

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial SOP — 5-layer audit chain workflow, monthly checklist |
