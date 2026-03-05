---
title: "Field Qty Discrepancy Pipeline SOP"
module: field-qty-discrepancy
revision: "1.0"
tags: [sop, operations, visibility, petl, field-petl, reconciliation, qty-discrepancy, supplement]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
cam_ref: OPS-VIS-0001
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, field]
---

# Field Qty Discrepancy Pipeline

## Purpose
Field crews flag incorrect estimate quantities in real time from the job site. The discrepancy surfaces instantly in the PM's PETL Reconciliation Panel, enabling faster supplement and change order decisions. This SOP documents the flag-to-resolution workflow.

## Who Uses This
- **Field workers / Foremen** — flag incorrect quantities during job-site work
- **PMs** — review discrepancies in the Reconciliation Panel, take action
- **Estimators** — reference field corrections when revising estimates

## Workflow

### Step 1: Field Flags the Line Item
1. Open the project's **Daily Log → Field PETL Scope** tab
2. Find the line item with an incorrect quantity
3. Tap the **flag icon** (⚠️) on the line item
4. Enter:
   - **Actual quantity** measured in the field
   - **Note** explaining the discrepancy (e.g., "Drywall extends behind kitchen cabinets — actual area is 80 SF, not 50 SF")
5. Save — flag is timestamped and attributed to the field worker

### Step 2: PM Sees the Discrepancy
1. Open the project's **PETL tab**
2. Click the flagged line item → open **Reconciliation Panel**
3. A ⚠️ **amber discrepancy banner** shows:
   - Estimate qty vs. field-reported qty
   - Field worker's note
   - Status badge (Pending / Resolved / Dismissed)
   - Timestamp of when the flag was created

### Step 3: PM Takes Action
The PM has four options:

| Action | When to Use | Result |
|--------|-------------|--------|
| **Adjust the line** | Simple correction, no supplement needed | Qty updated, status → Resolved |
| **Create a supplement** | Additional scope for insurance carrier | Supplement entry created with field evidence |
| **Move to change order** | Non-covered additional work | Standalone CO with field data attached |
| **Dismiss** | Flagged in error or already addressed | Status → Dismissed with reason |

### Review Status Lifecycle
```
Pending → Resolved (qty adjusted / supplement created)
Pending → Dismissed (flagged in error)
```

## Data Model
The following fields are stored directly on the `SowItem`:
- `qtyFlaggedIncorrect` (Boolean) — whether a discrepancy has been flagged
- `qtyFieldReported` (Decimal) — the actual quantity measured by field
- `qtyFieldNotes` (String) — field worker's explanation
- `qtyReviewStatus` (String) — pending / resolved / dismissed

## Best Practices

### For Field Workers
- **Be specific** in notes — include room names, measurements, and why the qty differs
- **Flag immediately** when you notice the discrepancy — don't wait until end of day
- **One flag per line item** — if multiple issues, describe all in a single note
- **Attach photos** when possible (future enhancement) for visual evidence

### For PMs
- **Check the Reconciliation Panel daily** for new flags
- **Don't dismiss without reading the note** — field workers flag for a reason
- **Use discrepancies to strengthen supplement requests** — the timestamped field report is evidence
- **Resolve promptly** — unresolved flags create noise for future reviews

## Key Features
- **Real-time field-to-office communication** — no phone calls, no texts, no lost notes
- **Direct line-item linkage** — flag connects to the exact SowItem in the estimate
- **Audit trail** — who flagged, when, what they reported, and how it was resolved
- **Supplement evidence** — timestamped field reports support insurance negotiations

## Related Modules
- [Field PETL Mobile](field-petl-mobile.md) — the mobile interface where flags are created
- [PETL Note Reconciliation](petl-note-reconciliation-sop.md) — related reconciliation workflows
- [Urgency Task Dashboard](urgency-task-dashboard-sop.md) — discrepancy flags can generate follow-up tasks

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial SOP — flag-to-resolution workflow, data model, best practices |
