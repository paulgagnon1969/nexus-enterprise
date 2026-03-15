---
cam_id: FIN-VIS-0003
title: "Invoice Tracker + AutoPayUpdate Workflow"
mode: FIN
category: VIS
revision: "1.0"
tags: [cam, fin, vis, invoicing, tracking, autopay, stripe, workflow, admin]
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
scores:
  uniqueness: 8
  value: 8
  demonstrable: 9
  defensible: 7
  total: 80
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# Invoice Tracker + AutoPayUpdate Workflow

## CAM ID
`FIN-VIS-0003`

## Work ↔ Signal
> **The Work**: Every client view, print, download, and online payment is tracked per invoice. Stripe payments auto-create a review flag so Admin+ can confirm before funds are applied.
> **The Signal**: This company knows exactly when a client has engaged with an invoice — and treats every online payment as a reviewable event, not an unaudited auto-apply. (→ Reputation: financial control + client engagement intelligence)

## Elevator Pitch
Real-time invoice engagement tracking tells admins how many times a client viewed, printed, or downloaded an invoice. When a client pays online (ACH or CC via Stripe), the payment is recorded and a workflow item flags Admin+ users to review and confirm the auto-applied payment — closing the loop between client action and internal financial control.

## Problem
Contractors send invoices but have zero visibility into what happens next:
- Did the client even open the invoice? How many times?
- Did they print it (a strong buy signal)?
- When an online payment arrives via Stripe, it's applied automatically — no human reviews it, no one verifies the amount matches the intent, and there's no audit trail of the confirm/reject decision.
- Admins learn about payments reactively (bank statement, client call) instead of proactively.

## Solution

### Invoice Activity Tracking
Every client interaction with an invoice is logged to a new `InvoiceActivity` model:
- **VIEW** — recorded when a client opens the invoice detail page (deduplicated per actor per hour to avoid inflating counts)
- **PRINT** — fired when the client clicks the Print button
- **DOWNLOAD** — fired when the client downloads an invoice attachment
- **PAYMENT_SUCCEEDED** — recorded by the Stripe webhook when a payment intent succeeds

Actor types distinguish `CLIENT` (authenticated portal user) from `SYSTEM` (Stripe webhook). Metadata captures IP, user agent, payment method, and amount.

### AutoPayUpdate Workflow
When `handleInvoicePaymentSucceeded()` processes a Stripe webhook:
1. A `ProjectPayment` is created (existing behavior).
2. A `PAYMENT_SUCCEEDED` activity event is recorded.
3. An `AutoPayReview` record is created with status `PENDING`.
4. A `Notification` (kind: `AUTO_PAY_UPDATE`) is sent to every Admin+ user in the company.

Admin+ users see the pending review in the Invoice Tracker card and can:
- **Confirm** — marks the payment as verified, closes the workflow item.
- **Reject** — flags the payment for further investigation, with an optional note.

### Invoice Tracker UI (Admin+ Only)
A collapsible card on the project Financial tab, positioned above the Payments section:
- Header: `📊 Invoice Tracker · N invoices tracked`
- Table: one row per issued invoice with columns for Views (unique/total), Last Viewed, Printed, Online Payment, AutoPay Status
- Pending items show a banner: `⚡ N auto-payment(s) need review`
- Inline confirm/reject controls with optional note field

### Client Portal Integration
Fire-and-forget tracking calls from the client portal:
- VIEW: tracked automatically on invoice detail page load (server-side)
- PRINT: `POST /projects/portal/:id/invoices/:invoiceId/track` with `{ event: 'PRINT' }` before `window.print()`
- DOWNLOAD: same endpoint with `{ event: 'DOWNLOAD' }` on attachment click

## Competitive Advantage
- **vs. Xactimate**: No invoice engagement tracking whatsoever; payments are manual entry only
- **vs. QuickBooks**: Tracks "viewed" status (binary) but no view count, no print/download tracking, no payment review workflow
- **vs. Buildertrend**: Online payments auto-apply with no admin review step; no per-invoice engagement analytics
- **vs. ServiceTitan**: Has payment tracking but no client engagement heatmap (views/prints per invoice)
- **Unique value**: Combines engagement intelligence + payment verification workflow in a single view — admins see both "did they look at it?" and "did they pay it?" with a human-in-the-loop confirm step

## Key Metrics
- Client engagement visibility: view count, unique viewers, print events per invoice
- Payment verification: 100% of online payments flagged for admin review before final close
- Time-to-confirm: average time between Stripe payment and admin confirmation
- Engagement-to-payment correlation: track how many views precede a payment (predictive signal)

## Files
- `packages/database/prisma/schema.prisma` — `InvoiceActivity`, `AutoPayReview` models, enums
- `apps/api/src/modules/project/invoice-activity.service.ts` — Activity recording + tracker aggregation
- `apps/api/src/modules/project/invoice-payment.service.ts` — AutoPayReview creation on Stripe payment success
- `apps/api/src/modules/project/project.controller.ts` — Track, tracker, and review endpoints
- `apps/web/app/projects/[id]/page.tsx` — Invoice Tracker card UI (Admin+ only)
- `apps/web/app/client-portal/projects/[id]/page.tsx` — PRINT/DOWNLOAD tracking calls

## NexOP Impact
- **Category**: Financial Visibility — Payment Intelligence & Verification
- **Estimated NexOP contribution**: ~0.18%
- **Basis**: Client engagement tracking provides a leading indicator of payment likelihood — companies report 10–15% faster collections when they can follow up proactively with clients who viewed but haven't paid. The AutoPay review step prevents silent misapplication of payments. For a $10M firm processing $200K/month in online payments, catching even one misapplied payment per quarter saves $5K–$15K in reconciliation labor and potential write-offs.

## Demo Script
1. Open a project's Financial tab as an Admin user.
2. Show the Invoice Tracker card: "3 invoices tracked."
3. Point to a row: "Invoice #1042 — viewed 5 times by 2 unique viewers, printed once, last viewed 2 hours ago."
4. Show a row with online payment: "$2,500.00 via ACH — AutoPay status: 🟡 Pending Review."
5. Click Confirm: status changes to ✅ Confirmed.
6. Key message: *"You know exactly when your client engaged with the invoice, and every online payment gets a human sign-off before it's finalized."*

## Future Extensions
- **Engagement alerts**: Notify PM when a client views an invoice for the first time (or views it N+ times without paying).
- **Payment reminder automation**: Auto-send a follow-up email if an invoice has been viewed but not paid within X days.
- **Engagement heatmap dashboard**: Company-wide view of invoice engagement across all projects.
- **Client payment portal history**: Show clients their own payment history and engagement timeline.
- **Bulk review**: Admin dashboard to confirm/reject multiple auto-pay items at once.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial draft |
