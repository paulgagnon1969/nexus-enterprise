---
title: "Nexus CAM Library — Competitive Advantage Modules"
revision: "1.1"
status: active
created: 2026-03-10
updated: 2026-03-13
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, library, index, portfolio, competitive-advantage]
---

# Nexus CAM Library

> **56 modules. 7 functional areas. NexOP ~6–12% of revenue recovered. NexINT 72% → 95% operational integrity.**

This document is the master index and executive summary of every Competitive Advantage Module in the Nexus platform. It is organized in three tiers:

1. **Table of Contents** — every CAM at a glance, sorted by mode
2. **Executive Summaries** — salient points per CAM (problem, advantage, score, NexOP)
3. **Reference Links** — pointers to individual CAM documents and the portfolio impact analysis

For aggregate financial impact and NexINT integrity scoring, see [CAM-PORTFOLIO-IMPACT.md](./CAM-PORTFOLIO-IMPACT.md).

---

## Strategic Overview — The Nexus of Intent

Every CAM in this manual is a thread in a larger tapestry. The platform's philosophy — the **Nexus of Intent** — holds that every operational action (estimating, logging, invoicing, hiring) is simultaneously an intent signal that feeds marketplace intelligence.

Three entry paths converge into one identity graph:
- **Individuals** self-register with verified skills and credentials → NexNet candidate pool → marketplace discovery
- **Companies** establish sovereign identities with capability portfolios, asset registries, and reputation ledgers built from execution data
- **Clients** are invited with one checkbox during project creation → experience the platform on real data → upgrade to full subscribers

Five cross-tenant collaboration mechanisms form the backbone:
- ProjectCollaboration (5 roles: CLIENT, SUB, PRIME_GC, CONSULTANT, INSPECTOR)
- Dual-User Portal Routing (one identity, every role, across companies)
- Cross-Tenant Person Search & Account Linking (privacy-first hiring)
- NexNet Candidate Pool Sharing (curated talent distribution)
- The Referral Graph (trust as the strongest intent signal)

The 56 CAMs below organize into four layers of the intent system:
- **Discovery & Recruitment** — CLT-INTG-0001 (Sovereign Marketplace), CLT-COLLAB-0001/0002, NexFIND, Phantom Fleet
- **Identity & Reputation** — NexCheck, TUCKS, NexOP, NexINT
- **Operational Execution** — NexPLAN, BOM Pricing, Task Cascading, Auto-Posting
- **Financial Transparency** — NexVERIFY, Zero-Loss Capture, Reconciliation, NexPRICE, Living Membership

**Together they form the Nexus of Intent — the reason NCC doesn't just manage projects… it aligns human intention at enterprise scale.**

For the full system definition, entry path architecture, and executive summary, see [The Nexus of Intent](../architecture/nexus-of-intent.md).

---

## Portfolio Heatmap

Distribution of CAMs by Mode × Category. Numbers indicate CAM count per cell.

```
              AUTO   INTL   INTG   VIS   SPD   ACC   COLLAB   CMP
  FIN          2      2      1      2     1     5      —       —     = 13
  EST          1      2      1      —     1     3      —       —     =  8
  OPS          2      3      1      4     —     1      1       —     = 12
  TECH         2      2      3      2     2     1      1       —     = 13
  CLT          —      1      1      —     —     —      4       —     =  6
  CMP          1      —      1      —     —     —      —       1     =  3
  HR           —      —      —      —     —     —      —       —     =  0
             ───    ───    ───    ───   ───   ───    ───     ───
              8     10      8      8     4    10      6       1     = 55+1 portfolio
```

**Densest cells**: FIN-ACC (5), OPS-VIS (4), CLT-COLLAB (4), TECH-INTG (3), EST-ACC (3), TECH-VIS (2), TECH-INTL (2), TECH-AUTO (2), FIN-AUTO (2), FIN-INTL (2), FIN-VIS (2)

---

## Table of Contents

### Financial (FIN) — 13 CAMs | Module NexOP ~12.22%

| CAM ID | Title | Score | NexOP | Status |
|--------|-------|-------|-------|--------|
| FIN-ACC-0001 | NexVERIFY — Multi-Source Expense Convergence | 34/40 | ~7.50% | draft |
| FIN-ACC-0002 | Zero-Loss Receipt Capture | 36/40 | ~1.65% | draft |
| FIN-ACC-0003 | Cross-Project Duplicate Expense Scanner | 31/40 | ~0.45% | validated |
| FIN-ACC-0004 | Client Rate Adjustment System | 31/40 | — | draft |
| FIN-ACC-0005 | Bidirectional Invoice Pricing Engine | 26/40 | ~0.15% | draft |
| FIN-AUTO-0001 | Inline Receipt OCR | 30/40 | ~0.37% | draft |
| FIN-AUTO-0002 | Transaction-to-Bill Auto-Posting | 32/40 | ~0.75% | draft |
| FIN-INTG-0001 | Living Membership — Modular Commerce | 30/40 | ~0.65% | draft |
| FIN-INTL-0002 | Smart Prescreen Learning Loop | 33/40 | ~0.60% | draft |
| FIN-INTL-0003 | NexPRICE — Regional Pricing Intelligence | 35/40 | ~0.24% | draft |
| FIN-SPD-0001 | Hybrid Receipt OCR Pipeline | 31/40 | — | draft |
| FIN-VIS-0001 | Purchase Reconciliation Audit Chain | 33/40 | ~0.66% | draft |
| FIN-VIS-0002 | Invoice Retail Transparency Display | 24/40 | ~0.12% | draft |

### Estimating (EST) — 8 CAMs | Module NexOP ~4.62%

| CAM ID | Title | Score | NexOP | Status |
|--------|-------|-------|-------|--------|
| EST-ACC-0001 | NexDupE — Cross-Project Duplicate Expense Detection | 32/40 | ~0.35% | draft |
| EST-ACC-0002 | NexCAD Enhanced Video Assessment | 37/40 | — | draft |
| **EST-ACC-0003** | **NexUNIT — Unit Price Discrimination Engine** | **33/40** | **~0.65%** | **draft** |
| EST-AUTO-0002 | NexPLAN — AI-Assisted Selections & Planning | 36/40 | ~0.60% | draft |
| EST-INTG-0001 | Multi-Provider BOM Pricing Pipeline | 32/40 | ~2.99% | draft |
| EST-INTL-0001 | NexBRIDGE Video Index & Re-scan | 32/40 | ~0.18% | draft |
| **EST-INTL-0002** | **ScanNEX Component Identity & Material Intelligence** | **36/40** | **~0.85%** | **draft** |
| EST-SPD-0001 | Redis Price List Caching | 29/40 | ~0.13% | draft |

### Operations (OPS) — 12 CAMs | Module NexOP ~4.21%

