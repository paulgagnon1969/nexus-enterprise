# NCC Usage-Based Pricing Matrix

> Revision 1.0 — 2026-03-05
> Purpose: Map every billable module to its variable cost drivers, estimate per-operation costs at current API rates, model usage scenarios by tenant size, and recommend collar/cap/markup pricing.

---

## 1. External Service Cost Reference (What We Pay)

### AI / LLM
- **GPT-4o text** — $2.50/1M input tokens, $10.00/1M output tokens
- **GPT-4o vision** (image input) — same token rates; high-detail image ≈ 1,000–2,000 input tokens (~$0.003–$0.005 per image in token cost, plus prompt + output)
- **Whisper** (audio transcription) — $0.006/minute
- **GPT-4o Mini** — $0.15/1M input, $0.60/1M output (available as cost-down path)

### External APIs
- **Mapbox** — geocoding free 100K/mo; places search $5/1K after free tier
- **GovInfo / eCFR** — free (US government)
- **Weather API** — free tier sufficient for current volume
- **Plaid** — ~$0.50 one-time per bank link (negligible, not passed through)

### Infrastructure (Self-Hosted, Fixed Cost)
- **Puppeteer PDF** — local Chromium on Mac Studio ($0 marginal)
- **MinIO storage** — self-hosted on 4TB SSD ($0 marginal per GB)
- **Postgres / Redis** — self-hosted ($0 marginal per query)
- **Poppler / libwebp** — local image processing ($0 marginal)

---

## 2. Module-by-Module Variable Cost Map

### CORE — Cap: $0 (always free)
- **Variable cost drivers:** None
- **AI operations:** None
- **Est. variable cost per tenant/mo:** $0
- **Notes:** Company settings, user management, dashboard. Pure CRUD.

### ESTIMATING — Cap: $79/mo
- **Variable cost drivers:**
  - PETL price extrapolation → GPT-4o text (~$0.03 per extrapolation)
  - Regional factor learning → GPT-4o text (~$0.03 per region calc)
  - Cost book item analysis → GPT-4o text (~$0.02 per item)
  - Room scan analysis → GPT-4o Vision (~$0.08–$0.15 per scan, multiple frames)
  - Video assessment → GPT-4o Vision (~$0.15–$0.30 per assessment, 5–10 frames at high detail)
- **Est. variable cost per tenant/mo:**
  - Light (5 extrapolations, 0 scans): ~$0.15
  - Moderate (20 extrapolations, 2 scans, 1 video): ~$1.30
  - Heavy (100 extrapolations, 10 scans, 5 videos): ~$6.50
- **Notes:** Highest AI density module. Video/room scan are the expensive operations.

### SCHEDULING — Cap: $49/mo
- **Variable cost drivers:**
  - Voice-to-text daily logs → Whisper ($0.006/min) + GPT-4o cleanup ($0.015 per note)
  - Weather lookups → free API
- **Est. variable cost per tenant/mo:**
  - Light (0 voice notes): ~$0
  - Moderate (20 voice notes, avg 2 min): ~$0.54
  - Heavy (100 voice notes, avg 2 min): ~$2.70
- **Notes:** Mostly pure CRUD. Voice notes are the only meaningful variable cost.

### FINANCIALS — Cap: $69/mo
- **Variable cost drivers:**
  - Receipt OCR → GPT-4o Vision ($0.03–$0.05 per receipt, high-detail image)
  - Multi-receipt merge → additional GPT-4o calls for 2nd+ receipts
  - Smart prescreen learning → GPT-4o text ($0.02 per prescreen decision)
  - NexPRICE regional pricing → GPT-4o text ($0.02 per lookup)
  - Invoice PDF generation → Puppeteer ($0 local)
- **Est. variable cost per tenant/mo:**
  - Light (5 receipts, 10 prescreens): ~$0.45
  - Moderate (30 receipts, 50 prescreens): ~$2.50
  - Heavy (150 receipts, 200 prescreens): ~$11.50
- **Notes:** Receipt OCR volume is the key driver. Heavy expense-logging tenants (large field crews) will hit the upper range.

