---
cam_id: FIN-ACC-0005
title: "NexPrice Bidirectional Invoice Pricing Engine"
mode: FIN
category: ACC
revision: "1.0"
tags: [cam, fin, acc, invoicing, pricing, markup, discount, cost-book]
status: draft
created: 2026-03-07
updated: 2026-03-07
author: Warp
scores:
  uniqueness: 6
  value: 7
  demonstrable: 8
  defensible: 5
  total: 26
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, accounting]
---

# NexPrice Bidirectional Invoice Pricing Engine

## CAM ID
`FIN-ACC-0005`

## Elevator Pitch
Edit any pricing field on an invoice line item — original rate, edited rate, markup %, final bill rate, discount amount, or discount % — and every other field recalculates instantly. No spreadsheets, no manual math, no pricing errors.

## Problem
Restoration contractors routinely need to adjust unit prices on invoices for client-specific rates, volume discounts, or markup adjustments. Traditional systems offer a single "price" field — any adjustment requires manual calculation of markup, discount, and final amounts, leading to:
- Pricing errors on client-facing invoices
- Time wasted calculating markup/discount by hand
- No audit trail connecting the original cost book rate to the final billed rate
- Inability to quickly answer "what's the discount on this line?" during client negotiations

## Solution
A full bidirectional pricing modal on every invoice line item with six editable fields that stay in sync:

1. **Original $/unit** — cost book rate (auto-populated from cost book, editable)
2. **Edited $/unit** — the adjusted base rate (e.g., client contract rate of $25/hr)
3. **Markup %** — applied on top of edited rate (e.g., 25% → $25 becomes $31.25)
4. **Final Bill $/unit** — the actual rate on the invoice (computed or directly editable)
5. **Discount $/unit** — difference between original and final (computed or editable)
6. **Discount %** — percentage reduction from original (computed or editable)

Editing any one field triggers a recalculation cascade:
- Edit the **Edited** rate → Final = Edited × (1 + Markup%) → Discount = Original − Final
- Edit the **Final** rate → Edited = Final ÷ (1 + Markup%) → Discount recalcs
- Edit the **Discount $** → Final = Original − Discount → Edited back-calculates
- Edit the **Discount %** → Final = Original × (1 − Discount%) → Edited back-calculates
- Edit **Markup %** → Final recalcs from Edited → Discount recalcs from Original

A live summary strip shows the full pricing chain: `Edited: $25.00 × (1 + 25.00%) = $31.25 · 128.87 - 31.25 = 97.62 discount`

## Technical Implementation
- **State model**: Six interdependent state variables with `useMemo`-derived computed fields
- **Math helpers**: Four recalc functions (`ilmRecalcFromEditedAndMarkup`, `ilmRecalcFromFinalAndMarkup`, `ilmRecalcFromDiscountPerUnit`, `ilmRecalcFromDiscountPercent`)
- **Persistence**: Saves `costBookUnitPrice`, `adjustedUnitPrice`, `unitPrice`, `discountPercent` to `ProjectInvoiceLineItem`
- **Pre-fill**: When editing an existing line, the modal reverse-engineers all six fields from stored values

## Competitive Advantage
- **vs. Xactimate**: Xactimate has no concept of client-specific rate adjustments or markup on invoice lines
- **vs. QuickBooks/Sage**: These allow line-level pricing but offer no bidirectional calculation or cost book integration
- **vs. BuilderTrend/CoConstruct**: Limited to simple markup % with no discount tracking from original rates

## Key Metrics
- Time to adjust a line item price: ~5 seconds (vs. 30-60 seconds with manual calculation)
- Pricing errors eliminated: full audit trail from cost book → adjusted → markup → final
- Client negotiation support: instant "what if" scenarios by editing any field

## Files
- `apps/web/app/projects/[id]/page.tsx` — Modal state, math helpers (~lines 4268-4435), modal JSX (~lines 17214-17574)
- `apps/api/src/modules/project/dto/project-invoice.dto.ts` — DTO fields for costBookUnitPrice, adjustedUnitPrice, discountPercent
- `packages/database/prisma/schema.prisma` — ProjectInvoiceLineItem fields (lines 2331-2337)

## NexOP Impact
- **Category**: Financial Accuracy — Pricing Integrity
- **Estimated NexOP contribution**: ~0.15%
- **Basis**: Manual markup/discount calculations are error-prone. A 2% pricing error on a $50K invoice = $1,000 undercharge. For a $10M firm issuing 200 invoices/year, even a 5% error rate on 10% of lines = ~$10K–$15K in pricing leakage. Bidirectional recalculation eliminates arithmetic errors entirely.

## Demo Script
1. Open an invoice line item edit modal.
2. Show the 6-field layout: Original, Edited, Markup%, Final, Discount$, Discount%.
3. Change the Edited rate from $128 to $100 → watch Markup, Final, Discount all recalculate.
4. Now change the Discount % to 25% → watch the chain recalculate backwards.
5. Show the live summary strip at the bottom.
6. Key message: *"Edit any field, everything stays in sync. No spreadsheets needed."*

## Future Extensions
- **Batch pricing**: Apply a discount % or markup to all line items in one action.
- **Client rate cards**: Save per-client rate overrides that auto-populate when creating invoices.
- **Pricing history**: Track price changes over time per line item for audit purposes.
- **Smart suggestions**: AI suggests markup based on historical data for similar line items.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-07 | Initial draft |
