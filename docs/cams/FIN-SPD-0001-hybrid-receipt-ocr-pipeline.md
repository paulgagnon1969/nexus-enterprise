---
cam_id: FIN-SPD-0001
title: "Hybrid Receipt OCR Pipeline — Tesseract Fast Path with AI Fallback"
mode: FIN
category: SPD
revision: "1.0"
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
website: false
scores:
  uniqueness: 8
  value: 7
  demonstrable: 9
  defensible: 7
  total: 31
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, financial, speed, ocr, tesseract, hybrid, receipt, performance, pdf]
---

# FIN-SPD-0001: Hybrid Receipt OCR Pipeline

> *3 seconds, not 30. Local text extraction + AI structuring — with vision fallback for damaged receipts.*

## Work ↔ Signal
> **The Work**: Tesseract.js extracts text locally in ~1 second, then a fast AI model structures it — total ~3 seconds per receipt. 10× faster, 10× cheaper than cloud-only OCR.
> **The Signal**: Faster OCR means higher capture rates in the field — more receipts processed means more supplier data, more pricing data, and a more complete financial record. (→ Reputation: documentation throughput)

## Elevator Pitch
Nexus uses a two-stage hybrid OCR pipeline that delivers receipt extraction results in ~3 seconds instead of 30–45. Stage 1 runs Tesseract.js locally to extract raw text from the receipt image — no external API call. Stage 2 sends that text to a fast AI model (Grok) for structured parsing. If the image is too damaged for Tesseract, it falls back to GPT-4o vision. The result: instant-feeling receipt capture that doesn't block field workers, with accuracy that handles crumpled thermal paper, Home Depot multi-item formats, and PDF digital receipts.

## What It Does
- **Fast path (~3 sec)**: Tesseract.js extracts text locally → Grok text model parses into structured JSON
- **Vision fallback (~15-30 sec)**: If Tesseract gets insufficient text (<30 chars), falls back to GPT-4o vision API with the full image
- **PDF receipts**: Text extracted via pdf-parse → same AI structuring pipeline (no vision needed)
- **Image preprocessing**: EXIF auto-rotation + resize to 1500px via sharp before any processing
- **Smart prompts**: Format-specific rules for Home Depot (MAX REFUND VALUE, N@price quantities, military discount, store tags), with anti-hallucination checks
- **Post-processing validation**: Line items cross-checked against receipt total; confidence reduced if divergence detected

## Why It Matters
- **10x speed improvement**: 3 seconds vs 30–45 seconds per receipt. Field workers upload receipts constantly — every second matters when you're standing in a hardware store parking lot.
- **No API dependency for text extraction**: Tesseract runs locally in the container. If the AI provider is slow or down, basic text extraction still works.
- **PDF support opens digital receipts**: Email receipts, online order confirmations, and digital invoices can now be OCR'd without vision API costs.
- **Cost reduction**: Text AI calls (Grok) are ~10x cheaper than vision API calls (GPT-4o). The fast path avoids vision entirely for 80%+ of receipts.
- **Construction-tuned accuracy**: Home Depot, Lowe's, and supply house receipt formats have specific patterns (MAX REFUND VALUE, RECALL AMOUNT, N@price) that generic OCR misinterprets. Our prompts handle these natively.

## How It Works

### Architecture

```
Receipt Upload
     │
     ▼
┌─────────────┐
│ Download to  │  (from MinIO/S3)
│ temp file    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ≥30 chars    ┌─────────────┐
│ Tesseract.js│ ──────────────▶  │ Grok Text   │ ──▶ Structured JSON
│ (local OCR) │                  │ Model (fast) │     (~3 sec total)
└──────┬──────┘                  └─────────────┘
       │
       │ <30 chars (damaged/blurry)
       ▼
┌─────────────┐
│ GPT-4o      │ ──▶ Structured JSON
│ Vision API  │     (~15-30 sec)
└─────────────┘
```