| CAM ID | Title | Score | NexOP | Status |
|--------|-------|-------|-------|--------|
| OPS-ACC-0001 | NEXI Capture — Other Category Disposition | 26/40 | ~0.08% | draft |
| OPS-AUTO-0001 | Group Task Cascading Completion | 26/40 | — | draft |
|| **OPS-AUTO-0002** | **NexBUY — Group Shopping Cart & Consolidated Purchase** | **33/40** | **~0.45%** | **draft** |
| OPS-COLLAB-0001 | Phantom Fleet — Personal Asset Sharing | 31/40 | ~0.39% | draft |
| OPS-INTG-0001 | NexFIND Receipt Bridge — Verified Suppliers | 30/40 | ~0.26% | draft |
| OPS-INTL-0001 | NexFIND — Supplier Intelligence Network | 35/40 | ~0.54% | draft |
| OPS-INTL-0002 | NexCART — Intelligent Materials Procurement | 35/40 | ~1.00% | draft |
| **OPS-INTL-0003** | **NexCBAML — Cost-Benefit Analysis Materials Logistics** | **38/40** | **~1.50%** | **draft** |
| OPS-VIS-0001a | Field Qty Discrepancy Pipeline | 28/40 | ~0.61% | draft |
| OPS-VIS-0001b | Intelligent Feature Discovery | 33/40 | — | draft |
| OPS-VIS-0002 | Urgency-Based Task Dashboard | 29/40 | ~0.27% | draft |
| OPS-VIS-0003 | Project & Tenant Scan/Assessment Hub | 32/40 | — | draft |

### Technology (TECH) — 13 CAMs | Module NexOP ~1.51%

| CAM ID | Title | Score | NexOP | Status |
|--------|-------|-------|-------|--------|
| TECH-ACC-0001 | Graceful Sync Fallback | 28/40 | ~0.08% | draft |
| TECH-AUTO-0001 | NexBRIDGE Distributed Compute Mesh | 37/40 | — | draft |
| TECH-AUTO-0002 | Secure Web Portal Campaigns — Reusable CNDA-Gated Distribution | 33/40 | — | draft |
| TECH-INTG-0001a | NexBRIDGE Modular Subscription | 34/40 | — | draft |
| TECH-INTG-0001b | NexCAD Precision Scan → CAD Pipeline | 36/40 | — | draft |
| TECH-INTG-0002 | NexPLAN Distributed Pipeline | 32/40 | — | draft |
| TECH-INTL-0001a | NexEXTRACT Adaptive Intelligence | 35/40 | — | draft |
| TECH-INTL-0001b | TUCKS Telemetry & KPI System | 33/40 | ~1.19% | draft |
| TECH-SPD-0003 | Smart Media Upload | 29/40 | ~0.24% | draft |
| TECH-SPD-0004 | NexBRIDGE Real-Time Update Push | 28/40 | — | draft |
| TECH-VIS-0001 | NexOP — Operating Percentage Metric | 35/40 | — | draft |
| TECH-VIS-0002 | NexINT — Operational Integrity Dashboard | 36/40 | — | draft |
| TECH-COLLAB-0002 | Session Mirror — Remote Dev Oversight from Mobile | 33/40 | — | validated |

### Client Relations (CLT)

| CAM ID | Title | Score | NexOP | Status |
|--------|-------|-------|-------|--------|
| **CLT-INTG-0001** | **NCC Sovereign Marketplace — The Integrated Contractor Economy** | **37/40** | — | **draft (flagship)** |
| CLT-INTL-0001 | NexFIT — Personalized Module Discovery & ROI Engine | 36/40 | — | draft |
| CLT-COLLAB-0001 | Client Tenant Tier — Acquisition Flywheel | 30/40 | — | draft (implemented) |
| CLT-COLLAB-0002 | Dual-User Portal Routing | 29/40 | ~0.15% | draft |
| CLT-COLLAB-0003 | Viral Document Sharing & Graduated Identity System | 35/40 | — | draft |
| CLT-COLLAB-0004 | CAM Portal Viral Referral System | 33/40 | — | draft |

### Compliance (CMP) — 3 CAMs | Module NexOP ~0.60%

| CAM ID | Title | Score | NexOP | Status |
|--------|-------|-------|-------|--------|
| CMP-AUTO-0001 | NexCheck — Site Compliance Kiosk | 34/40 | ~0.40% | draft |
| CMP-CMP-0001 | CNDA+ Gated Access System | 34/40 | — | draft |
| CMP-INTG-0001 | OSHA eCFR Auto-Sync | 33/40 | ~0.20% | draft |

---

## Top 10 CAMs by Score

1. **OPS-INTL-0003** NexCBAML — Cost-Benefit Analysis Materials Logistics — **38/40** ★ New #1
2. **CLT-INTG-0001** NCC Sovereign Marketplace — **37/40** ★ Flagship
3. **EST-ACC-0002** NexCAD Enhanced Video Assessment — **37/40**
4. **TECH-AUTO-0001** NexBRIDGE Distributed Compute Mesh — **37/40**
5. **CLT-INTL-0001** NexFIT Module Discovery & ROI Engine — **36/40**
6. **EST-INTL-0002** ScanNEX Component Identity & Material Intelligence — **36/40** ★ New
7. **FIN-ACC-0002** Zero-Loss Receipt Capture — **36/40**
8. **EST-AUTO-0002** NexPLAN AI-Assisted Selections — **36/40**
9. **TECH-INTG-0001b** NexCAD Precision Scan → CAD — **36/40**
10. **TECH-VIS-0002** NexINT Operational Integrity Dashboard — **36/40**

---

## Executive Summaries

### Financial (FIN)

#### FIN-ACC-0001 — NexVERIFY: Multi-Source Expense Convergence
*"Two sources. One truth. Zero duplicates. Every dollar verified."*

**Problem**: When the same purchase is captured from multiple sources (receipt + CC charge), every other system either misses the duplicate (inflating costs by 2×) or deletes it (losing the audit trail).
**NCC Advantage**: Detects convergence via fuzzy vendor matching (11 merchant families), keeps both records in a linked sibling group, applies a GAAP-clean verification offset that zeros out the duplicate's financial impact while preserving an unbreakable audit chain. Arrival-order-agnostic — doesn't matter which record comes first.
**Score**: 34/40 (U:9 V:9 D:8 Def:8) | **NexOP**: ~7.50% | Highest-impact CAM in the portfolio.

→ [Full CAM](./FIN-ACC-0001-nexverify-multi-source-expense-convergence.md)

#### FIN-ACC-0002 — Zero-Loss Receipt Capture
*"The bill exists before the receipt is even needed."*

**Problem**: The receipt-first model is structurally broken — 15–25% of legitimate receipts are never captured. Three failure points: receipt loss, expense report abandonment, bill creation neglect.
**NCC Advantage**: Inverts the model. The moment a banking transaction is assigned to a project, a bill materializes instantly. The receipt enriches it later — it's evidence, not the trigger. Eliminates all three failure points.
**Score**: 36/40 (U:9 V:10 D:9 Def:8) | **NexOP**: ~1.65% | Highest value score in the portfolio.

