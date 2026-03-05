---
cam_id: OPS-VIS-0001
module_code: ESTIMATING
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

## Expected Operational Savings

*Based on a mid-size restoration firm: 5 PMs, 60 projects/year, avg 15 flaggable line items per project.*

| Category | Calculation | Annual Savings |
|----------|-------------|----------------|
| **Faster supplement filing** | Cash flow acceleration on 30 supplements/yr × $200 time-value | **$6,000** |
| **Captured under-billed scope** | 2 missed discrepancies/project × avg $800 × 60 projects × 50% capture | **$48,000** |
| **PM cross-reference time saved** | 30 min/project × 60 projects @ $55/hr | **$1,650** |
| **Carrier disputes won** | 1 dispute/yr won with audit trail × avg $5,000 | **$5,000** |
| | **Estimated Annual Savings** | **~$60,650** |

## Competitive Landscape

| Competitor | Field Qty Flagging? | Flag → Reconciliation? | Review Lifecycle? | Real-Time PM View? |
|------------|--------------------|-----------------------|-------------------|-------------------|
| Procore | No | No | No | No |
| Buildertrend | No | No | No | No |
| CoConstruct | No | No | No | No |
| Xactimate | No — estimating only | N/A | N/A | N/A |
| CompanyCam | Photo annotations | No estimate link | No | No |

## Scoring Rationale

- **Uniqueness (7/10)**: Field-to-estimate qty flagging with direct reconciliation integration is unique.
- **Value (8/10)**: Under-billed scope is one of the biggest margin leaks in restoration.
- **Demonstrable (8/10)**: Flag on mobile, see banner on web — immediate and clear.
- **Defensible (5/10)**: UI + data flow integration, not algorithmically complex, but the SowItem-level flag model creates a defensible workflow.

**Total: 28/40** — Exceeds CAM threshold (24).

## Related CAMs

- `OPS-VIS-0002` — Urgency Task Dashboard (discrepancy flags generate follow-up tasks)
- `FIN-VIS-0001` — Purchase Reconciliation (flagged materials feed financial reconciliation)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (re-priced items after correction use BOM search)

## Technical Implementation
- **Frontend only** for the reconciliation banner — the API already returned all `qtyField*` data on the SowItem.
- **Field PETL Scope** handles flag creation (inline editing with persistent note display).
- **No additional API endpoints** were needed.

## Expansion Opportunities

- **Photo-linked flags** — attach a photo to a qty discrepancy as visual evidence
- **Auto-supplement generation** — approved discrepancies auto-generate supplement line items
- **Batch flagging** — flag multiple lines at once from a room walkthrough
- **Discrepancy analytics** — track which estimators have the most field corrections

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-22 | Initial draft — field discrepancy pipeline |
| 2.0 | 2026-03-04 | Enriched: operational savings, competitive landscape, scoring rationale, related CAMs, expansion opportunities |
