---
cam_id: FIN-VIS-0002
title: "Invoice Retail Transparency Display"
mode: FIN
category: VIS
revision: "1.0"
tags: [cam, fin, vis, invoicing, transparency, discount, retail, client-facing]
status: draft
created: 2026-03-07
updated: 2026-03-07
author: Warp
score:
  uniqueness: 5
  value: 7
  demonstrable: 8
  defensible: 4
  total: 24
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# Invoice Retail Transparency Display

## CAM ID
`FIN-VIS-0002`

## Elevator Pitch
Every invoice line item shows the original retail rate alongside the actual billed amount, with discount sub-lines and a Retail → Discounts → Amount Due totals breakdown — giving both internal teams and clients full pricing transparency at a glance.

## Problem
When contractors negotiate discounted rates with clients, the resulting invoices typically show only the final price. This creates problems:
- Clients don't see the value of the discount they're receiving
- Internal teams can't quickly verify that discounts were applied correctly
- There's no visual audit trail connecting cost book rates to final invoiced amounts
- Totals don't break down retail vs. actual, making it hard to quantify total savings

## Solution
A four-column invoice line items table: **Vendor | Retail | Amount | Actions**

### Line-Level Display
- **Main lines**: Retail column shows the original cost book unit price (e.g., $128.87); Amount column shows the actual billed total (e.g., $31.25)
- **Discount sub-lines**: Indented with ↳ glyph, showing the discount amount in red in the Retail column (e.g., -$103.87); Amount column left empty to avoid confusion
- **Credit lines**: Displayed in red with negative formatting

### Totals Breakdown
The footer computes and displays:
1. **Retail Total** — sum of cost book rates × qty (what the client would pay at full retail)
2. **Subtotal** — sum of actual billed amounts
3. **Discounts** — difference between retail and actual (shown in red)
4. **Adjustments** — any explicit credit/discount line items (shown in red)
5. **Amount Due** — net total after all discounts and adjustments

### Data Flow
- `costBookUnitPrice` on each `ProjectInvoiceLineItem` feeds the Retail column
- Lines without a cost book price show blank in Retail (manual/non-cost-book items)
- Discount detection: lines with `kind = CREDIT`, negative amounts, or "discount" in description are treated as sub-lines

## Competitive Advantage
- **vs. Xactimate**: Xactimate invoices show a single price — no retail vs. actual comparison
- **vs. QuickBooks**: No concept of "original rate" on line items; discounts are separate line items with no visual connection
- **vs. Buildertrend**: Markup is applied globally, not visible per-line with retail comparison
- **Unique value**: Clients see exactly how much they're saving, which builds trust and reduces payment disputes

## Key Metrics
- Invoice clarity: clients see retail value, discount, and actual charge on every line
- Dispute reduction: transparent pricing reduces "why is this price different?" calls
- Internal QA: PMs can verify discount accuracy at a glance without cross-referencing cost books

## Files
- `apps/web/app/projects/[id]/page.tsx` — Table rendering (~lines 22960-23230), totals computation (~lines 23145-23222)
- `packages/database/prisma/schema.prisma` — `costBookUnitPrice` field on `ProjectInvoiceLineItem`

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-07 | Initial draft |
