---
title: "Inline Receipt OCR SOP"
module: inline-receipt-ocr
revision: "2.0"
tags: [sop, receipt-ocr, daily-log, mobile, accounting, field, line-items, credit]
status: draft
created: 2026-02-21
updated: 2026-03-03
author: Warp
visibility:
  public: false
  internal: true
  roles: [all]
---

# Inline Receipt OCR

## Purpose
Enables field crews and project managers to photograph one or more receipts, have vendor name, amount, date, and individual line items automatically extracted via OCR — then selectively include/exclude items and apply credit deductions before saving the expense log.

## Who Uses This
- All field crew members capturing receipts on-site
- Project Managers reviewing and adjusting expense logs
- Accounting staff who process reimbursements and verify line-level detail

## Workflow

### Step-by-Step Process — Creating a Receipt Log

1. Open a project and navigate to **Daily Logs**
2. Click **New Daily Log** and select type **Receipt / Expense**
3. Attach one or more receipt images using the file picker or drag-and-drop
4. The system displays **"Running OCR on N receipt(s)..."** as each image is scanned
5. On success, the following auto-fill:
   - **Vendor** — first detected vendor name across all receipts
   - **Amount** — sum of all line items from all receipts
   - **Date** — earliest receipt date detected
   - **Title** — auto-generated as "Expense - Vendor $Amount"
   - **Line Items** — all extracted items appear in a checkbox table
6. **Review line items:**
   - Every item is pre-checked (included)
   - Uncheck any item to exclude it from the total (e.g., personal purchase, duplicate, return)
   - Excluded items show with strikethrough and dimmed styling
7. **Apply a credit/deduction** (optional):
   - Enter a flat dollar amount in the "Credit / Deduction" field
   - The credit is subtracted from the selected-items subtotal
8. The **Amount** field auto-updates to: `sum(selected items) − credit`
9. The green summary bar shows: `X of Y items selected − $Z.ZZ credit → Net: $N.NN`
10. Add any notes, then click **Create Daily Log**

### Step-by-Step Process — Editing an Existing Receipt Log

1. Open the receipt log via **View** (👁) or **Edit** button
2. The system automatically fetches OCR line items from the server
3. In edit mode:
   - Toggle item checkboxes to include/exclude
   - Adjust the credit/deduction amount
   - The expense amount recalculates live
4. Click **Save Changes** — exclusions and credit are persisted

### Adding More Receipts to an Existing Log

1. Open the receipt log in edit mode
2. Use the drag-and-drop zone or file picker to attach additional receipt images
3. Run OCR via the **🔍 Run OCR** button
4. New line items are appended to the existing list
5. Review, adjust selections, and save

### Flowchart

```mermaid
flowchart TD
    A[Open Project → Daily Logs] --> B[New Daily Log → Receipt / Expense]
    B --> C[Attach Receipt Photo(s)]
    C --> D{Images Attached?}
    D -->|No| C
    D -->|Yes| E["OCR scans each image"]
    E --> F{Any Scan Successful?}
    F -->|Yes| G[Auto-fill Vendor, Date, Title]
    F -->|No| H["⚠️ Files attached — manual entry needed"]
    G --> I[Line Items Table Appears]
    I --> J{Review Items}
    J --> K[Uncheck items to exclude]
    J --> L[Enter credit/deduction]
    K --> M[Amount auto-recalculates]
    L --> M
    M --> N["Net total displayed in summary bar"]
    N --> O[Submit Daily Log]
    H --> O

    subgraph Multi-Receipt
        C2[Attach 2nd Receipt] --> E2[OCR on new image]
        E2 --> I2[Line items appended]
        I2 --> J
    end
```