### DOCUMENTS — Cap: $39/mo
- **Variable cost drivers:**
  - Document AI processing → GPT-4o Vision ($0.03–$0.08 per page, depending on complexity)
  - Plan sheet extraction → poppler + libwebp ($0 local) + optional GPT-4o analysis ($0.05)
  - SOP sync/render → GPT-4o text for markdown processing ($0.01 per doc)
  - Manual PDF generation → Puppeteer ($0 local)
- **Est. variable cost per tenant/mo:**
  - Light (5 doc imports, 0 plan sheets): ~$0.25
  - Moderate (20 doc imports, 5 plan sheets): ~$1.50
  - Heavy (100 doc imports, 20 plan sheets): ~$9.00
- **Notes:** Plan sheet AI analysis is optional. Most document operations are local processing.

### TIMEKEEPING — Cap: $49/mo
- **Variable cost drivers:**
  - Voice timecard notes → Whisper + GPT-4o (same as Scheduling voice notes)
  - Certified payroll calculations → pure computation ($0)
  - Payroll export → pure computation ($0)
- **Est. variable cost per tenant/mo:**
  - Light (0 voice notes): ~$0
  - Moderate (10 voice notes): ~$0.27
  - Heavy (50 voice notes): ~$1.35
- **Notes:** Almost entirely CRUD. Voice input is the only external cost.

### MESSAGING — Cap: $29/mo
- **Variable cost drivers:**
  - Voice message transcription → Whisper ($0.006/min) + GPT-4o cleanup ($0.015)
  - Push notifications → Firebase (free tier)
  - Email notifications → SMTP (~$0.001 per email)
- **Est. variable cost per tenant/mo:**
  - Light (0 voice msgs): ~$0
  - Moderate (10 voice msgs, 200 emails): ~$0.47
  - Heavy (50 voice msgs, 1000 emails): ~$2.10
- **Notes:** Very low variable cost. Mostly pure messaging infrastructure.

### BIDDING — Cap: $39/mo
- **Variable cost drivers:**
  - Bid AI comparison → GPT-4o text ($0.03 per comparison)
  - Bid package PDF → Puppeteer ($0 local)
  - Supplier communication → email ($0.001)
- **Est. variable cost per tenant/mo:**
  - Light (2 bid packages): ~$0.06
  - Moderate (10 bid packages): ~$0.30
  - Heavy (30 bid packages): ~$0.90
- **Notes:** Very low AI usage. Mostly CRUD + document generation.

### WORKFORCE — Cap: $59/mo
- **Variable cost drivers:**
  - Candidate pipeline → pure CRUD ($0)
  - Skills tracking → pure CRUD ($0)
  - Reputation scoring → computation ($0)
  - Prescreen feedback → minimal
- **Est. variable cost per tenant/mo:** ~$0 across all tiers
- **Notes:** Pure value-based module. Zero external API costs. Collar should reflect platform value, not cost.

### COMPLIANCE — Cap: $39/mo
- **Variable cost drivers:**
  - OSHA eCFR sync → free government API ($0)
  - ICC code lookup → free government API ($0)
  - Federal Register monitoring → free GovInfo API ($0)
  - Safety cert tracking → pure CRUD ($0)
- **Est. variable cost per tenant/mo:** ~$0 across all tiers
- **Notes:** Pure value-based module. All external data sources are free government APIs.

### SUPPLIER INDEX — Cap: $200/yr (~$16.67/mo)
- **Variable cost drivers:**
  - Geographic supplier scraping → computation ($0)
  - Map integration → Mapbox (free tier for our volume)
- **Est. variable cost per tenant/mo:** ~$0
- **Notes:** Annual billing module. Pure value-based.

### NEXFIND — Cap: $49/mo
- **Variable cost drivers:**
  - Mapbox places search → $0.005/search after free tier
  - Supplier intelligence analysis → GPT-4o text ($0.02–$0.03 per analysis)
  - Directions capture → Mapbox ($0 within free tier)
- **Est. variable cost per tenant/mo:**
  - Light (20 searches): ~$0.10
  - Moderate (100 searches, 10 analyses): ~$0.80
  - Heavy (500 searches, 50 analyses): ~$4.00
- **Notes:** Mapbox free tier covers most small tenants. AI cost scales with supplier analysis volume.

---

## 3. Per-Project Features — Variable Cost per Unlock

### XACT_IMPORT — $49/project
- **Cost per use:** Worker processing + CSV parsing → ~$0.10 compute (no AI)
- **Our margin at unlock price:** ~$48.90 (99.8%)
- **Notes:** Pure computation. Extremely high margin.

