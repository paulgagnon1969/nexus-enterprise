---
cam_id: OPS-VIS-0001
title: "Field Qty Discrepancy Pipeline"
mode: OPS
category: VIS
revision: "1.0"
status: draft
created: 2026-02-22
updated: 2026-02-22
author: Warp
website: false
scores:
  uniqueness: 7
  value: 8
  demonstrable: 8
  defensible: 5
  total: 28
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
tags: [cam, ops, visibility, petl, field-petl, reconciliation, qty-discrepancy]
---

# OPS-VIS-0001: Field Qty Discrepancy Pipeline

## Elevator Pitch
Field crews flag incorrect estimate quantities in real time from the job site. The discrepancy—along with the field-reported quantity and an explanatory note—surfaces instantly in the PM's PETL Reconciliation Panel as a prominent alert banner, enabling faster, more accurate supplement and change order decisions without switching views or chasing down verbal reports.

## Problem
In restoration, estimate quantities frequently don't match field reality. Drywall behind cabinets, hidden water damage, or incorrect room measurements create discrepancies that traditionally require:
- Phone calls or texts from field to PM
- PM manually cross-referencing notes against the estimate
- Delays in filing supplements because the PM didn't know about the discrepancy
- Lost notes and verbal miscommunications leading to under-billed scope

## How It Works
1. **Field flags the line** — From the Daily Log's Field PETL Scope, the field worker taps the flag icon on any line item, enters the actual quantity they measured, and writes a note.
2. **Data persists on the SowItem** — `qtyFlaggedIncorrect`, `qtyFieldReported`, `qtyFieldNotes`, and `qtyReviewStatus` are stored directly on the scope-of-work item.
3. **PM sees it in reconciliation** — When the PM opens the PETL Reconciliation Panel for that line, a ⚠️ amber discrepancy banner shows the field qty vs. estimate qty, the field note, status badge, and timestamp.
4. **PM takes action** — Adjust the line, create a supplement, move to a standalone change order, or dismiss if flagged in error.

## Competitive Differentiation
- **Most restoration platforms** separate field reporting from estimate reconciliation — the PM has to export, cross-reference, or rely on verbal hand-offs.
- **Nexus connects the flag to the exact line item** in the reconciliation workflow. No exports, no cross-referencing, no lost context.
- **Review status lifecycle** (pending → resolved/dismissed) creates an auditable trail of how discrepancies were handled — valuable for carrier disputes and compliance.

## Demo Script
1. Open a project's Daily Log → Field PETL Scope tab.
2. Flag a line item as incorrect (e.g., "Drywall qty should be 80 SF, not 50 SF — damage extends behind kitchen cabinets").
3. Switch to the project's PETL tab → click the same line item to open Reconciliation.
4. Point out the ⚠️ Field Qty Discrepancy banner showing the field note, qty comparison, and pending status.
5. Show the PM creating a supplement entry informed by the field data.

## Metrics / Value Indicators
- **Time to supplement decision** — reduced from days (waiting for field reports) to minutes
- **Supplement accuracy** — field-reported qty available at point of decision, reducing under/over-billing
- **Discrepancy audit trail** — every flag has a timestamp, author, and resolution status

## Technical Implementation
- **Frontend only** for the reconciliation banner — the API already returned all `qtyField*` data on the SowItem; the display was the missing link.
- **Field PETL Scope** handles the flag creation (inline editing with persistent note display, chevron toggles, bulk show/hide).
- **No additional API endpoints** were needed for this feature.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-22 | Initial draft — field discrepancy pipeline documented |