→ [Full CAM](./FIN-ACC-0002-zero-loss-receipt-capture.md)

#### FIN-ACC-0003 — Cross-Project Duplicate Expense Scanner
*"One click catches double-billing that manual review misses."*

**Problem**: Same receipt posted to multiple projects inflates costs and distorts profitability. Traditional accounting only checks within a single job.
**NCC Advantage**: Dual-strategy scanner (exact transaction ID match + fuzzy vendor/amount/date) across the entire company. Side-by-side comparison with full receipt images, OCR data, and line items.
**Score**: 31/40 (U:7 V:8 D:9 Def:7) | **NexOP**: ~0.45% | Status: validated.

→ [Full CAM](./FIN-ACC-0003-cross-project-duplicate-expense-scanner.md)

#### FIN-ACC-0004 — Client Rate Adjustment System
*"Full price on record. Agreed rate in practice. Every discount tracked and remembered."*

**Problem**: Negotiated client rates create invisible discounts — the reasoning is lost, consistency across projects is impossible, and margin exposure is unknowable.
**NCC Advantage**: Automatically generates dual invoice lines (full cost book price + companion credit) with reason codes. Client rate memory pre-populates agreed rates on future projects — institutional knowledge survives PM turnover.
**Score**: 31/40 (U:8 V:8 D:8 Def:7)

→ [Full CAM](./FIN-ACC-0004-client-rate-adjustment-system.md)

#### FIN-ACC-0005 — Bidirectional Invoice Pricing Engine
*"Edit any pricing field — everything else recalculates instantly."*

**Problem**: Manual markup/discount calculations on invoices are error-prone and time-consuming. No audit trail from cost book rate to final billed amount.
**NCC Advantage**: Six interdependent pricing fields (original, edited, markup%, final, discount$, discount%) that stay in sync bidirectionally. Edit any one, the rest recalculate.
**Score**: 26/40 (U:6 V:7 D:8 Def:5) | **NexOP**: ~0.15%

→ [Full CAM](./FIN-ACC-0005-bidirectional-invoice-pricing-engine.md)

#### FIN-AUTO-0001 — Inline Receipt OCR
*"Snap a receipt. Every line item extracted. Personal purchases excluded. Net total instant."*

**Problem**: Field crews capture dozens of receipts per week. No construction PM tool offers line-item-level receipt control with AI-powered OCR.
**NCC Advantage**: GPT-4 Vision extracts every line item. Multi-receipt merge, per-item checkboxes to exclude personal purchases, credit deductions, live net total — all inline in the daily log form.
**Score**: 30/40 (U:7 V:8 D:9 Def:6) | **NexOP**: ~0.37%

→ [Full CAM](./FIN-AUTO-0001-inline-receipt-ocr.md)

#### FIN-AUTO-0002 — Transaction-to-Bill Auto-Posting
*"Every dollar assigned to a project becomes a bill — instantly."*

**Problem**: Assigning a transaction to a project and creating a bill are two separate actions in every system. Users do one and forget the other.
**NCC Advantage**: Assignment = bill creation, automatically. Dual-role PM detection — if the assigner is also the PM, the bill skips the approval queue. Eliminates the "assigned but never billed" gap.
**Score**: 32/40 (U:8 V:9 D:8 Def:7) | **NexOP**: ~0.75%

→ [Full CAM](./FIN-AUTO-0002-transaction-to-bill-auto-posting.md)

#### FIN-INTG-0001 — Living Membership: Modular Commerce
*"Pay for what you use. Unlock what you need. No wasted seats, no locked tiers."*

**Problem**: Flat-tier SaaS pricing forces tenants to pay for modules they don't need or locks out modules they do.
**NCC Advantage**: Per-module subscriptions + per-project feature unlocks via Stripe. Self-service billing page with real-time proration. Redis-cached entitlement guards with fail-open safety — billing outages never block field work.
**Score**: 30/40 (U:8 V:8 D:8 Def:6) | **NexOP**: ~0.65%

→ [Full CAM](./FIN-INTG-0001-living-membership-modular-commerce.md)

#### FIN-INTL-0002 — Smart Prescreen Learning Loop
*"Import once. The system learns. Next month, it does the work for you."*

**Problem**: Every imported transaction must be manually assigned to a project. Bookkeeper time sink.
**NCC Advantage**: 6-signal intelligence engine predicts project assignment with a self-improving feedback loop. Accepts, rejects, and overrides compound into higher accuracy — approaching zero-touch for routine purchases by month 3.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | **NexOP**: ~0.60%

→ [Full CAM](./FIN-INTL-0002-smart-prescreen-learning-loop.md)

#### FIN-INTL-0003 — NexPRICE: Regional Pricing Intelligence
*"Crowd-sourced. Regionally normalized. Real purchase prices — not estimates."*

**Problem**: Material prices vary dramatically by region. No centralized, real-time, SKU-level pricing database exists for construction.
**NCC Advantage**: Every tenant's purchases passively feed an anonymized Master Cost Book. Prices are normalized by geographic cost-of-living index (ZIP-level). Network effect data moat — each new tenant makes the data more valuable.
**Score**: 35/40 (U:9 V:9 D:8 Def:9) | **NexOP**: ~0.24% direct + ~2.25% bid accuracy

→ [Full CAM](./FIN-INTL-0003-nexprice-regional-pricing.md)

#### FIN-SPD-0001 — Hybrid Receipt OCR Pipeline
*"3 seconds, not 30. Local text extraction + AI structuring."*

**Problem**: Cloud-only OCR takes 30–45 seconds per receipt. Unacceptable friction for field workers.
**NCC Advantage**: Tesseract.js extracts text locally in ~1s, then a fast AI model (Grok) structures it — total ~3 seconds. Vision fallback for damaged receipts. PDF support. 10× speed improvement, 10× cost reduction.
**Score**: 31/40 (U:8 V:7 D:9 Def:7)

→ [Full CAM](./FIN-SPD-0001-hybrid-receipt-ocr-pipeline.md)

#### FIN-VIS-0001 — Purchase Reconciliation Audit Chain
*"Every dollar traced from checking account to receipt line item."*

**Problem**: A $14K credit card payment is one lump sum on the bank statement. Nobody can drill into the 247 individual charges it covers.
**NCC Advantage**: 5-layer audit chain: checking outflow → CC payment → individual charges → OCR receipt line items → PM-approved project allocation. Auto-classification engine, CC-to-checking linking, per-line receipt disposition, forced PM review gate.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | **NexOP**: ~0.66%

→ [Full CAM](./FIN-VIS-0001-purchase-reconciliation-audit-chain.md)