### DOCUMENT_AI — $29/project
- **Cost per use:** GPT-4o Vision for document batch → ~$0.20–$1.00 depending on page count
- **Our margin at unlock price:** ~$28–$28.80 (96–99%)
- **Notes:** Even a 20-page document set costs us ~$1.00. Very high margin.

### DRAWINGS_BOM — $39/project
- **Cost per use:** GPT-4o Vision for multi-frame blueprint analysis → ~$0.50–$3.00 per full drawing set
- **Our margin at unlock price:** ~$36–$38.50 (92–99%)
- **Notes:** Highest AI cost per-project feature, but still very high margin.

---

## 4. Usage Scenarios by Tenant Size

### Scenario A: Solo Contractor (1–3 users)
Modules enabled: Core, Scheduling, Financials

| Module | Usage | Variable Cost | Collar | Cap | Charge (usage×1.2) | Actual Charge |
|--------|-------|--------------|--------|-----|---------------------|---------------|
| CORE | — | $0 | $0 | $0 | $0 | $0 |
| SCHEDULING | 5 voice notes | $0.14 | $10 | $49 | $0.17 | $10 (collar) |
| FINANCIALS | 10 receipts, 20 prescreens | $0.90 | $15 | $69 | $1.08 | $15 (collar) |
| **Total** | | **$1.04** | | | | **$25.00** |

CC surcharge (3.5%): $0.88 → **Total billed: $25.88**
ACH fee (1%): $0.25 → **Total billed: $25.25**

### Scenario B: Mid-Size Restoration Company (10–25 users)
Modules enabled: Core, Estimating, Scheduling, Financials, Documents, Timekeeping, Messaging

| Module | Usage | Variable Cost | Collar | Cap | Charge (usage×1.2) | Actual Charge |
|--------|-------|--------------|--------|-----|---------------------|---------------|
| CORE | — | $0 | $0 | $0 | $0 | $0 |
| ESTIMATING | 50 extrap, 5 scans, 2 video | $3.25 | $20 | $79 | $3.90 | $20 (collar) |
| SCHEDULING | 40 voice notes | $1.08 | $10 | $49 | $1.30 | $10 (collar) |
| FINANCIALS | 60 receipts, 100 prescreens | $5.00 | $15 | $69 | $6.00 | $15 (collar) |
| DOCUMENTS | 30 doc imports, 10 plan sheets | $2.25 | $10 | $39 | $2.70 | $10 (collar) |
| TIMEKEEPING | 20 voice notes | $0.54 | $10 | $49 | $0.65 | $10 (collar) |
| MESSAGING | 20 voice msgs | $0.54 | $5 | $29 | $0.65 | $5 (collar) |
| **Total** | | **$12.66** | | | | **$70.00** |

CC surcharge (3.5%): $2.45 → **Total billed: $72.45**
ACH fee (1%): $0.70 → **Total billed: $70.70**

**Savings vs. current flat pricing:** Current flat = $79+49+69+39+49+29 = $314/mo. Usage-based = $70/mo. **78% savings for tenant.**

### Scenario C: Large GC / Full Platform (50+ users, heavy AI use)
Modules enabled: All monthly modules

| Module | Usage | Variable Cost | Collar | Cap | Charge (usage×1.2) | Actual Charge |
|--------|-------|--------------|--------|-----|---------------------|---------------|
| CORE | — | $0 | $0 | $0 | $0 | $0 |
| ESTIMATING | 200 extrap, 20 scans, 10 video | $13.00 | $20 | $79 | $15.60 | $20 (collar) |
| SCHEDULING | 200 voice notes | $5.40 | $10 | $49 | $6.48 | $10 (collar) |
| FINANCIALS | 300 receipts, 500 prescreens | $25.00 | $15 | $69 | $30.00 | $30.00 |
| DOCUMENTS | 150 doc imports, 30 plan sheets | $12.00 | $10 | $39 | $14.40 | $14.40 |
| TIMEKEEPING | 100 voice notes | $2.70 | $10 | $49 | $3.24 | $10 (collar) |
| MESSAGING | 100 voice msgs | $2.70 | $5 | $29 | $3.24 | $5 (collar) |
| BIDDING | 20 packages | $0.60 | $8 | $39 | $0.72 | $8 (collar) |
| WORKFORCE | — | $0 | $15 | $59 | $0 | $15 (collar) |
| COMPLIANCE | — | $0 | $10 | $39 | $0 | $10 (collar) |
| NEXFIND | 300 searches, 30 analyses | $2.40 | $10 | $49 | $2.88 | $10 (collar) |
| **Total** | | **$63.80** | | | | **$132.40** |

