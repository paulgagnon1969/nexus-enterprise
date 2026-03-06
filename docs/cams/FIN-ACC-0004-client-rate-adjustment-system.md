---
cam_id: "FIN-ACC-0004"
module_code: FINANCIALS
title: "Client Rate Adjustment — Transparent Discount Billing with Client Memory"
mode: FIN
category: ACC
revision: "1.0"
tags: [cam, client-rate-adjustment, discount, credit-line, transparent-billing, cost-book, client-memory, invoicing, financial-accuracy]
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
scores:
  uniqueness: 8
  value: 8
  demonstrable: 8
  defensible: 7
  total: 31
---

# FIN-ACC-0004: Client Rate Adjustment — Transparent Discount Billing with Client Memory

> *Full price on record. Agreed rate in practice. Every discount tracked, remembered, and defensible.*

## Elevator Pitch

Restoration companies routinely negotiate client-specific rates — loyalty discounts, contract terms, special corrections — but every platform forces them to choose: bill at the agreed rate (hiding the real cost) or bill at full price (ignoring the agreement). NexNCC is the first platform that does both. When a PM adjusts a cost book line item downward, the system automatically generates two invoice lines: the **full cost book price** and a **companion credit** showing exactly what was discounted and why. The client sees the full value of the work performed, the agreed discount, and the final amount due — all on one invoice. And when the same client's next project starts, the system **remembers the rate** and pre-populates the same discount, ensuring pricing consistency across every job without the PM having to look up what was agreed to last time.

## The Problem

### The Invisible Discount

Every restoration company with repeat clients has negotiated rates. "We'll do structural labor at $25/hr instead of the $128.87 cost book rate." The problem: nobody can see it.

Here's what happens today:

1. **PM opens the cost book** and selects STR/LAB at $128.87/hr (the Xactimate default).
2. **PM manually changes the unit price** to $25.00 because that's what was agreed with this client.
3. **Invoice goes out** showing $25.00/hr for structural labor. The client pays. Everyone's happy.
4. **Six months later**, the owner asks: "Why are we billing Johnson Restoration at $25/hr when the cost book says $128.87? Are we losing money?" Nobody remembers. The PM who negotiated it is on a different project. The agreement isn't recorded anywhere.
5. **Next project for the same client** — a different PM opens the cost book, sees $128.87, and bills full price. The client calls: "Last time it was $25/hr. What changed?" Now there's a relationship problem.

The discount is invisible. The reasoning is lost. The consistency is impossible to maintain.

### Why Existing Solutions Fail

**"Just change the unit price"** — The cost book default disappears. There's no record of what the original price was, what the discount amount is, or why it was adjusted. The invoice shows $25.00 with no context. The client doesn't see the value of the discount. The company can't track its total discount exposure across clients.

**"Add a note"** — Notes don't calculate. They don't auto-apply to future invoices. They don't appear on the client's invoice as a visible credit. And nobody reads them six months later.

**"Use a custom price list"** — Maintaining per-client price lists for dozens of clients, each with different negotiated rates across hundreds of cost book items, is a full-time job. And it still doesn't show the client what the full price would have been.

**"Track it in a spreadsheet"** — The spreadsheet is always out of date. It's disconnected from the invoicing system. The PM has to look up the rate, manually enter it, and hope they picked the right version of the spreadsheet.

### The Compound Cost

The financial damage isn't just the discount itself — it's the **inconsistency**:

- **Client relationship erosion** — Different rates on different projects creates distrust. "Are you making it up as you go?"
- **Margin invisibility** — The owner can't see total discount exposure across the client portfolio. A "loyal client" might be getting $50K/year in invisible discounts.
- **PM knowledge loss** — When a PM leaves or rotates projects, negotiated rates leave with them.
- **Audit vulnerability** — "Why does this invoice show $25/hr when the cost book says $128.87?" Without a recorded adjustment reason, there's no defensible answer.

## The Solution

### Two Lines, Full Transparency

When a PM adjusts a cost book line item downward, the system generates two invoice lines instead of one:

```
Invoice Line Items:
──────────────────────────────────────────────────────
  STR/LAB — Structural Labor        10 hrs × $128.87  =  $1,288.70
  CREDIT — Client Loyalty Discount   10 hrs × -$103.87 = -$1,038.70
──────────────────────────────────────────────────────
  Subtotal:                                               $1,288.70
  Adjustments:                                           -$1,038.70
  Amount Due:                                               $250.00
```

The client sees:
1. The **full value** of the work at cost book rates ($1,288.70)
2. The **specific discount** with a labeled reason ($1,038.70 off for "Client Loyalty Discount")
3. The **amount they owe** ($250.00)

This is how every luxury hotel, enterprise software vendor, and premium service provider presents discounts — because it anchors the perceived value while honoring the agreed rate.