#### FIN-VIS-0002 — Invoice Retail Transparency Display
*"Clients see the value of every discount — on every line."*

**Problem**: Discounted invoices show only the final price. Clients don't see the value; internal teams can't verify accuracy.
**NCC Advantage**: Four-column invoice table showing original retail rate, billed amount, and discount sub-lines. Footer breaks down Retail → Discounts → Amount Due.
**Score**: 24/40 (U:5 V:7 D:8 Def:4) | **NexOP**: ~0.12%

→ [Full CAM](./FIN-VIS-0002-invoice-retail-transparency-display.md)

---

### Estimating (EST)

#### EST-ACC-0001 — NexDupE: Cross-Project Duplicate Expense Detection
*"Caught, documented, and permanently resolved in 30 seconds."*

**Problem**: Same receipt assigned to multiple projects goes undetected. Double-billing inflates costs.
**NCC Advantage**: Automated cross-project scanner with side-by-side comparison, permanent PNG snapshots of findings, and GAAP-compliant SibE archival that preserves audit trail while zeroing financial impact.
**Score**: 32/40 (U:8 V:8 D:9 Def:7) | **NexOP**: ~0.35%

→ [Full CAM](./EST-ACC-NexDupE.md)

#### EST-ACC-0002 — NexCAD Enhanced Video Assessment
*"AI tells you what the damage is. NexCAD tells you how much — with actual measurements."*

**Problem**: AI vision models identify damage well but can't measure dimensions accurately. A 15% quantity error means thousands in claim disputes.
**NCC Advantage**: Burst-extracts full-res frames around damage timestamps, runs photogrammetry to build a 3D mesh, then measures actual surface area. "AI estimated ~15 SF → NexCAD measured: 17.3 SF." First system combining AI damage ID with photogrammetry-derived measurements.
**Score**: 37/40 (U:10 V:9 D:9 Def:9) | Highest uniqueness score in the portfolio.

→ [Full CAM](./EST-ACC-0002-nexcad-enhanced-video-assessment.md)

#### EST-ACC-0003 — NexUNIT: Unit Price Discrimination Engine ★ New
*"The estimate says 130 SF. Home Depot says $12.99/roll. NexUNIT says: that roll covers 40 SF, so your effective cost is $0.32/SF — and you need 4 rolls."*

**Problem**: Retail products are sold in packaging units (rolls, sheets, bundles, cases) that don't match project estimate units (SF, LF, SQ). Comparing "$12.99/roll" vs "$14.99/roll" is meaningless without knowing each roll's coverage. Every competitor treats sticker price as the comparison unit — they all get this wrong.
**NCC Advantage**: Three-tier coverage extraction — spec-sheet parsing (HIGH confidence), title dimension parsing with Unicode-aware regex and 6-category material-type detection (MEDIUM), and industry-standard heuristics (LOW) — resolves true per-project-unit cost from any retail product listing. Full unit conversion matrix (SF ↔ SY ↔ SQ, LF, CF ↔ CY, BF, 30+ aliases). NexSTACK Layer 3 — the bridge that makes Layer 2 (BOM Pricing) comparable and Layer 4 (NexBUY) aggregatable.
**Score**: 33/40 (U:9 V:9 D:7 Def:8) | **NexOP**: ~0.65%

→ [Full CAM](./EST-ACC-0003-nexunit-unit-price-discrimination-engine.md)

#### EST-AUTO-0002 — NexPLAN: AI-Assisted Selections & Planning
*"Upload a floor plan. Describe what you want. Get a professional selection package in 5 minutes."*

**Problem**: Material selections take 2–4 hours per room — scattered across WhatsApp, spreadsheets, vendor websites, and hand-drawn plans.
**NCC Advantage**: AI floor plan analysis + natural language layout design + real vendor product fitting + automated eDoc generation. SVG floor plan, product image gallery, vendor-formatted quote sheet — all from a conversation.
**Score**: 36/40 (U:9 V:9 D:10 Def:8) | **NexOP**: ~0.60% | Highest demonstrability score (10/10).

→ [Full CAM](./EST-AUTO-0002-nexplan-ai-selections.md)

#### EST-INTG-0001 — Multi-Provider BOM Pricing Pipeline
*"200 materials. Two suppliers. Live prices. Three minutes."*

**Problem**: Manual price lookup across HD and Lowe's takes 3–5 hours for a 200-line BOM.
**NCC Advantage**: Simultaneous HD + Lowe's search with SSE streaming, store-level results (name, address, phone), and timestamped price snapshots for insurance supplement evidence.
**Score**: 32/40 (U:8 V:9 D:9 Def:6) | **NexOP**: ~2.99% | #2 NexOP contributor.

→ [Full CAM](./EST-INTG-0001-multi-provider-bom-pricing.md)

#### EST-INTL-0001 — NexBRIDGE Video Index & Re-scan
*"Reopen any past assessment. Re-extract frames. Refine findings — without starting over."*

**Problem**: Video assessments are one-shot — revisiting findings means creating an entirely new assessment and losing all prior work.
**NCC Advantage**: Persistent local video index stores every assessment's video path + server frame URIs. Two-tier fallback (local video → server frames). One-click re-scan preserves all existing findings.
**Score**: 32/40 (U:8 V:8 D:9 Def:7) | **NexOP**: ~0.18%

→ [Full CAM](./EST-INTL-0001-nexbridge-video-index-rescan.md)

#### EST-INTL-0002 — ScanNEX Component Identity & Material Intelligence ★ New
*"Scan a room. Know every baseboard, every crown, every casing — profile, material, finish — before you leave the jobsite."*

**Problem**: LiDAR scanning gives you "87.5 LF of baseboard" but not *what kind*. Estimators still make return visits to hand-measure trim profiles and photograph materials — a half-day per room that delays estimates by 24-48 hours.
**NCC Advantage**: Three-stage pipeline: passive Vision contour detection during LiDAR scan identifies trim bands (baseboard, crown, chair rail), guided Material Walk captures close-up photos of each component in 30-60s, and `buildEnrichedBOM()` produces 9 categories of estimate-ready line items with profile style, material, and dimensions. Output: "87.5 LF of 3.5" colonial MDF baseboard" — not "87.5 LF baseboard."
**Score**: 36/40 (U:9 V:10 D:9 Def:8) | **NexOP**: ~0.85% | Tied for highest value score (10/10).

→ [Full CAM](./EST-INTL-0002-scannex-component-identity-material-intelligence.md)

#### EST-SPD-0001 — Redis Price List Caching
*"54,000 prices in 50ms."*

**Problem**: Loading large price lists from the database takes 500–800ms per request. Cumulative wait measured in minutes per day.
**NCC Advantage**: Full price list cached in Redis with 1-hour TTL. Auto-invalidated on every PETL import. Graceful DB fallback if Redis goes down. 16× speed improvement.
**Score**: 29/40 (U:7 V:8 D:9 Def:5) | **NexOP**: ~0.13%