CC surcharge (3.5%): $4.63 → **Total billed: $137.03**
ACH fee (1%): $1.32 → **Total billed: $133.72**

**vs. current flat pricing:** $79+49+69+39+49+29+39+59+39+49 = $500/mo → Usage-based = $132.40. **73% savings.**

### Scenario D: Same Large GC but EXTREME AI usage
(Stress-testing the caps — 10× normal volume)

| Module | Usage | Variable Cost | Charge (usage×1.2) | Actual (capped) |
|--------|-------|--------------|---------------------|-----------------|
| ESTIMATING | 1000 extrap, 100 scans, 50 video | $65.00 | $78.00 | $78.00 (near cap) |
| FINANCIALS | 1500 receipts, 2000 prescreens | $115.00 | $138.00 | $69.00 (CAP) |
| DOCUMENTS | 500 imports, 100 plan sheets | $45.00 | $54.00 | $39.00 (CAP) |
| **Others** | (at collar) | — | — | $68.00 |
| **Total** | | **$225+** | | **$254.00** |

**Key insight:** Even at extreme usage, the cap protects the tenant. But FINANCIALS at $115 variable cost × 1.2 = $138 → capped at $69 means **we lose $46 on that module.** This is where per-operation minimums on high-cost items (OCR) become critical margin protection.

---

## 5. Recommended Collar Schedule

Formula: `monthlyCharge = max(collar, min(cap, totalUsageCost × 1.20))`

| Module | Cap | Recommended Collar | Collar as % of Cap | Rationale |
|--------|-----|-------------------|-------------------|-----------|
| CORE | $0 | $0 | — | Always free |
| ESTIMATING | $79 | $20 | 25% | High value, AI-heavy; $20 covers infra + baseline support |
| SCHEDULING | $49 | $10 | 20% | Low variable cost; collar = "keep my seat warm" value |
| FINANCIALS | $69 | $15 | 22% | Moderate AI use; OCR volume varies widely |
| DOCUMENTS | $39 | $10 | 26% | Moderate AI use; plan sheets drive cost |
| TIMEKEEPING | $49 | $10 | 20% | Low variable cost; pure scheduling value |
| MESSAGING | $29 | $5 | 17% | Lowest variable cost; minimal overhead |
| BIDDING | $39 | $8 | 21% | Low AI use; mostly CRUD value |
| WORKFORCE | $59 | $15 | 25% | Zero variable cost; pure value-based |
| COMPLIANCE | $39 | $10 | 26% | Zero variable cost; regulatory value |
| SUPPLIER INDEX | $200/yr | $200/yr | 100% | Annual flat — no usage variability |
| NEXFIND | $49 | $10 | 20% | Moderate AI; Mapbox free tier covers most |

### Collar Revenue Floor (All Modules Enabled)

If every module is enabled at collar: $0 + $20 + $10 + $15 + $10 + $10 + $5 + $8 + $15 + $10 + $16.67 + $10 = **$129.67/mo**

vs. current flat total: **$500/mo**

This is the minimum you'd collect from a "full platform, barely uses it" tenant.

---

## 6. Per-Operation Minimums (AI Margin Protection)

For high-cost AI operations, apply: `operationCharge = max(minFloor, actualCost × 1.20)`

