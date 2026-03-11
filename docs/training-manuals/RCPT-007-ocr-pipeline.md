---
title: "Receipt OCR: The Complete Pipeline"
code: RCPT-007
chapter: 3
module: expense-capture
revision: "1.0"
difficulty: 🟡 Intermediate
roles: [FIELD, PM]
tags: [training, expense, ocr, tesseract, gpt4o, pdf, pipeline, construction]
status: complete
created: 2026-03-11
updated: 2026-03-11
author: NEXUS SYSTEM
visibility:
  public: false
  internal: true
  roles: [field, pm, admin]
cam_references:
  - id: FIN-SPD-0001
    title: "Hybrid Receipt OCR Pipeline"
    score: 31
---

# RCPT-007 — Receipt OCR: The Complete Pipeline

🟡 Intermediate · 🏗️ FIELD · 📋 PM

> **Chapter 3: Expense Capture & Receipt Management** · [← Cross-Project Duplicates](./RCPT-006-cross-project-duplicates.md) · [Next Chapter: Invoice Creation →](./INV-001-invoice-creation.md)

---

## Purpose

A deeper look at what happens behind the scenes when you upload a receipt — the three processing paths, format-specific handling for construction vendors, and quality validation.

## Who Uses This

- **Field crews** — understand why some receipts process in 3 seconds and others take 15
- **PMs** — troubleshoot OCR results that seem incorrect

## The Three Processing Paths

| Input Type | Path | Speed | Accuracy |
|-----------|------|-------|----------|
| Clear phone photo | Tesseract.js (local) → Grok (fast AI) | ~3 seconds | High |
| Blurry/damaged photo | Tesseract.js (fails) → GPT-4o Vision | ~15 seconds | High (vision fallback) |
| PDF receipt (email) | pdf-parse text extraction → Grok (fast AI) | ~2 seconds | Highest |

## Construction-Specific Features

- **Home Depot format recognition** — correct parsing of HD Pro Xtra receipts with job names, tax exempt numbers, and military discounts
- **Lowe's format recognition** — handles Lowe's-specific line formatting
- **Multi-receipt merge** — upload multiple receipts; line items from all receipts appear in a single combined view
- **Per-item checkbox exclusion** — uncheck personal items (snacks, drinks) so they don't count toward the project total
- **Credit deduction** — enter credit amounts that reduce the net total
- **Live net total** — updates instantly as you include/exclude items

## Powered By — CAM Reference

> **FIN-SPD-0001 — Hybrid Receipt OCR Pipeline** (31/40 ⭐ Strong)
> *Why this matters:* The 3-second vs. 30-second difference is not a minor optimization — it's the difference between a crew member scanning receipts at every stop and giving up after the second one. Tesseract.js runs entirely in the browser for text extraction (~1 second), then a fast AI model structures the output (~2 seconds). The vision API fallback handles edge cases. This three-path architecture (photo/PDF/damaged) is unique in construction tech. 10× speed improvement, 10× cost reduction vs. cloud-only OCR.

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — extracted from Module Master Class |