→ [Full CAM](./EST-SPD-0001-redis-price-list-caching.md)

---

### Operations (OPS)

#### OPS-ACC-0001 — NEXI Capture: Other Category Disposition
*"Nothing gets lost. Every observation feeds the next project."*

**Problem**: Field items that don't fit existing categories get mis-categorized (polluting data) or skipped (data loss).
**NCC Advantage**: Structured "Other" category with auto-flag, PM review workflow, and reclassification pipeline. Turns uncategorized field data into a continuous taxonomy improvement loop.
**Score**: 26/40 (U:6 V:7 D:8 Def:5) | **NexOP**: ~0.08%

→ [Full CAM](./OPS-ACC-0001-nexi-capture-other-disposition.md)

#### OPS-AUTO-0001 — Group Task Cascading Completion
*"One task, any member completes, everyone is cleared."*

**Problem**: Multi-PM projects create N identical tasks per issue. When one PM resolves it, N-1 orphaned tasks remain — alert fatigue, ignored todo lists.
**NCC Advantage**: Single task with group member join table. Any member completes → done for everyone, with attribution. Up to 66% task volume reduction on multi-PM projects.
**Score**: 26/40 (U:6 V:7 D:8 Def:5)

→ [Full CAM](./OPS-AUTO-0001-group-task-cascading-completion.md)

#### OPS-AUTO-0002 — NexBUY: Group Shopping Cart & Consolidated Purchase (rev 1.1)
*"Five projects need 2×4s. One purchase order. One trip. Every site gets exactly what it needs."*

**Problem**: Each PM places independent material orders per project — 5 projects buying the same lumber means 5 retail-price trips to the same supplier. No cross-project visibility, no volume leverage, no organizational buying power.
**NCC Advantage**: Tenant-wide shopping cart view with multi-select consolidated purchasing. Material aggregation by normalized key preserves per-project allocation while unlocking bulk pricing. Receipt origin tracking (`MANUAL` / `SHOPPING_CART`) creates a complete Cart → Receipt → Bill audit chain. PM+ role gating ensures consolidated purchasing is managed by operations leadership. NexSTACK Layer 4 — depends on NexCART (Layer 1), BOM Pricing (Layer 2), and NexUNIT (Layer 3) for correct per-unit costs.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | **NexOP**: ~0.45%

→ [Full CAM](./OPS-AUTO-0002-nexbuy-group-shopping-cart-consolidated-purchase.md)

#### OPS-COLLAB-0001 — Phantom Fleet: Personal Asset Sharing
*"Making visible what's already there."*

**Problem**: Every GC sits on a phantom fleet of personal equipment they can't see, schedule, or leverage.
**NCC Advantage**: Dual ownership model (company/personal) with owner-controlled privacy (private/company/custom). Maintenance pools decouple "who maintains" from "who owns." Unified asset list with CSV bulk import.
**Score**: 31/40 (U:8 V:8 D:9 Def:6) | **NexOP**: ~0.39%

→ [Full CAM](./OPS-COLLAB-0001-personal-asset-ownership-sharing.md)

#### OPS-INTG-0001 — NexFIND Receipt Bridge: Verified Suppliers
*"Scraped directories tell you who exists. Receipts tell you who's actually good."*

**Problem**: Supplier directories are unreliable. Manual entry doesn't scale. Institutional knowledge walks out the door.
**NCC Advantage**: Every receipt OCR automatically builds a verified supplier map — real vendors, real addresses, confirmed by actual purchases. 3-tier deduplication. Zero data entry overhead.
**Score**: 30/40 (U:8 V:7 D:8 Def:7) | **NexOP**: ~0.26%

→ [Full CAM](./OPS-INTG-0001-nexfind-receipt-bridge-verified-suppliers.md)

#### OPS-INTL-0001 — NexFIND: Supplier Intelligence Network
*"Every crew that uses Nexus makes the supplier map smarter for every other crew."*

**Problem**: Crews waste 30–60 minutes per material run figuring out where to buy. New markets start from zero.
**NCC Advantage**: Living crowdsourced supplier map that grows from receipts, searches, navigation, and project creation. Multi-tenant network intelligence — enter a new market and see verified suppliers from the network instantly.
**Score**: 35/40 (U:9 V:9 D:9 Def:8) | **NexOP**: ~0.54% | Strongest network-effect moat.

→ [Full CAM](./OPS-INTL-0001-nexfind-supplier-intelligence.md)

#### OPS-INTL-0002 — NexCART: Intelligent Materials Procurement
*"The estimate says what you need. NexCART tells you where to buy it, how much to carry, and whether the crew actually did."*

**Problem**: Materials are 40–50% of project cost, yet no system connects the estimate to the purchase to the receipt to the installed quantity. Crews default to the nearest store, buy inconsistent quantities, and waste is invisible.
**NCC Advantage**: PETL-driven shopping carts with CBA price:distance optimization, multi-supplier trip planning, and automatic receipt reconciliation. Drawdown ledger tracks need → ordered → purchased → installed. Every deviation is visible — turning procurement from a cost center into a cultural training tool.
**Score**: 35/40 (U:9 V:10 D:8 Def:8) | **NexOP**: ~1.00% | Highest value score (10/10) tied with FIN-ACC-0002.

→ [Full CAM](./OPS-INTL-0002-nexcart-intelligent-materials-procurement.md)

#### OPS-INTL-0003 — NexCBAML: Cost-Benefit Analysis Materials Logistics ★ New #1
*"Where should I buy it, how should it get here, and what does the whole decision actually cost?"*

**Problem**: Procurement tools treat local stores and online suppliers as separate workflows. No system unifies pickup and delivery economics into a single optimized decision. No platform models delivery lead time as a monetary cost.
**NCC Advantage**: Omnichannel CBA engine that scores local pickup (travel + time cost) and online delivery (shipping + lead time penalty) on the same cost surface. Hybrid trip optimizer produces plans with physical stops + parallel online orders. Bulk pricing tiers from Amazon/online suppliers feed quantity recommendations. Six interconnected NexSTACK layers make this impossible to replicate as a standalone feature — a competitor would need to rebuild the entire platform.
**Score**: 38/40 (U:10 V:10 D:9 Def:9) | **NexOP**: ~1.50% | Highest-scoring CAM in the portfolio.

→ [Full CAM](./OPS-INTL-0003-nexcbaml-cost-benefit-analysis-materials-logistics.md)

#### OPS-VIS-0001a — Field Qty Discrepancy Pipeline
*"Field flags it. PM sees it. Supplement filed the same day."*

**Problem**: Estimate quantities don't match field reality. Discrepancies communicated verbally get lost → under-billed scope.
**NCC Advantage**: Field crews flag incorrect quantities directly on PETL line items from the daily log. Discrepancy banner surfaces instantly in the PM's Reconciliation Panel with field qty, note, and review status.
**Score**: 28/40 (U:7 V:8 D:8 Def:5) | **NexOP**: ~0.61%

