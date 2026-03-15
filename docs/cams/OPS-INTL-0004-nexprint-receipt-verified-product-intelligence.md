---
cam_id: OPS-INTL-0004
title: "NexPRINT — Receipt-Verified Product Intelligence"
mode: OPS
category: INTL
revision: "2.0"
status: draft
created: 2026-03-15
updated: 2026-03-15
author: Warp
website: false
scores:
  uniqueness: 9
  value: 9
  demonstrable: 10
  defensible: 8
  total: 90
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator, accounting]
tags: [cam, ops, intelligence, procurement, materials, receipt, fingerprint, learning, cost-book, price-drift, bank-confirmation, product-knowledge]
parent_cam: OPS-INTL-0003
supersedes: null
nexstack_layer: product-intelligence
---

# OPS-INTL-0004: NexPRINT — Receipt-Verified Product Intelligence

> *"Web descriptions guess. Receipts know. Every purchase makes the next one smarter."*

---

## The Core Insight

Construction companies generate the richest product data in the industry — and throw it away. Every receipt contains verified SKUs, exact quantities, real prices paid, and vendor identity. Every HD Pro Xtra CSV has department codes, category breakdowns, and store numbers. Every bank transaction confirms the total was real.

Other systems use this data once (to record an expense) and discard the intelligence. NexPRINT treats every purchase as a permanent contribution to a compounding product knowledge base — a **Product Fingerprint Repository** that makes every future procurement decision faster, more accurate, and cheaper.

---

## How It Works

### The Product Fingerprint

A ProductFingerprint is the system's memory of a specific product at a specific supplier. It accumulates data from every source:

```
┌──────────────────────────────────────────────────────────────┐
│              ProductFingerprint: HD SKU 524187                │
│                                                              │
│  Identity:                                                   │
│    Supplier: Home Depot | SKU: 524187/817229                 │
│    Title: R13 Kraft Faced 15 in. x 32 ft. Insulation Roll   │
│    Brand: Owens Corning | Model: 817229                      │
│                                                              │
│  Coverage (ground truth):                                    │
│    40 SF/roll | Confidence: RECEIPT-VERIFIED                 │
│    Source: Confirmed across 3 purchases, bank-matched        │
│                                                              │
│  Pricing:                                                    │
│    Last web price: $27.97 (CBA scan 2026-03-15)             │
│    Last purchase price: $27.97 (receipt 2026-03-12)          │
│    Avg purchase price: $27.42 (across 7 purchases)           │
│    Price drift: 0% ✓                                         │
│                                                              │
│  Purchase history:                                           │
│    7 purchases | 42 rolls total | 3 projects                │
│    Last purchased: 2026-03-12 at HD #0409 Phoenix            │
│    Bank confirmed: ✓ Chase ****4821, $390.14                 │
│                                                              │
│  Cost book: Synced → CompanyPriceListItem #cjk29f            │
│             $27.97/roll, 40 SF/roll, sourceVendor: homedepot │
└──────────────────────────────────────────────────────────────┘
```

### The Four Ingestion Paths

**Path A: Receipt OCR** (automatic, after every purchase)
When a receipt is promoted via `receipt-inventory-bridge.service.ts`, each OCR line item with a SKU creates or updates a fingerprint. The receipt provides: exact price paid, exact quantity, vendor identity, store location, purchase date. This is the highest-trust automated signal.

**Path B: HD Pro Xtra CSV Import** (batch, periodic)
HD Pro Xtra CSVs imported as `ImportedTransaction` rows contain the richest single-source data: SKU, unit price, quantity, department code, category, subcategory, store number, transaction reference. This maps directly to construction cost categories.

**Path C: CBA Web Scraping** (automatic, during procurement)
When the CBA pipeline runs, SerpAPI returns product specs, stock quantities, images, and URLs. This data enriches fingerprints with web-side intelligence — but at lower confidence than purchase data. Web data never overwrites receipt-verified data.