| Operation | Vendor Cost | ×1.20 Markup | Min Floor | Effective Charge |
|-----------|------------|-------------|-----------|-----------------|
| Receipt OCR (GPT-4o Vision) | ~$0.04 | $0.048 | $0.06 | $0.06 |
| Document AI page scan | ~$0.05 | $0.06 | $0.08 | $0.08 |
| PETL extrapolation | ~$0.03 | $0.036 | $0.05 | $0.05 |
| Room scan (multi-frame) | ~$0.12 | $0.144 | $0.18 | $0.18 |
| Video assessment (5-10 frames) | ~$0.25 | $0.30 | $0.35 | $0.35 |
| Whisper transcription (per min) | $0.006 | $0.0072 | $0.01 | $0.01 |
| GPT-4o text cleanup (per call) | ~$0.015 | $0.018 | $0.025 | $0.025 |
| Drawings→BOM per page | ~$0.15 | $0.18 | $0.25 | $0.25 |
| Mapbox places search | $0.005 | $0.006 | $0.01 | $0.01 |
| Smart prescreen decision | ~$0.02 | $0.024 | $0.03 | $0.03 |
| Bid AI comparison | ~$0.03 | $0.036 | $0.05 | $0.05 |
| NexFIND supplier analysis | ~$0.03 | $0.036 | $0.05 | $0.05 |

**Why min floors matter:** If OpenAI drops GPT-4o prices 50% tomorrow, our 20% markup would also drop. The floor ensures we never charge less than a profitable baseline regardless of vendor pricing changes.

---

## 7. Margin Analysis at Scale

### Revenue per 100 tenants/mo (mix of Scenarios A–C)

Assumptions: 40% solo (A), 40% mid-size (B), 20% large (C)

| Segment | Count | Revenue/tenant | Total Revenue | Variable Cost/tenant | Total Cost | Gross Margin |
|---------|-------|---------------|---------------|---------------------|------------|-------------|
| Solo (A) | 40 | $25.00 | $1,000 | $1.04 | $41.60 | $958.40 (96%) |
| Mid-size (B) | 40 | $70.00 | $2,800 | $12.66 | $506.40 | $2,293.60 (82%) |
| Large (C) | 20 | $132.40 | $2,648 | $63.80 | $1,276.00 | $1,372.00 (52%) |
| **Total** | **100** | **avg $64.48** | **$6,448** | | **$1,824** | **$4,624 (72%)** |

**Key: 72% gross margin on variable costs across the tenant mix, BEFORE infrastructure.**

### Infrastructure cost (fixed, monthly)
- Mac Studio amortization: ~$100/mo (over 3 years)
- Electricity: ~$30/mo
- Cloudflare Tunnel: $0 (free tier)
- Domain / DNS: ~$5/mo
- OpenAI base subscription: $0 (pay-per-use)
- **Total fixed infra: ~$135/mo**

**Net margin at 100 tenants: $6,448 - $1,824 - $135 = $4,489/mo (70%)**

---

## 8. Payment Processing Revenue

### Per 100 tenants (assume 70% ACH, 30% CC)

| Method | Tenants | Avg Invoice | Fee Charged | Our Cost | Net from Fees |
|--------|---------|-------------|-------------|----------|--------------|
| ACH (1%) | 70 | $64.48 | $45.14 | $36.11 (0.8% Stripe) | +$9.03 |
| CC (3.5%) | 30 | $64.48 | $67.70 | $60.78 (2.9%+$0.30) | +$6.92 |
| **Total** | **100** | | **$112.84** | **$96.89** | **+$15.95/mo** |

Payment processing is a small but positive margin contributor. The ACH nudge (showing CC surcharge on invoice) should push the mix toward 70%+ ACH over time.

---

## 9. Open Questions for Decision

1. **Collar waived during trial?** Recommended: Yes. Trial = full access, $0. Maximizes conversion.

2. **Per-operation charges visible to tenant?** Two options:
   - (a) Show only module-level charge on invoice (simpler, less sticker shock)
   - (b) Show itemized AI operations below each module (transparent, educational)
   - Recommendation: (a) on invoice, (b) available in a "Usage Details" drill-down in billing page

3. **Cap reduction for annual commitment?** e.g., 15% cap reduction for annual prepay. This would make caps: Estimating $67, Financials $59, etc.

4. **Scenario D problem — cap protects tenant but we lose money on extreme AI use.** Mitigation options:
   - (a) Raise per-operation floors on OCR/Vision operations
   - (b) Introduce a "fair use" clause (rate limit after X operations/mo, additional at per-op price)
   - (c) Accept the loss — extreme users are rare and their engagement drives referrals
   - Recommendation: (b) — set a generous "included" tier per module, then per-op pricing above it

5. **Supplier Index stays annual flat?** It has zero variable cost. Could keep as-is or fold into the usage model.

---