→ [Full CAM](./OPS-VIS-0001-field-qty-discrepancy-pipeline.md)

#### OPS-VIS-0001b — Intelligent Feature Discovery
*"Every new feature finds the people who can buy it."*

**Problem**: Modular SaaS has a silent killer: feature invisibility. Admins don't check changelogs. Revenue sits dormant.
**NCC Advantage**: Auto-redirects tenant admins to a "What's New" page on login (max 3 times). Per-user tracking, role-scoped targeting, direct billing page links. CAM content auto-populates the cards.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | Revenue multiplier for every other module.

→ [Full CAM](./OPS-VIS-0001-intelligent-feature-discovery.md)

#### OPS-VIS-0002 — Urgency-Based Task Dashboard
*"Red means overdue. Yellow means today. Green means you're ahead."*

**Problem**: Tasks and daily logs are separate silos. Nothing links field observations to follow-up actions.
**NCC Advantage**: Color-coded urgency buckets (overdue/due-soon/upcoming) with red badge count. Tasks from daily log observations auto-link back to the originating log. 60-second refresh.
**Score**: 29/40 (U:7 V:8 D:9 Def:5) | **NexOP**: ~0.27%

→ [Full CAM](./OPS-VIS-0002-urgency-task-dashboard.md)

#### OPS-VIS-0003 — Project & Tenant Scan/Assessment Hub
*"LiDAR scans and AI video assessments — inside the project, not in a separate app."*

**Problem**: Precision scans and video assessments live in disconnected tools with no project context.
**NCC Advantage**: Unifies NexCAD LiDAR scans and NexBRIDGE video assessments inside the PM workflow — per-project tabs and tenant-wide executive dashboards built in from day one.
**Score**: 32/40 (U:8 V:8 D:9 Def:7)

→ [Full CAM](./OPS-VIS-0003-project-tenant-scan-assessment-hub.md)

---

### Technology (TECH)

#### TECH-ACC-0001 — Graceful Sync Fallback
*"Your data, always safe. Even when the infrastructure isn't."*

**Problem**: When Redis/BullMQ goes down, most SaaS apps silently drop jobs and lose user data.
**NCC Advantage**: Real-time outage detection + transparent switch to synchronous processing. Slower, but every import completes, every file processes. When infrastructure recovers, the fast path resumes automatically.
**Score**: 28/40 (U:6 V:9 D:7 Def:6) | **NexOP**: ~0.08%

→ [Full CAM](./TECH-ACC-0001-graceful-sync-fallback.md)

#### TECH-AUTO-0001 — NexBRIDGE Distributed Compute Mesh
*"Every NexBRIDGE installation is a server. The more customers install, the faster the platform gets."*

**Problem**: Compute-heavy tasks (OCR, vision, video processing) are expensive to run in the cloud and slow to scale.
**NCC Advantage**: Every desktop installation becomes a compute node. API coordinator dispatches jobs to the best available node by CPU, bandwidth, power state, and proximity. 5-second server fallback. Zero cloud compute bills.
**Score**: 37/40 (U:10 V:9 D:9 Def:9) | Tied for highest score in the portfolio.

→ [Full CAM](./TECH-AUTO-0001-nexbridge-distributed-compute-mesh.md)

#### TECH-AUTO-0002 — Secure Web Portal Campaigns
*"Select the documents. Define the gate. Launch the portal. Every viewer is identified, every access is logged, every campaign is measurable."*

**Problem**: Every time a company shares sensitive documents with external stakeholders, engineering builds a bespoke page — or worse, IP goes out via email attachments with zero accountability. Each campaign is a one-off engineering project.
**NCC Advantage**: Reusable campaign engine where admins select eDocs, pick a CNDA+ template, and launch a branded portal with multi-gate compliance (CNDA → e-signature → questionnaire → identity → content). Built-in conversion funnels, visitor tracking, batch invites, and per-document analytics. Zero code changes per campaign — the compliance gate is the product, the documents are the payload.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | Generalizes CAM PIP infrastructure into a reusable platform.

→ [Full CAM](./TECH-AUTO-0002-secure-web-portal-campaigns.md)

#### TECH-INTG-0001a
*"A native desktop app where every feature is a revenue switch."*

**Problem**: Desktop companion apps are monolithic — you get everything or nothing.
**NCC Advantage**: Tauri/Rust desktop app with per-feature subscription gating via the same Stripe entitlement system as the web platform. Tenants pick exactly the capabilities they need. Prerequisites enforce logical bundling.
**Score**: 34/40 (U:8 V:9 D:9 Def:8)

→ [Full CAM](./TECH-INTG-0001-nexbridge-modular-subscription.md)

#### TECH-INTG-0001b — NexCAD Precision Scan → CAD Pipeline
*"Scan any object with an iPhone. Get a SketchUp file and engineering dimensions in under 5 minutes."*

**Problem**: Field measurement and manual CAD modeling take hours. Professional scanning requires expensive equipment.
**NCC Advantage**: iPhone LiDAR → guided orbit capture → PhotogrammetrySession on Mac Studio → 8 industry-standard formats (SKP, OBJ, STEP, STL, glTF, GLB, USDZ, DAE) + precise dimensions. Runs through the Distributed Compute Mesh. Zero cloud compute, zero per-scan fees.
**Score**: 36/40 (U:9 V:9 D:9 Def:9)

→ [Full CAM](./TECH-INTG-0001-nexcad-precision-scan-cad-pipeline.md)

#### TECH-INTG-0002 — NexPLAN Distributed Pipeline
*"Start selections on your phone in the field, refine them at your desk, approve them from anywhere."*

**Problem**: Material selections happen across disconnected surfaces — no system tracks which device, which stage, or what's left.
**NCC Advantage**: Device-aware, multi-surface coordination (mobile → desktop → web) with unified pipeline tracking. Every action tagged by device origin, pipeline stage, and user.
**Score**: 32/40 (U:8 V:8 D:8 Def:8)

→ [Full CAM](./TECH-INTG-0002-nexplan-distributed-pipeline.md)

#### TECH-INTL-0001a — NexEXTRACT Adaptive Intelligence
*"AI that learns your company's patterns — not just generic models."*

**Problem**: Generic AI models don't understand company-specific terminology, vendor naming, or regional variations.
**NCC Advantage**: Per-company learning loop where every correction improves future extraction accuracy. Adaptive to each tenant's unique data patterns.
**Score**: 35/40 (U:9 V:9 D:8 Def:9)

→ [Full CAM](./TECH-INTL-0001-nexextract-adaptive-intelligence.md)

#### TECH-INTL-0001b — TUCKS Telemetry & KPI System
*"Is your team using the tool? Is the tool making them better? Now you know."*

