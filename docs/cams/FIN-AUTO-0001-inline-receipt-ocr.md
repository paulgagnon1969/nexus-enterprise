---
cam_id: "FIN-AUTO-0001"
title: "Inline Receipt OCR — Multi-Receipt Scan, Line Item Selection & Credit Deductions"
mode: FIN
category: AUTO
score:
  uniqueness: 7
  value: 8
  demonstrable: 9
  defensible: 6
  total: 30
status: draft
created: 2026-02-21
updated: 2026-03-03
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# FIN-AUTO-0001: Inline Receipt OCR with Line Item Control

## Competitive Advantage
Field crews capture dozens of receipts per week across job sites. Nexus uses GPT-4 Vision to instantly read any photographed receipt and auto-fill vendor, amount, date, and every individual line item — right in the daily log form. Users can attach multiple receipts to a single expense log and all line items merge into one view. Each item gets a checkbox so users can selectively exclude items (personal purchases, duplicates, returns) and apply flat credit deductions. The net total recalculates live. No manual entry, no separate expense app, no waiting.

## What It Does
- Photographs one or more receipts from camera, file picker, or drag-and-drop
- Each image is OCR'd independently via GPT-4 Vision
- Extracts: vendor name, total amount, date, subtotal, tax, currency, payment method, and individual line items (description, qty, unit price, amount)
- **Multi-receipt merge**: sums totals, first vendor wins, earliest date wins, line items concatenate
- **Line item selection**: every extracted item appears with a checkbox (pre-checked); uncheck to exclude
- **Credit / deduction**: flat dollar credit field further reduces the net total
- **Live net total**: green summary bar shows "X of Y items selected − $Z credit → Net: $N.NN"
- Auto-generates log title as "Expense - Vendor $Amount"
- Edit/view modals lazy-load line items from API; exclusions and credit persist across saves
- Returns confidence scores so users know when to double-check

## Why It Matters
- **Construction-specific**: most competitors don't have receipt OCR at all, or require a separate expense management tool (Expensify, Dext, etc.) — none offer line-item-level control within the PM tool
- **Partial receipt handling**: field workers often buy personal items alongside project materials on the same receipt — they can now uncheck personal items instead of doing math
- **Multi-receipt consolidation**: a single job-site trip may generate 3-4 receipts — one expense log captures all of them with merged line items
- **Credit/return support**: store credits, coupons, and partial returns are handled without manual amount editing
- **Zero friction**: field workers take photos and the system does the rest — no typing vendor names on a phone keyboard in the rain
- **Accounting alignment**: line-level detail and net totals flow directly into the daily log system, which feeds project cost tracking and auto-bill creation
- **AI-powered accuracy**: GPT-4 Vision handles crumpled receipts, odd angles, thermal paper fade, and handwritten amounts far better than traditional OCR
- **Offline-safe**: the scan is assistive, not blocking — if it fails, the log still saves with manual entry

## Demo Script
1. Open a project → **New Daily Log** → select **Receipt / Expense**
2. Drag-and-drop a receipt image (e.g., a Home Depot receipt with 8 line items)
3. Watch "Running OCR on 1 receipt(s)..." — in 2–5 seconds, the line items table appears
4. Point out: vendor, amount, date auto-filled; every line item shown with checkboxes
5. **Uncheck 2 items** (e.g., personal snacks) — watch the amount recalculate instantly
6. **Enter $5.00 credit** in the deduction field — net total updates
7. Show the green summary bar: "6 of 8 items selected − $5.00 credit → Net: $87.23"
8. **Upload a second receipt** (e.g., Lowe's) — its line items append below the first
9. Save the log, then re-open it — show line items load in the view/edit modal with exclusions preserved
10. Edit the log: re-check an excluded item and remove the credit — save — total updates

## Technical Differentiators
- **1:many OCR results per daily log** — schema supports unlimited receipt images per expense log
- **Merged line items API** — `GET /daily-logs/:id/ocr-line-items` aggregates across all receipts, tagged by source
- **Index-based exclusion persistence** — excluded items stored as JSON array of indices; survives page reloads and modal re-opens
- **Credit as first-class field** — `DailyLog.creditAmount` (Decimal) alongside `excludedLineItemsJson` for complete audit trail
- Standalone OCR endpoint decoupled from log creation — reusable for invoices, purchase orders, etc.
- Base64 encoding for OpenAI Vision API with `detail: high` for receipt text clarity
- Low-temperature (0.1) structured JSON extraction for consistent, parseable results

## Expansion Opportunities
- **Tax allocation** — distribute tax proportionally across selected line items for per-item cost accuracy
- **Category tagging** — auto-assign cost categories (Materials, Supplies, Tools) to each line item from OCR
- **Invoice OCR** — same multi-receipt pattern for scanning vendor invoices and purchase orders
- **Receipt matching** — auto-match scanned line items to existing purchase orders or budget line items
- **Approval workflows** — route high-value receipts (>$500) for PM approval before posting to accounting
- **Export to QuickBooks/Sage** — line-item-level receipt data feeds directly into accounting integrations
- **Mobile parity** — bring line item selection and credit deduction UI to the mobile app