## 10. Repricing Analysis — Targeting 80%+ Gross Margin

### Why the Original Model Fails

The 1.2× markup (20% on cost) yields only **16.7% margin on revenue**. Any module where a tenant's usage pushes past the collar enters a 17% margin zone. Collars on AI-heavy modules were also set too low — a heavy Estimating user costs us $13/mo but the collar was only $20 (35% margin).

**The fix: 5× markup + higher collars + adjusted caps on AI-heavy modules.**

- At 5× markup: per-operation margin = `(5x - x) / 5x` = **80%** on every operation
- Raised collars ensure even low-usage tenants contribute enough
- Raised caps on 2 modules (Financials, Documents) prevent cap-induced losses at extreme usage
- Zero-variable-cost modules get a modest collar bump for value alignment

### New Formula

`monthlyCharge = max(collar, min(cap, totalUsageCost × 5.0))`

Per-operation: `operationCharge = max(minFloor, actualCost × 5.0)`

### Repriced Module Schedule

| Module | Old Collar | New Collar | Old Cap | New Cap | Δ Cap | Notes |
|--------|-----------|-----------|---------|---------|-------|-------|
| CORE | $0 | $0 | $0 | $0 | — | Always free |
| ESTIMATING | $20 | $29 | $79 | $119 | +$40 | Highest AI density; cap raised to cover heavy vision ops |
| SCHEDULING | $10 | $15 | $49 | $49 | — | Voice notes are only cost; cap stays |
| FINANCIALS | $15 | $25 | $69 | $129 | +$60 | Receipt OCR is biggest cost driver; cap must cover 300+ receipts |
| DOCUMENTS | $10 | $15 | $39 | $69 | +$30 | Plan sheet AI drives cost; cap raised |
| TIMEKEEPING | $10 | $15 | $49 | $49 | — | Low variable cost; collar bump for value |
| MESSAGING | $5 | $9 | $29 | $29 | — | Low variable cost; collar bump |
| BIDDING | $8 | $12 | $39 | $39 | — | Minimal AI; collar bump for value |
| WORKFORCE | $15 | $19 | $59 | $59 | — | Zero variable cost; pure value |
| COMPLIANCE | $10 | $15 | $39 | $39 | — | Zero variable cost; regulatory value |
| SUPPLIER INDEX | $200/yr | $200/yr | $200/yr | $200/yr | — | Annual flat, unchanged |
| NEXFIND | $10 | $15 | $49 | $49 | — | Mapbox free tier covers most |

### Repriced Per-Operation Floors (5× base)

| Operation | Our Cost | ×5 Markup | Min Floor | Effective |
|-----------|---------|-----------|-----------|----------|
| Receipt OCR (GPT-4o Vision) | ~$0.04 | $0.20 | $0.20 | $0.20 |
| Document AI page scan | ~$0.05 | $0.25 | $0.25 | $0.25 |
| PETL extrapolation | ~$0.03 | $0.15 | $0.15 | $0.15 |
| Room scan (multi-frame) | ~$0.12 | $0.60 | $0.60 | $0.60 |
| Video assessment (5–10 frames) | ~$0.25 | $1.25 | $1.25 | $1.25 |
| Whisper transcription (per min) | $0.006 | $0.03 | $0.03 | $0.03 |
| GPT-4o text cleanup (per call) | ~$0.015 | $0.075 | $0.08 | $0.08 |
| Drawings→BOM per page | ~$0.15 | $0.75 | $0.75 | $0.75 |
| Mapbox places search | $0.005 | $0.025 | $0.03 | $0.03 |
| Smart prescreen decision | ~$0.02 | $0.10 | $0.10 | $0.10 |
| Bid AI comparison | ~$0.03 | $0.15 | $0.15 | $0.15 |
| NexFIND supplier analysis | ~$0.03 | $0.15 | $0.15 | $0.15 |

### Repriced Scenario A: Solo Contractor (1–3 users)

Modules: Core, Scheduling, Financials

| Module | Variable Cost | ×5 | Collar | Cap | Charge | Margin |
|--------|-------------|-----|--------|-----|--------|--------|
| CORE | $0 | $0 | $0 | $0 | $0 | — |
| SCHEDULING | $0.14 | $0.70 | $15 | $49 | $15 (collar) | 99% |
| FINANCIALS | $0.90 | $4.50 | $25 | $129 | $25 (collar) | 96% |
| **Total** | **$1.04** | | | | **$40** | **97%** |