**Problem**: No construction PM tool tells you whether users are actually using the system — or gaming it.
**NCC Advantage**: Full telemetry tracking every meaningful action. Workforce efficiency KPIs, personal dashboards with anonymous benchmarking, and gaming detection. No competitor offers integrated gaming detection or individual benchmarking.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | **NexOP**: ~1.19% | #3 NexOP contributor.

→ [Full CAM](./TECH-INTL-0001-tucks-telemetry-kpi-system.md)

#### TECH-SPD-0003 — Smart Media Upload
*"Capture everything. Upload smart. Never lose a photo."*

**Problem**: Field crews on spotty cellular either upload full-res (slow, expensive) or lose media entirely.
**NCC Advantage**: Network-tier detection with automatic compression, concurrency, and video gating adjustments. Metadata syncs instantly; heavy files queue intelligently. Zero manual settings.
**Score**: 29/40 (U:7 V:7 D:8 Def:7) | **NexOP**: ~0.24%

→ [Full CAM](./TECH-SPD-0003-smart-media-upload.md)

#### TECH-SPD-0004 — NexBRIDGE Real-Time Update Push
*"Update available → every connected desktop starts downloading in seconds."*

**Problem**: Desktop apps rely on polling for updates — users may run stale builds for 30+ minutes.
**NCC Advantage**: API broadcasts `update:available` through the Distributed Compute Mesh to all connected desktops instantly. Offline devices catch up via standard polling.
**Score**: 28/40 (U:7 V:7 D:8 Def:6)

→ [Full CAM](./TECH-SPD-0004-nexbridge-realtime-update-push.md)

#### TECH-VIS-0001 — NexOP: Operating Percentage Metric
*"What percentage of your revenue is Nexus recovering? Now you know."*

**Problem**: Dollar-based ROI figures don't scale — "$150K saved" means different things to a $2M firm and a $50M firm.
**NCC Advantage**: NexOP expresses every module's impact as a % of annual revenue. "~9% of revenue recovered" is instantly meaningful at any company size. Dashboard-ready, self-scaling, self-evident.
**Score**: 35/40 (U:9 V:9 D:9 Def:8)

→ [Full CAM](./TECH-VIS-0001-nexop-operating-percentage.md)

#### TECH-VIS-0002 — NexINT: Operational Integrity Dashboard
*"The gap between how you think you operate and how you actually operate."*

**Problem**: Companies assume they're running tight operations. Reality: industry baseline is ~72% integrity across financial accuracy, process completion, compliance, and data quality.
**NCC Advantage**: System-wide accuracy index measuring 4 dimensions. Each CAM contributes to one or more integrity dimensions. Composite score rises from ~72% to ~95% with Nexus active. The metric that proves operational discipline to clients and insurers.
**Score**: 36/40 (U:9 V:9 D:9 Def:9)

→ [Full CAM](./TECH-VIS-0002-nexint-operational-integrity-dashboard.md)

#### TECH-COLLAB-0002 — Session Mirror: Remote Dev Oversight from Mobile
*"Approve a deployment from the golf course. Reject a migration from the plane."*

**Problem**: Development velocity is constrained when the decision-maker must be physically present to review changes and approve deployments. Context-switching to a laptop breaks field work.
**NCC Advantage**: Full-stack remote dev oversight via the NCC mobile app. Live event streaming (WebSocket + REST fallback), push-notification-gated deployment approvals with Approve/Reject action buttons, inline commenting, and SUPER_ADMIN-only access enforced at every layer (API, WebSocket, mobile UI). No competitor in restoration or construction offers real-time mobile command-and-control over AI-assisted development.
**Score**: 33/40 (U:9 V:8 D:9 Def:7) | Status: validated | Rev 1.1.

→ [Full CAM](./TECH-COLLAB-0002-session-mirror-remote-dev-oversight.md)

---

### Client Relations (CLT)

#### CLT-INTG-0001 — NCC Sovereign Marketplace: The Integrated Contractor Economy ★ Flagship
*"You don't list on NCC. You exist on NCC."*

**Problem**: Construction is a $2T industry where the people who build everything own nothing digital. Existing marketplaces sell leads, not relationships. PM tools capture data but strand it in silos. No platform connects a contractor's identity, operations, and reputation into a self-reinforcing system.
**NCC Advantage**: Sovereign identity model — every entity owns a capability portfolio, asset registry, availability surface, and reputation ledger built automatically from project execution data. The marketplace discovers contractors by verified capabilities and proven performance, not purchased rank. The integrated lifecycle (Discover → Estimate → Schedule → Execute → Track → Invoice → Reputation → Discover) creates a data flywheel that no single-function competitor can replicate. 44 CAMs are nodes in this connected system — the marketplace is the reason they all exist.
**Score**: 37/40 (U:10 V:10 D:8 Def:9) | Tied for highest score. Highest uniqueness + value in the portfolio.

→ [Full CAM](./CLT-INTG-0001-ncc-sovereign-marketplace.md)

#### CLT-INTL-0001 — NexFIT: Personalized Module Discovery & ROI Engine ★ NEW
*"You don't know what you don't know — until the system shows you what you're losing."*

**Problem**: Contractors face 18+ modules and have no idea which ones matter for their specific business. The flat price list leads to low activation and missed value — both for the contractor (unrecovered revenue) and NCC (subscription revenue).
**NCC Advantage**: An 8-question interactive wizard analyzes the contractor's role, trade, company size, revenue, tools, pain points, and priorities. Returns three-tier recommendations (Essential / Discovery / Growth) with personalized dollar-ROI projections using NexOP data from all 45 CAMs. Inference rules surface modules the user didn't ask for — "you don't know what you don't know" delivered as actionable intelligence. Lead capture converts anonymous visitors into profiled prospects.
**Score**: 36/40 (U:9 V:9 D:10 Def:8) | Highest demonstrability score (10/10) — live interactive wizard at `/nexfit`.

→ [Full CAM](./CLT-INTL-0001-nexfit-module-discovery.md)

#### CLT-COLLAB-0001 — Client Tenant Tier: Acquisition Flywheel
*"Your clients don't just view projects — they become your next subscribers."*

**Problem**: Client portals are dead ends. No viral distribution, no conversion opportunity, no client identity on the platform.
**NCC Advantage**: One checkbox during project creation invites the client. They get a real login, a portal showing every project across every contractor on Nexus, and a clear upgrade path. Every project invite is a product demo on real data. Zero friction.
**Score**: 30/40 (U:7 V:8 D:9 Def:6) | Status: implemented.

→ [Full CAM](./CLT-COLLAB-0001-client-tenant-tier-collaboration.md)

#### CLT-COLLAB-0002 — Dual-User Portal Routing
*"One login. One identity. The right view for every project."*