**Path D: Bank Transaction Confirmation** (automatic, when reconciled)
When a BankTransaction is reconciled to a project that has a matching receipt (±$0.50 amount tolerance, same vendor, same date ±2 days), the fingerprint gets `bankConfirmed = true`. This is the ultimate trust signal — the purchase is confirmed by an independent financial institution.

### Confidence Hierarchy

Fingerprints accumulate confidence. Higher sources never get overwritten by lower:

```
VERIFIED        ← Admin manual override (god-tier)
BANK_CONFIRMED  ← Receipt + bank transaction match
RECEIPT         ← OCR line item with SKU
HD_PRO_XTRA    ← CSV import (structured data)
HIGH            ← Spec-sheet extraction (web)
MEDIUM          ← Title dimension parsing (web)
LOW             ← Material heuristic (web)
```

### The CBA Integration — Tier 0

Before the coverage extractor runs its 3-tier analysis (spec-sheet → title → heuristic), it now checks the fingerprint repository:

```
For each product in CBA search results:
  1. Tier 0: Fingerprint lookup (companyId + supplier + productId)
     → If RECEIPT/VERIFIED confidence → use directly, skip extraction
     → If HIGH (web) confidence → use as cache, skip extraction
     → If no fingerprint → proceed to Tiers 1-3
  2. Tier 1: Spec-sheet extraction (existing)
  3. Tier 2: Title dimension parsing (existing)
  4. Tier 3: Material heuristics (existing)
  5. Post-extraction: warm fingerprint if HIGH+ confidence
  6. Log extraction attempt to telemetry
```

The fingerprint lookup is O(1) — a single DB query by unique index. No regex, no parsing, no API calls. For a product the company has bought before, coverage resolution is instantaneous and verified.

### Cost Book Auto-Sync

When a fingerprint reaches RECEIPT or higher confidence:

1. Look up existing CompanyPriceListItem by `sku` + `sourceVendor`
2. If found → update `unitPrice`, `coverage`, `sourceDate`
3. If not found → create new entry with `sku`, `sourceVendor`, `unitPrice`, `unit`, `coverage`
4. Log the sync as a `TenantPriceUpdateLog` entry with `source: "NEXPRINT_RECEIPT"`

The cost book becomes a living document that updates itself from real purchases. PMs reviewing the cost book see prices that reflect what the company actually pays — not what Xactimate says or what a website showed last month.

### Cron: Daily Accuracy Reassessment

A daily cron job (`@Cron('0 2 * * *')`) reviews the fingerprint repository:

**Price drift detection:**
- Compares `lastKnownWebPrice` vs `lastPurchasePrice` for all fingerprints with purchases in the last 90 days
- Drift > 10% → flag for review, log warning
- Drift > 25% → downgrade web-sourced confidence (might be a different product/packaging now)

**Stale fingerprint cleanup:**
- Fingerprints with no purchases in 180 days and no CBA hits in 90 days → mark inactive
- Never delete — historical purchase data has audit value

**Daily digest:**
- "X new fingerprints from yesterday's purchases"
- "Y products with price drift > 10%"
- "Z cache hits in CBA runs (N% hit rate)"

---

## The Data Flywheel

This is the key competitive dynamic:

```
 ┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
 │  Purchase    │─────→│  Fingerprint     │─────→│  Smarter CBA    │
 │  (receipt)   │      │  Repository      │      │  (Tier 0 cache) │
 └─────────────┘      └──────────────────┘      └────────┬────────┘
                              │                           │
                              │                           │
                              ↓                           ↓
                       ┌──────────────┐           ┌──────────────┐
                       │  Cost Book   │           │  Better      │
                       │  Auto-Sync   │           │  Recommendations
                       └──────────────┘           └──────┬───────┘
                                                         │
                                                         ↓
                                                  ┌──────────────┐
                                                  │  More        │
                                                  │  Purchases   │──→ (loop)
                                                  └──────────────┘
```

**Month 1**: CBA runs on web scraping alone. Coverage extraction works ~80% of the time. Some products get wrong quantities.

**Month 3**: 200+ fingerprints from receipts. CBA Tier 0 cache hits ~40% of common materials. Wrong quantities drop to near-zero for repeat purchases. Cost book has real supplier-tagged prices.