### Adjustment Review Flow

The adjustment happens between cost book selection and invoice submission:

1. PM selects items from the cost book (existing flow, unchanged)
2. **New: Adjustment Review modal** appears before submission
3. For each line item, PM can toggle "Adjust" and enter:
   - **Adjusted unit price** ($25.00) — system auto-calculates discount percentage (80.6%)
   - **Or discount percentage** (80.6%) — system auto-calculates adjusted price ($25.00)
   - **Adjustment reason** — dropdown: "Client Contract Terms", "Client Loyalty", "Special Item Correction", or custom
4. Optional: **"Save rate to client record"** — stores this adjustment for future pre-population
5. Submit → full-price line + credit line are created atomically

### Client Rate Memory

When "Save rate to client record" is toggled, the system stores:

- The cost book item code (e.g., STR/LAB)
- The adjusted unit price ($25.00)
- The discount percentage (80.6%)
- The adjustment reason
- The effective date

On the **next invoice** for the same client, when the PM selects the same cost book item:

- The Adjustment Review modal **pre-populates** with the saved rate
- The PM sees: "Previously agreed: $25.00/hr (80.6% discount) — Client Loyalty"
- One click to accept, or override with a new rate

The rate is a **recommendation**, not a lock. The PM always has final control. But the institutional knowledge is preserved — it doesn't matter which PM opens the project.

### Upward Adjustments (Surcharges)

If the adjusted price is **above** the cost book rate, the system does NOT show a credit/discount. It simply uses the adjusted price as the billable amount. No credit line is generated because there's no discount to display — the client is paying more than the default, and showing the lower default would invite negotiation.

### Invoice Totals

Every invoice now displays:

```
  Subtotal (before adjustments):  $4,822.50
  Adjustments (credits):          -$1,038.70
  Tax:                              $0.00
  Amount Due:                      $3,783.80
```

## Competitive Landscape

### Xactimate
Industry-standard cost book for restoration. Has no concept of client-specific rate adjustments. PMs manually override unit prices — the original cost book price is lost. No credit line generation. No client memory. No discount tracking.

### Procore
Budget tracking with change orders. Can apply markups/discounts at the contract level, but not per-line-item with cost book awareness. No automatic credit line generation. No pre-population from client history.

### Buildertrend
Estimate and invoice templates. Manual line item entry. No cost book integration, no discount decomposition, no client rate memory.

### QuickBooks / Xero
Can create credit memos and discounts, but these are disconnected from the original line item. No concept of "this line was $128.87 in the cost book but we're billing $25.00 because of a client agreement." No cross-invoice client rate memory.

### Sage 300 CRE
Supports contract-level billing rates and client-specific rate tables, but rate tables must be manually maintained per client. No automatic credit line generation. No visual discount decomposition on the invoice. Updating rates requires admin access to the rate table module.

**No competitor offers**: cost book–aware per-line adjustment → automatic dual-line generation (full price + credit) → client rate memory with pre-population → reason-coded discount tracking → transparent invoice presentation with subtotals/adjustments/amount due.

## Technical Implementation

### Schema

- **`AdjustmentReasonType`** model — tenant-scoped adjustment reasons (seeded with 3 defaults: Client Contract Terms, Client Loyalty, Special Item Correction). Admins can add more.
- **`ClientRateAdjustment`** model — stores per-client, per-item rate agreements:
  - `tenantClientId` + `costBookItemCode` (unique per tenant-client pair)
  - `adjustedUnitPrice`, `discountPercent`, `adjustmentReasonId`
  - `effectiveDate`, `createdById`
- **`ProjectInvoiceLineItem`** extended fields:
  - `costBookUnitPrice` — original cost book price (preserved even when adjusted)
  - `adjustedUnitPrice` — the agreed rate
  - `discountPercent` — calculated discount percentage
  - `parentLineItemId` — links CREDIT line to its parent full-price line
  - `clientRateAdjustmentId` — FK to the client rate record that generated this adjustment

### API

- **`addInvoiceLineItem`** — detects when `adjustedUnitPrice < costBookUnitPrice`, creates:
  1. Main line at full cost book price
  2. CREDIT companion line with negative amount = (costBookUnitPrice - adjustedUnitPrice) × quantity
  3. Optionally upserts `ClientRateAdjustment` when `saveToClientRecord: true`
- **`GET /clients/adjustment-reasons`** — lists tenant's adjustment reasons (auto-seeds defaults on first call)
- **`POST /clients/adjustment-reasons`** — admin creates new reason types
- **`GET /clients/:id/rate-adjustments`** — all saved rates for a client
- **`GET /clients/:id/rate-adjustments/by-items?itemIds=`** — bulk lookup for pre-population in the Adjustment Review modal

### Frontend