**Problem**: Traditional PM tools force rigid role silos — you're either a client or an internal user. Breaks for dual-role users.
**NCC Advantage**: Single user identity spans client and internal roles across companies. Client-first login routing, one-click project portal bridge, per-project role enforcement. Seamless context switching.
**Score**: 29/40 (U:7 V:8 D:8 Def:6) | **NexOP**: ~0.15%

→ [Full CAM](./CLT-COLLAB-0002-dual-user-portal-routing.md)

#### CLT-COLLAB-0003 — Viral Document Sharing & Graduated Identity System
*"Every document shared is a seed. Every viewer who registers is a root. Every marketplace participant is a branch."*

**Problem**: NCC documents are either fully public or behind full auth. No middle ground — no way for viewers to share, no referral chain, no progressive path from anonymous visitor to marketplace participant.
**NCC Advantage**: Token-gated document sharing with viewer-invites-viewer viral mechanics. Four-tier graduated identity (Anonymous → VIEWER → Marketplace → Subscriber). Self-referential referral chain tracks propagation depth, viral coefficient, and conversion attribution. Marketplace opt-in dialog with dismissal countdown and persistent button — patient, non-intrusive, inevitable.
**Score**: 35/40 (U:9 V:9 D:9 Def:8) | Consumer-grade growth mechanics applied to B2B construction.

→ [Full CAM](./CLT-COLLAB-0003-viral-document-sharing.md)

#### CLT-COLLAB-0004 — CAM Portal Viral Referral System ★ NEW
*"Every viewer becomes a recruiter. Every referral is a tracked, attributable link in a self-propagating chain."*

**Problem**: CAM content is locked behind admin-only invites with no way for viewers to share. No organic distribution, no referral attribution, no network effect on IP distribution.
**NCC Advantage**: Embedded referral mechanics inside the CNDA+-gated CAM portal. Floating button + CTA banner + modal in content view. Creates child tokens with parent-chain ancestry (max depth 5), sends branded emails, prevents duplicates. Full referral analytics: viral coefficient, chain depth distribution, conversion by depth, top referrers.
**Score**: 33/40 (U:8 V:9 D:8 Def:8) | Viral referral for IP-protected content.

→ [Full CAM](./CLT-COLLAB-0004-cam-portal-viral-referral.md)

---

### Compliance (CMP)

#### CMP-AUTO-0001 — NexCheck: Site Compliance Kiosk
*"Tap in. Sign off. Stay compliant."*

**Problem**: Paper sign-in sheets, printed JSAs, and missing sign-out records. No real-time visibility into who's on site or what they acknowledged.
**NCC Advantage**: NFC-powered kiosk on any phone/tablet. Identifies workers with a tap, walks through required documents (frequency engine: ONCE/DAILY/ON_CHANGE), captures finger signature, builds real-time digital roster. Three-tier sign-out with geo-fence integration. Kiosk delegation for remote PMs.
**Score**: 34/40 (U:9 V:9 D:9 Def:7) | **NexOP**: ~0.40%

→ [Full CAM](./CMP-AUTO-0001-nexcheck-site-compliance.md)

#### CMP-CMP-0001 — CNDA+ Gated Access System ★ NEW
*"Your IP, their identity, mutual accountability — enforced by code, not by trust."*

**Problem**: Distributing competitive intelligence without identity verification means zero legal recourse. Full NCC accounts are too heavy for prospects. Public URLs are too open. URL forwarding attacks bypass single-layer access.
**NCC Advantage**: Multi-gate compliance pipeline: CNDA+ acceptance → e-signature → email-based identity verification. Token-based session management with localStorage persistence. Forensic logging of failed attempts. Landing page with auto-redirect for returning viewers. CAM revisit banner for authenticated NCC users. Enumeration-safe access recovery.
**Score**: 34/40 (U:8 V:9 D:9 Def:8) | IP protection via progressive compliance gates.

→ [Full CAM](./CMP-CMP-0001-cnda-gated-access-system.md)

#### CMP-INTG-0001 — OSHA eCFR Auto-Sync
*"The official regulations. Always current. Zero manual updates."*

**Problem**: OSHA compliance requires current regulations, but nobody maintains them in the PM system.
**NCC Advantage**: Auto-imports the complete 29 CFR 1926 from the official eCFR API. Change detection, content-hash versioning, structured manual with subparts as chapters. Planned: OSHA section badges on PETL line items.
**Score**: 33/40 (U:8 V:9 D:9 Def:7) | **NexOP**: ~0.20%

→ [Full CAM](./CMP-INTG-0001-osha-ecfr-auto-sync.md)

---

## Reference Documents

| Document | Purpose |
|----------|---------|
| [CAM-PORTFOLIO-IMPACT.md](./CAM-PORTFOLIO-IMPACT.md) | Aggregate NexOP + NexINT analysis across all CAMs with revenue tier extrapolations |
| [cam-competitive-advantage-system-sop.md](../sops-staging/cam-competitive-advantage-system-sop.md) | SOP for CAM creation, evaluation, taxonomy, and lifecycle |

---

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-10 | Initial library — 44 CAMs indexed with TOC, heatmap, and executive summaries |
| 1.1 | 2026-03-11 | Added CLT-INTG-0001 NCC Sovereign Marketplace (flagship CAM, 37/40) — 45 CAMs total |
| 1.2 | 2026-03-11 | Added CLT-INTL-0001 NexFIT Module Discovery & ROI Engine (36/40) — 46 CAMs total |
|| 1.3 | 2026-03-11 | Added CLT-COLLAB-0003 Viral Document Sharing & Graduated Identity (35/40) — 47 CAMs total |
|| 1.4 | 2026-03-11 | Added CLT-COLLAB-0004 CAM Portal Viral Referral (33/40) and CMP-CMP-0001 CNDA+ Gated Access (34/40) — 49 CAMs total |
|| 1.5 | 2026-03-13 | Added TECH-COLLAB-0002 Session Mirror — Remote Dev Oversight from Mobile (33/40) — 53 CAMs total |
|| 1.6 | 2026-03-13 | Added TECH-AUTO-0002 Secure Web Portal Campaigns (33/40) — 54 CAMs total |
||| 1.7 | 2026-03-14 | Added OPS-AUTO-0002 NexBUY — Group Shopping Cart & Consolidated Purchase (33/40) — 55 CAMs total |
||| 1.8 | 2026-03-15 | Updated TECH-COLLAB-0002 Session Mirror to rev 1.1 — race condition fix, cross-company visibility, safe area compliance |
||| 1.9 | 2026-03-15 | Updated OPS-AUTO-0002 NexBUY to rev 1.1 — receipt origin tracking, cart-to-bill audit chain, PM+ role gating |
||| 2.0 | 2026-03-15 | Added EST-ACC-0003 NexUNIT — Unit Price Discrimination Engine (33/40), NexSTACK Layer 3 — 56 CAMs total |