### Key Components
1. **`extractTextWithTesseract()`** — Creates a Tesseract.js worker, runs OCR on the preprocessed image, terminates worker. Dynamic require for graceful degradation.
2. **`parseReceiptText()`** — Shared method used by both Tesseract and PDF paths. Sends raw text to Grok with format-specific prompt and JSON schema.
3. **`localFileToBase64()`** — Sharp preprocessing: EXIF rotation, resize to 1500px max, JPEG re-encode at 85% quality.
4. **`validateAndFixResult()`** — Post-processing cross-check: line item sum vs total, duplicate detection, confidence adjustment.
5. **Dual AI clients** — `getClient()` for text (xAI Grok, fast/cheap), `getVisionClient()` for images (OpenAI GPT-4o, accurate).

### Three Input Paths
- **Phone photo** → Sharp preprocess → Tesseract → Grok text → JSON
- **PDF receipt** → pdf-parse text extraction → Grok text → JSON
- **Damaged image** → Sharp preprocess → Tesseract (fails) → GPT-4o vision → JSON

## Demo Script
1. Open a project → **New Daily Log** → **Receipt / Expense**
2. Upload a clear receipt photo (e.g., Home Depot with 10+ items)
3. Point out: results appear in ~3 seconds — vendor, amount, date, all line items
4. Show the line items table: correct quantities (10@$12.68 = $126.80), military discount as negative, tax as separate item, total matches receipt
5. Now upload a crumpled/blurry receipt — takes ~15 seconds (vision fallback) but still succeeds
6. Upload a PDF receipt (email attachment) — results in ~2 seconds (no image processing needed)
7. Show server logs: "Tesseract OCR: 847 chars in 1200ms" → "Fast receipt extracted: vendor=Home Depot, total=$335.14"

## Competitive Landscape

| Competitor | Receipt OCR | Speed | PDF Support | Construction Formats | Offline Text Extract |
|------------|------------|-------|-------------|---------------------|---------------------|
| Procore | Partial | Slow | No | No | No |
| Buildertrend | No | N/A | No | No | No |
| Expensify | Yes | ~5-10s | Yes | No | No |
| Dext | Yes | ~5-10s | Partial | No | No |
| **Nexus** | **Yes** | **~3s** | **Yes** | **Yes** | **Yes (Tesseract)** |

## Scoring Rationale
- **Uniqueness (8/10)**: No construction PM tool uses a hybrid local+AI OCR pipeline. Expense-specific tools (Expensify, Dext) send everything to cloud APIs. The local Tesseract fast path with AI fallback is architecturally novel in this space.
- **Value (7/10)**: 10x speed improvement compounds across hundreds of receipts per month. PDF support eliminates a whole class of "can't OCR this" failures. Cost savings from avoiding vision API calls add up.
- **Demonstrable (9/10)**: Side-by-side comparison is visceral — 3 seconds vs 30 seconds. Upload a photo, count to three, done.
- **Defensible (7/10)**: The individual components (Tesseract, Grok, GPT-4o) are available to anyone. The defensibility is in the orchestration: the fallback logic, construction-specific prompts, format-aware parsing (Home Depot, Lowe's), post-processing validation, and the three-path architecture (photo/PDF/damaged).

**Total: 31/40** — Exceeds CAM threshold (24).

## Related CAMs
- `FIN-AUTO-0001` — Inline Receipt OCR (the base feature this pipeline powers)
- `FIN-ACC-0002` — Zero-Loss Receipt Capture (receipt data quality)
- `OPS-INTL-0001` — NexFIND Supplier Intelligence (receipt vendor data feeds supplier DB)

## Expansion Opportunities
- **On-device Tesseract** — Run Tesseract in the mobile app (React Native) for true offline receipt capture, syncing structured data when back online
- **Worker-based Tesseract pool** — Pre-warm Tesseract workers in the API container to eliminate the ~1s worker creation overhead
- **Receipt format fingerprinting** — Detect vendor format (Home Depot, Lowe's, etc.) from Tesseract text before AI parsing, then use vendor-specific prompt variants
- **Confidence-based routing** — Use Tesseract confidence scores to skip the AI call entirely for high-confidence extractions (simple receipts with clear text)
- **Multi-language OCR** — Add Spanish language support for receipts from bilingual regions

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial draft — Tesseract fast path, PDF support, dual AI clients, format-specific prompts |