- **Adjustment Review Modal** — appears between cost book picker and invoice submission:
  - Per-item "Adjust" checkbox
  - Reason dropdown (fetched from API, admin-extensible)
  - Dual input: enter adjusted price ↔ auto-shows discount %; enter discount % ↔ auto-shows adjusted price
  - "Save rate to client" toggle per line
  - Pre-populated from existing `ClientRateAdjustment` records when available
- **Invoice display** — credit lines shown with `CREDIT` prefix, negative amounts in parentheses
- **Invoice totals** — Subtotal, Adjustments, Tax, Amount Due

## Demonstrability

### Live Demo Flow (60 seconds)

1. **Open a project invoice** → click "Add from Cost Book"
2. **Select STR/LAB** at $128.87/hr, qty 10
3. **Adjustment Review appears** → check "Adjust" → enter $25.00
4. **Watch**: discount auto-calculates to 80.6%, reason dropdown shows "Client Loyalty"
5. **Toggle** "Save rate to client" → Submit
6. **Invoice shows**: $1,288.70 full price + $1,038.70 credit = $250.00 due
7. **Open a new project** for the same client → Add STR/LAB from cost book
8. **Adjustment Review pre-populates**: "$25.00/hr — previously agreed (Client Loyalty)"
9. **One click** to accept → same transparent billing on the new project

### Key Visual Moments

- Dual-line invoice display — full price + credit on the same invoice
- Auto-calculating discount fields — enter one, the other computes instantly
- Pre-populated adjustment from client history — "the system remembers"
- Invoice totals with subtotal / adjustments / amount due breakdown

## Expected Operational Impact

| Category | Impact | Description |
|----------|--------|-------------|
| **Pricing consistency** | High | Same client gets same rates across all projects and PMs |
| **Client transparency** | High | Invoices show full value + specific discount — builds trust |
| **PM efficiency** | Medium | No more looking up "what rate did we give this client last time" |
| **Margin visibility** | Medium | Owner can see total discount exposure per client |
| **Audit defensibility** | Medium | Every adjustment has a coded reason and recorded approval |
| **Knowledge retention** | High | Negotiated rates survive PM turnover and project rotation |

## Scoring Rationale

- **Uniqueness (8/10)**: No restoration or construction platform generates automatic dual-line invoices (full price + credit) from cost book adjustments. Client rate memory with pre-population across projects is absent from every competitor reviewed. The closest analog is enterprise contract pricing in SAP/Oracle, which requires dedicated rate table administration.

- **Value (8/10)**: Solves a daily pain point for PMs who negotiate client-specific rates. Prevents relationship damage from inconsistent pricing. Gives owners visibility into discount exposure. Makes invoices more professional and transparent — clients see the value they're receiving.

- **Demonstrable (8/10)**: The flow is linear and visual: select cost book item → adjust price → see dual lines on invoice → open next project → see it remembered. The auto-calculating fields and pre-population are immediate "how did it know that?" moments.

- **Defensible (7/10)**: The individual pieces (discount tracking, credit lines, client records) are technically achievable. The integrated flow — cost book awareness + auto dual-line generation + client memory + reason coding + pre-population — is non-trivial as a system. Defensibility increases as clients accumulate rate history over time, creating switching cost.

**Total: 31/40** — Above CAM threshold. Strong differentiator for client-facing billing transparency.

## Related CAMs

- `FIN-ACC-0001` — NexVERIFY (expense accuracy on the cost side; this CAM handles accuracy on the billing/revenue side)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (cost book data feeds into the adjustment review as the baseline price)
- `FIN-VIS-0001` — Purchase Reconciliation Audit Chain (adjusted invoices integrate into the full financial audit chain)

## Expansion Opportunities

- **Client rate dashboard** — Per-client summary showing all active rate adjustments, total discount value, effective dates. Gives the owner a "discount exposure" view across the portfolio.
- **Rate expiration** — Adjustments with an expiration date. "Client Loyalty discount valid through Q2 2026." System alerts PM when a rate is about to expire.
- **Approval workflows** — Discounts above a threshold (e.g., >30%) require owner/exec approval before the invoice can be finalized.
- **Rate history timeline** — Show how a client's negotiated rate has changed over time. "Johnson Restoration: STR/LAB was $35/hr in 2025, reduced to $25/hr in Jan 2026."
- **Bulk rate application** — Apply a client's saved rates to all matching line items on a new invoice with one click. "Apply Johnson Restoration rates" → all matching cost book items auto-adjust.
- **Discount impact reporting** — Monthly/quarterly report: "Total discounts given: $42,800. Top discounted client: Johnson Restoration ($18,200). Most discounted item: STR/LAB ($12,400 across 8 projects)."

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial release — Client Rate Adjustment System with transparent dual-line billing, client memory, and adjustment review flow |