vs. old flat pricing ($49+$69 = $118): **66% savings for tenant**
vs. old usage model ($25): +$15/mo but margin jumps from 96% → 97%

ACH total: $40.40 · CC total: $41.40

### Repriced Scenario B: Mid-Size Restoration (10–25 users)

Modules: Core, Estimating, Scheduling, Financials, Documents, Timekeeping, Messaging

| Module | Variable Cost | ×5 | Collar | Cap | Charge | Margin |
|--------|-------------|-----|--------|-----|--------|--------|
| CORE | $0 | $0 | $0 | $0 | $0 | — |
| ESTIMATING | $3.25 | $16.25 | $29 | $119 | $29 (collar) | 89% |
| SCHEDULING | $1.08 | $5.40 | $15 | $49 | $15 (collar) | 93% |
| FINANCIALS | $5.00 | $25.00 | $25 | $129 | $25 (collar) | 80% |
| DOCUMENTS | $2.25 | $11.25 | $15 | $69 | $15 (collar) | 85% |
| TIMEKEEPING | $0.54 | $2.70 | $15 | $49 | $15 (collar) | 96% |
| MESSAGING | $0.54 | $2.70 | $9 | $29 | $9 (collar) | 94% |
| **Total** | **$12.66** | | | | **$108** | **88%** |

vs. old flat pricing ($314): **66% savings for tenant**
vs. old usage model ($70): +$38/mo, margin 82% → 88%

ACH total: $109.08 · CC total: $111.78

### Repriced Scenario C: Large GC / Full Platform (50+ users, heavy AI)

| Module | Variable Cost | ×5 | Collar | Cap | Charge | Margin |
|--------|-------------|-----|--------|-----|--------|--------|
| CORE | $0 | $0 | $0 | $0 | $0 | — |
| ESTIMATING | $13.00 | $65.00 | $29 | $119 | $65.00 | **80%** |
| SCHEDULING | $5.40 | $27.00 | $15 | $49 | $27.00 | **80%** |
| FINANCIALS | $25.00 | $125.00 | $25 | $129 | $125.00 | **80%** |
| DOCUMENTS | $12.00 | $60.00 | $15 | $69 | $60.00 | **80%** |
| TIMEKEEPING | $2.70 | $13.50 | $15 | $49 | $15 (collar) | 82% |
| MESSAGING | $2.70 | $13.50 | $9 | $29 | $13.50 | **80%** |
| BIDDING | $0.60 | $3.00 | $12 | $39 | $12 (collar) | 95% |
| WORKFORCE | $0 | $0 | $19 | $59 | $19 (collar) | 100% |
| COMPLIANCE | $0 | $0 | $15 | $39 | $15 (collar) | 100% |
| NEXFIND | $2.40 | $12.00 | $15 | $49 | $15 (collar) | 84% |
| **Total** | **$63.80** | | | | **$366.50** | **83%** |

vs. old flat pricing ($500): **27% savings for tenant (heavy user still saves)**
vs. old usage model ($132.40): +$234/mo, margin 52% → 83%

ACH total: $370.17 · CC total: $379.33

### Repriced Scenario D: Extreme AI (10× volume, stress test)

| Module | Variable Cost | ×5 | Cap | Charge | Margin |
|--------|-------------|-----|-----|--------|--------|
| ESTIMATING | $65.00 | $325 | $119 | $119 (CAP) | 45% |
| FINANCIALS | $115.00 | $575 | $129 | $129 (CAP) | 11% |
| DOCUMENTS | $45.00 | $225 | $69 | $69 (CAP) | 35% |
| Others (at collar) | ~$0 | — | — | $68 | ~100% |
| **Total** | **$225+** | | | **$385** | **42%** |

Extreme users still hurt margins when caps engage. But this represents < 1% of tenants. **Mitigation: "Fair Use" tier** — include generous allocation in collar, per-op pricing above it, no cap on the per-op tier. See Section 11.

### Blended Margin at 100 Tenants (40/40/20 mix)

