---
title: "Session Export — Multi-Receipt OCR, Line Item Selection & Credit Deductions"
module: receipt-ocr
revision: "1.0"
tags: [session, receipt-ocr, daily-log, line-items, credit, accounting, operations]
status: draft
created: 2026-03-02
updated: 2026-03-03
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, pm, accounting]
---

# Session Export — Multi-Receipt OCR, Line Item Selection & Credit Deductions

## Session Date
2026-03-02

## Summary
Extended the Receipt / Expense daily log system with three major capabilities:
1. **Multi-receipt OCR** — users can upload multiple receipt images, each gets OCR'd independently, and line items merge into a single unified view.
2. **Line item selection** — every OCR'd line item appears with a checkbox (pre-checked). Users uncheck items to exclude them from the receipt total.
3. **Credit / deduction** — a flat dollar credit field that further reduces the net total.

## Problems Solved

### Problem 1: Single-receipt limitation
Previously, each daily log only supported one OCR result. Uploading a second receipt image overwrote the first. The schema enforced a `@unique` constraint on `ReceiptOcrResult.dailyLogId`.

**Fix:** Changed the Prisma schema to allow 1:many (`@@index` instead of `@unique`), updated the `DailyLog` relation to `ocrResults[]`, and built merge logic (sum totals, first vendor wins, earliest date wins).

### Problem 2: No way to remove individual items from a receipt
Users needed to credit back or exclude specific line items (e.g., personal items accidentally included on a project receipt). There was no mechanism for partial receipt deductions.

**Fix:** Added `excludedLineItemsJson` (stores indices of unchecked items) and `creditAmount` (flat deduction) to the `DailyLog` model. The frontend shows a checkbox table; unchecking items or entering a credit automatically recalculates the `expenseAmount`.

### Problem 3: OCR only returned top-level fields
The OCR endpoint returned vendor, amount, and date but didn't surface individual line items to the frontend during creation.

**Fix:** Updated `ocrProjectFile()` to return `lineItems`, `subtotal`, and `taxAmount` in addition to the existing fields. The frontend now accumulates line items from each OCR response.

## Code Changes

### Schema (Prisma)
- `packages/database/prisma/schema.prisma`
  - `ReceiptOcrResult.dailyLogId`: `@unique` → `@@index`
  - `DailyLog.ocrResults`: `ocrResult?` → `ocrResults[]` (1:many)
  - Added `DailyLog.excludedLineItemsJson: String?`
  - Added `DailyLog.creditAmount: Decimal?`
- Migration: `20260302173738_receipt_multi_ocr_line_item_selection`

### API
- `apps/api/src/modules/ocr/receipt-ocr.service.ts`
  - `getOcrResultsForDailyLog()` returns array
  - `getMergedLineItemsForDailyLog()` merges line items across receipts, tagging each with `ocrResultId + lineItemIndex`
  - `updateDailyLogFromOcr()` uses merge logic for multi-receipt
- `apps/api/src/modules/daily-log/daily-log.service.ts`
  - `ocrProjectFile()` returns `lineItems`, `subtotal`, `taxAmount`
  - New `getOcrLineItems()` method
  - `createForProject()` persists `excludedLineItemsJson` and `creditAmount`
  - `updateLog()` handles exclusion and credit changes
  - `handleReceiptExpenseLog()` computes adjusted total (raw − credit)
- `apps/api/src/modules/daily-log/daily-log.controller.ts`
  - New `GET /daily-logs/:logId/ocr-line-items` endpoint
- `apps/api/src/modules/daily-log/dto/create-daily-log.dto.ts` — added `excludedLineItems`, `creditAmount`
- `apps/api/src/modules/daily-log/dto/update-daily-log.dto.ts` — added `excludedLineItems`, `creditAmount`
- `apps/api/src/modules/daily-log/receipt-inventory-bridge.service.ts` — reads from `ocrResults[]` instead of `ocrResult`

### Frontend
- `apps/web/app/projects/[id]/page.tsx`
  - `NewDailyLogState` interface: added `ocrLineItems[]` and `creditAmount`
  - **Create form:** OCR handler processes ALL uploaded image files, accumulates line items, shows checkbox table, credit input, net total summary bar, auto-updates `expenseAmount`
  - **Edit modal:** Lazy-fetches OCR line items from API, shows editable checkbox table + credit, saves exclusions and credit via PATCH
  - **View modal:** Same lazy-fetch, read-only display in view mode, editable in edit mode

### Infrastructure
- Fixed `.gcloudignore`: changed `skills/` to `/skills/` so `apps/api/src/modules/skills/` is not excluded from Cloud Build context

## Decisions Made
- **First vendor wins** for multi-receipt merge (not concatenated)
- **Earliest date wins** when merging multiple receipt dates
- **Index-based exclusion** rather than content-based — simpler, but means reordering OCR results would invalidate saved exclusions (acceptable since OCR results are append-only)
- **Credit is a flat dollar amount** (not percentage) per user request
- **Tax handling deferred** — user chose to skip tax allocation for now

## Production Deployment
- Migration applied to prod DB via Cloud SQL Proxy
- API deployed: `nexus-api-01097-bdb`
- Worker deployed: `nexus-worker-00108-2jm`
- Health check confirmed: `{"ok":true}`