## Key Features
- **Multi-receipt support** — attach multiple receipt images; each is OCR'd independently and line items merge into a single view
- **Line item selection** — checkbox table showing description, qty, unit price, and amount for every extracted item
- **Credit / deduction** — flat dollar credit field that reduces the net total (e.g., for returns, store credits, coupons)
- **Live net total** — green summary bar updates instantly as items are toggled or credit is changed
- **Source file tracking** — when items come from multiple receipts, a small label shows which file each item came from
- **GPT-4 Vision powered** — handles receipts at various angles, lighting conditions, and print quality
- **Confidence scoring** — each scan returns a confidence percentage
- **Auto-title** — generates "Expense - Vendor $Amount" when vendor is detected
- **Graceful fallback** — if OCR fails, fields remain editable for manual entry; the log is never blocked
- **Edit/view modal support** — OCR line items lazy-load when opening an existing receipt log; exclusions and credit persist across saves

## Technical Details

### API Endpoints
- `POST /projects/:projectId/daily-logs/ocr` — runs OCR on a project file, returns vendor, amount, date, lineItems, confidence
- `GET /daily-logs/:logId/ocr-line-items` — returns merged line items from all OCR results for a daily log, plus current exclusion and credit state
- `POST /projects/:projectId/daily-logs` — create daily log (accepts `excludedLineItems[]` and `creditAmount`)
- `PATCH /daily-logs/:logId` — update daily log (accepts `excludedLineItems[]` and `creditAmount`)

### Data Model
- `ReceiptOcrResult` — one per receipt image per daily log (1:many relationship)
- `DailyLog.excludedLineItemsJson` — JSON array of excluded item indices
- `DailyLog.creditAmount` — Decimal, flat credit/deduction amount
- `DailyLog.expenseAmount` — net total after exclusions and credit

### Multi-Receipt Merge Logic
- **Vendor:** first non-empty vendor detected (across receipts in upload order)
- **Date:** earliest date detected
- **Amount:** sum of all receipt totals (before exclusions/credit)
- **Line items:** concatenated from all receipts, tagged with source `ocrResultId` and `lineItemIndex`

### Architecture
- **Frontend** (`apps/web/app/projects/[id]/page.tsx`)
  - OCR handler loops ALL image files in an upload batch
  - `NewDailyLogState.ocrLineItems[]` tracks items with `included: boolean`
  - Edit/view modals use `modalOcrLineItems` state with lazy-fetch from API
- **API** (`apps/api/src/modules/ocr/receipt-ocr.service.ts`)
  - `getMergedLineItemsForDailyLog()` aggregates across all `ReceiptOcrResult` records
- **OCR Provider** (`apps/api/src/modules/ocr/openai-ocr.provider.ts`)
  - GPT-4 Vision with receipt extraction prompt
- **Module Registration** — `OcrModule` is imported directly in `AppModule`

### Supported Image Formats
- JPEG, PNG, WebP, GIF
- Maximum file size: 10 MB per image

## Important Notes
- **Not a replacement for review** — OCR is assistive; users should always verify extracted amounts before submitting
- **Confidence threshold** — scores below 50% typically mean poor image quality; retake the photo if possible
- **Index-based exclusions** — exclusions are stored by item index position; if OCR results were somehow reprocessed, exclusion mappings would need to be verified (rare since OCR results are append-only)
- **Tax handling** — tax is extracted by OCR but not separately tracked in the exclusion/credit system yet; the full receipt total includes tax
- **Offline behavior** — if the scan fails or times out, the daily log creation is NOT blocked; users simply enter data manually
- **Privacy** — receipt images are sent to OpenAI's API for processing; do not scan receipts containing sensitive personal information unrelated to the project

## Related Modules
- [Daily Logs]
- [Receipt / Expense Tracking]
- [Receipt Inventory Bridge (auto-bill creation)]
- [Offline Sync & Outbox (Mobile)]
- [Mobile Photo Capture]

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-21 | Initial release — inline OCR with GPT-4 Vision, dual-screen support, offline fallback |
| 2.0 | 2026-03-03 | Major update — multi-receipt OCR, line item selection with checkboxes, credit/deduction field, net total auto-calc, edit/view modal support, merged line items API endpoint |