| Segment | Count | Rev/tenant | Total Rev | Cost/tenant | Total Cost | Gross Margin |
|---------|-------|-----------|-----------|-------------|------------|-------------|
| Solo (A) | 40 | $40 | $1,600 | $1.04 | $41.60 | $1,558 (97%) |
| Mid-size (B) | 40 | $108 | $4,320 | $12.66 | $506.40 | $3,814 (88%) |
| Large (C) | 20 | $366.50 | $7,330 | $63.80 | $1,276.00 | $6,054 (83%) |
| **Total** | **100** | **avg $132.50** | **$13,250** | | **$1,824** | **$11,426 (86%)** |

vs. old model: $6,448 revenue → $13,250 revenue (**2.05× revenue increase**)
vs. old model: 72% margin → **86% margin** ✓

Infra cost: $135/mo → **Net margin at 100 tenants: $11,291/mo (85%)**

Old model net: $4,489/mo → New model net: $11,291/mo → **+$6,802/mo (+151%)**

### New Collar Revenue Floor (All Modules Enabled, Minimum Use)

$0 + $29 + $15 + $25 + $15 + $15 + $9 + $12 + $19 + $15 + $16.67 + $15 = **$185.67/mo**

vs. old collar floor ($129.67): **+$56/mo (+43%)** guaranteed minimum per full-platform tenant
vs. current flat pricing ($500): still **63% cheaper** for the tenant

---

## 11. Fair Use Tier — Extreme Usage Protection

For tenants that blow through caps (Scenario D), implement a two-tier structure per module:

**Tier 1 — Included:** First N operations per month are covered by the collar/cap model above.
**Tier 2 — Overage:** Operations beyond the included tier are billed at per-operation rate (no cap).

| Module | Included Ops (Tier 1) | Overage Rate (Tier 2) |
|--------|-----------------------|-----------------------|
| ESTIMATING | 150 extrapolations, 15 scans, 8 videos | $0.15/extrap, $0.60/scan, $1.25/video |
| FINANCIALS | 250 receipts, 400 prescreens | $0.20/receipt, $0.10/prescreen |
| DOCUMENTS | 120 imports, 25 plan sheets | $0.25/import, $0.25/plan sheet |
| SCHEDULING | 150 voice notes | $0.03/min transcription |
| MESSAGING | 80 voice messages | $0.03/min transcription |
| NEXFIND | 400 searches, 40 analyses | $0.03/search, $0.15/analysis |

**Tier 1 thresholds are set at ~75th percentile usage** — 75% of tenants never exceed them and experience pure collar/cap pricing. The 25% who exceed get transparent per-op billing.

With fair use on Scenario D (extreme):

| Module | Tier 1 Charge | Overage Ops | Overage Revenue | Total | Cost | Margin |
|--------|--------------|-----------|--------------------|-------|------|--------|
| ESTIMATING | $119 (cap) | 850 extrap, 85 scans, 42 video | $231 | $350 | $65 | 81% |
| FINANCIALS | $129 (cap) | 1250 receipts, 1600 prescreens | $410 | $539 | $115 | 79% |
| DOCUMENTS | $69 (cap) | 380 imports, 75 sheets | $114 | $183 | $45 | 75% |
| Others | $68 (collars) | — | $0 | $68 | ~$6 | 91% |
| **Total** | | | | **$1,140** | **$231** | **80%** |

Even the extreme outlier tenant now delivers 80% margin because overages are billed at per-op rates with no cap.

---

## 12. Comparison Summary — Old vs. New

| Metric | Old (1.2× markup) | New (5× markup) | Change |
|--------|-------------------|-----------------|--------|
| Markup multiplier | 1.2× | 5× | +317% |
| Avg collar (all modules) | $10.79 | $15.38 | +43% |
| Collar floor (full platform) | $129.67/mo | $185.67/mo | +43% |
| Blended margin (100 tenants) | 72% | **86%** | +14pts |
| Revenue (100 tenants) | $6,448/mo | $13,250/mo | +105% |
| Net profit (100 tenants) | $4,489/mo | $11,291/mo | +151% |
| Solo tenant price | $25/mo | $40/mo | +60% |
| Mid-size tenant price | $70/mo | $108/mo | +54% |
| Large tenant price | $132/mo | $367/mo | +178% |
| Large tenant vs. old flat | 73% savings | 27% savings | Still cheaper |
| Extreme user margin | negative on 2 modules | 80% w/ fair use | Fixed |