**Month 6**: 500+ fingerprints. Tier 0 hits ~65%. Price drift alerts catch packaging changes before they corrupt estimates. The cost book is the most accurate in the company's history.

**Month 12**: 1000+ fingerprints. The system knows the exact product, coverage, price, and vendor for nearly every material the company buys regularly. CBA recommendations are based on actual purchase data, not web guesses. New employees get institutional purchasing knowledge on day one.

**The flywheel accelerates** because more accurate recommendations → fewer wrong purchases → more trusted system → more usage → more data → more accuracy.

---

## Why This Is Different From Competitors

### What Competitors Do
- Cache web search results (24-hour TTL, no verification)
- Show "price history" from their own search cache (not purchase history)
- Require manual cost book updates
- No receipt → procurement feedback loop

### What NexPRINT Does
- Builds permanent product knowledge from verified purchases
- Bank-confirms every fingerprint for maximum trust
- Auto-populates cost book with real SKUs and supplier tags
- Every purchase trains the system for next time
- Price drift detection catches market changes and packaging changes
- Extraction telemetry reveals systematic failures for algorithm improvement

### The Structural Moat
NexPRINT requires four existing NexSTACK layers to function:
1. **Receipt OCR** (FIN-AUTO-0001) — extracts line items with SKUs
2. **Banking integration** (Plaid/CSV) — confirms purchase amounts
3. **NexCART** (OPS-INTL-0002) — the procurement pipeline that uses fingerprints
4. **Cost Book** (NexPRICE) — the destination for auto-synced pricing

A competitor building "product intelligence" without these layers gets a glorified web cache. The receipt → bank → fingerprint → cost book → CBA loop is what creates compounding value.

---

## Scoring Rationale

### Uniqueness: 9/10
No construction platform builds a product knowledge base from receipt OCR + bank confirmation. The concept of "receipt-verified coverage" — where the system knows a product's true coverage because the company has *bought it before and confirmed the quantity* — is novel. The closest analog is Amazon's "customers also bought" but applied to construction materials with dimensional verification.

### Value: 9/10
Eliminates the #1 CBA failure mode (wrong coverage → wrong quantities → wasted trips or material shortages). Auto-populates the cost book — a task that typically requires a dedicated estimator spending 2-4 hours/week maintaining prices. Price drift detection catches market changes before they corrupt estimates. The compounding nature means value increases with every month of usage.

### Demonstrable: 10/10
The demo flow: Run CBA on insulation → system guesses from web (correct but slow). Buy the insulation, scan receipt. Run CBA again next month → instant Tier 0 hit, verified coverage, no extraction needed. Show the fingerprint card with purchase history, bank confirmation, and cost book sync. Show the price drift alert when a product changes packaging. **New in 2.0:** The mobile CBA results now show color-coded confidence badges inline (green for verified, purple for receipt, orange for HD Pro Xtra) with mini price sparklines. Tapping any badge opens a full product intelligence sheet with stats, price history chart, and transaction log. This is an instant "wow" in any live demo.

### Defensible: 8/10
The individual components (OCR, web scraping, caching) are replicable. But the four-source ingestion pipeline (receipt + HD CSV + web + bank) and the confidence hierarchy create a system that's hard to assemble from parts. The data flywheel is the real moat — a company with 12 months of purchase data has a fingerprint repository that a new system can't replicate. Scored 8 instead of 9 because the technical implementation is achievable for a well-funded competitor with the same NexSTACK foundation.

**Total: 36/40**

---

## Expected Operational Impact

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **Eliminated wrong-quantity purchases** | ~0.25% | Tier 0 prevents coverage extraction errors on repeat products |
| **Cost book accuracy gains** | ~0.20% | Real purchase prices in cost book → more accurate estimates |
| **Price drift prevention** | ~0.15% | Catching packaging/pricing changes before they corrupt bids |
| **Procurement time savings** | ~0.10% | Instant Tier 0 vs. 2-3 second web extraction per product |
| **Institutional knowledge retention** | ~0.10% | New PMs inherit the fingerprint repository; purchasing knowledge survives turnover |
| **Total NexPRINT Impact** | **~0.80%** | **Compounding product intelligence as a share of revenue** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | NexPRINT Impact (~0.80%) |
|---------------|--------------------------|
| **$1M** | **~$8,000** |
| **$2M** | **~$16,000** |
| **$5M** | **~$40,000** |
| **$10M** | **~$80,000** |

