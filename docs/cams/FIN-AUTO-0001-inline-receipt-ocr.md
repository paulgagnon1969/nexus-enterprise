---
cam_id: "FIN-AUTO-0001"
title: "Inline Receipt OCR — Snap, Scan, Auto-Fill"
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
updated: 2026-02-21
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# FIN-AUTO-0001: Inline Receipt OCR

## Competitive Advantage
Field crews capture dozens of receipts per week across job sites. Nexus Mobile uses GPT-4 Vision to instantly read any photographed receipt and auto-fill the vendor, total amount, date, tax, and line items — right in the daily log form. No manual entry, no separate expense app, no waiting. The scan happens inline while the user is still editing, so they can review and adjust before submitting. If connectivity is poor, the log saves anyway and the user enters data manually — zero data loss.

## What It Does
- Photographs a receipt from camera or photo library on the mobile app
- Uploads to a standalone `POST /ocr/receipt-scan` API endpoint (stateless, no log context required)
- GPT-4 Vision extracts: vendor name, total amount, date, subtotal, tax, currency, payment method, and line items
- Auto-fills the daily log form fields with extracted data in real time
- Returns a confidence score (0–100%) so users know when to double-check
- Auto-generates the log title as "Receipt — {Vendor}" when no title is entered
- Works from both the Projects flow and Home screen Daily Log Create flow

## Why It Matters
- **Construction-specific**: most competitors don't have receipt OCR at all, or require a separate expense management tool (Expensify, Dext, etc.)
- **Zero friction**: field workers take a photo and move on — no typing vendor names on a phone keyboard in the rain
- **Accounting alignment**: extracted amounts flow directly into the daily log system, which feeds project cost tracking
- **AI-powered accuracy**: GPT-4 Vision handles crumpled receipts, odd angles, thermal paper fade, and handwritten amounts far better than traditional OCR
- **Offline-safe**: the scan is assistive, not blocking — if it fails, the log still saves with manual entry

## Demo Script
1. Open a project on Nexus Mobile → tap **Add Daily Log** → select **Receipt / Expense**
2. Tap the camera icon and photograph a receipt (e.g., a Home Depot receipt)
3. Watch the "🔍 Scanning receipt..." indicator appear
4. In 2–5 seconds, vendor, amount, and date fields auto-populate
5. Show the confidence score (e.g., "✅ Found: Home Depot — $127.43 (94%)")
6. Optionally adjust the amount, add notes, and submit
7. Show the same workflow from the Home screen's Daily Log Create flow
8. Demonstrate offline behavior: enable airplane mode, take a photo — log saves locally, OCR gracefully skipped

## Technical Differentiators
- Standalone OCR endpoint decoupled from log creation — can be reused for invoices, purchase orders, etc.
- Multipart file upload with Fastify streaming (no temp files, 10 MB limit)
- Base64 encoding for OpenAI Vision API with `detail: high` for receipt text clarity
- Low-temperature (0.1) structured JSON extraction for consistent, parseable results
- Dual auth support: JWT tokens and DeviceSync permanent credentials for field devices

## Expansion Opportunities
- **Invoice OCR** — same endpoint pattern for scanning vendor invoices and purchase orders
- **Batch receipt processing** — scan multiple receipts from photo library in sequence
- **Receipt matching** — auto-match scanned receipts to existing purchase orders or budget line items
- **Approval workflows** — route high-value receipts (>$500) for PM approval before posting to accounting
- **Export to QuickBooks/Sage** — extracted receipt data feeds directly into accounting integrations
