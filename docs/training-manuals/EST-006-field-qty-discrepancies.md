---
title: "Field Quantity Discrepancies"
code: EST-006
chapter: 2
module: estimating-xactimate
revision: "1.0"
difficulty: 🟡 Intermediate
roles: [FIELD, PM]
tags: [training, estimating, field, discrepancy, reconciliation, supplement]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [field, pm, admin]
cam_references:
  - id: OPS-VIS-0001a
    title: "Field Qty Discrepancy Pipeline"
    score: 28
---

# EST-006 — Field Quantity Discrepancies

🟡 Intermediate · 🏗️ FIELD · 📋 PM

> **Chapter 2: Estimating & Xactimate Import** · [← NexPLAN Selections](./EST-005-nexplan-selections.md) · [Next: NexDupE →](./EST-007-nexdupe.md)

---

## Purpose

When field crews discover that the estimated quantities don't match reality — more drywall damage than scoped, fewer fixtures than listed — they can flag the discrepancy directly from the daily log. The discrepancy flows instantly to the PM's Reconciliation Panel on the PETL tab, where it can be reviewed and used to file a supplement.

## Who Uses This

- **Field crews** — flag quantity mismatches from the daily log
- **PMs** — review discrepancies in the Reconciliation Panel, file supplements

## Step-by-Step: Flagging a Discrepancy (Field)

1. Open the project → **Daily Log**.
2. While logging observations, find the PETL line item that's incorrect.
3. Click the **⚠️ Flag Qty** button on the line item.
4. Enter the **field quantity** (what you actually see) and a **note** explaining the discrepancy.
5. Submit the flag.

## Step-by-Step: Reviewing Discrepancies (PM)

1. Open the project → **PETL** tab.
2. Look for the **Discrepancy Banner** at the top — it shows the count of unreviewed flags.
3. Open the **Reconciliation Panel** to see all flagged items.
4. For each discrepancy, you see:
   - Original estimate quantity
   - Field-reported quantity
   - Crew member who flagged it
   - Their note/explanation
5. Mark each as **Reviewed** (accept the field qty) or **Dismissed** (keep the estimate).
6. Accepted discrepancies can feed directly into a supplement filing.

## Powered By — CAM Reference

> **OPS-VIS-0001a — Field Qty Discrepancy Pipeline** (28/40 ✅ Qualified)
> *Why this matters:* Estimate quantities never match field reality perfectly. In every other system, discrepancies are communicated verbally or via text — and they get lost. Under-billed scope is the result. NCC's pipeline creates a structured, auditable path from field observation to PM review to supplement filing. The discrepancy is flagged the same day it's discovered, not weeks later. NexOP contribution: ~0.61% of revenue.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