Note: These figures assume Month 6+ operation where the fingerprint repository has meaningful coverage. Month 1 impact is near zero; the value is in the compounding.

---

## Related Modules

- **OPS-INTL-0003** (NexCBAML) — the CBA engine that consumes fingerprints for Tier 0 coverage
- **OPS-INTL-0002** (NexCART) — the procurement pipeline that triggers fingerprint ingestion
- **FIN-AUTO-0001** (Inline Receipt OCR) — the receipt data source
- **FIN-INTL-0003** (NexPRICE) — regional pricing intelligence that benefits from verified purchase prices
- **FIN-ACC-0002** (Zero-Loss Receipt Capture) — ensures receipts are captured, which feeds fingerprints
- **EST-ACC-0003** (NexUNIT) — the coverage extractor that fingerprints accelerate/verify

---

## Technical Implementation Summary

**New schema models:**
- `ProductFingerprint` — (companyId, supplierKey, productId) unique. Stores identity, coverage, pricing, purchase history, bank confirmation, web enrichment.
- `CoverageExtractionLog` — telemetry for every CBA extraction attempt.
- `ProductPriceHistory` — rolling price observations from all sources.

**New service:** `ProductIntelligenceService` (~750 lines)
- `lookupFingerprint()` — Tier 0 cache check (O(1) unique index)
- `recordCbaExtraction()` — Path 3 post-extraction warming
- `ingestFromReceipt()` — Path 1 receipt OCR ingestion
- `ingestFromHdProXtra()` — Path 2 HD CSV ingestion
- `confirmWithBankTransaction()` — Path 4 confidence upgrade
- `confirmByImportedTransactions()` — Path 4b batch upgrade via imported txn IDs
- `enrichFingerprints()` — batch enrichment for mobile UI
- `syncToCostBook()` — auto-sync to CompanyPriceListItem (>2% price change threshold)
- `runDriftDetection()` — `@Cron('0 2 * * *')` daily drift + stale cleanup
- `logExtraction()` — telemetry fire-and-forget

**Integration points (all fire-and-forget, non-blocking):**
- `receipt-inventory-bridge.service.ts` → `ingestFromReceipt()` after promotion
- `procurement.service.ts` → Tier 0 lookup + post-extraction warming + telemetry
- `csv-import.service.ts` → `ingestHdBatchToNexprint()` after HD Pro Xtra bulk insert + NexPRICE sync
- `purchase-reconciliation.service.ts` → `confirmByImportedTransactions()` after `linkCreditCardToChecking()`
- `BankingModule` imports `ProcurementModule` for cross-module DI

**API endpoint:**
- `POST /procurement/fingerprints/enrich` — batch fingerprint lookup for mobile UI

**Mobile components (Phase 5):**
- `ConfidenceBadge` — color-coded pill (7 levels: VERIFIED → LOW) with verification count
- `PriceSparkline` — pure React Native mini bar chart (no external deps), last 10 observations
- `ProductIntelligenceSheet` — slide-up modal with price history, stats grid, coverage intelligence, transaction log
- Integrated into `ShoppingListScreen` CBA results (Step 5): auto-enriches items after CBA, shows badges + sparklines, tap opens detail sheet

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 2.0 | 2026-03-15 | Phase 3-5 complete: HD Pro Xtra import hook, bank confirmation hook, cost book auto-sync triggers, daily drift cron verified, mobile UI (ConfidenceBadge, PriceSparkline, ProductIntelligenceSheet), batch enrichment API. Score 35→36 (demonstrability 9→10). |
| 1.0 | 2026-03-15 | Initial release — schema, service, CBA Tier 0 wiring, receipt ingestion hook |
