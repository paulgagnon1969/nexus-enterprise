---
cam_id: EST-ACC-0003
title: "NexUNIT — Unit Price Discrimination Engine"
mode: EST
category: ACC
revision: "1.0"
status: draft
created: 2026-03-15
updated: 2026-03-15
author: Warp
website: false
scores:
  uniqueness: 9
  value: 9
  demonstrable: 7
  defensible: 8
  total: 83
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, estimator]
tags: [cam, estimating, accuracy, unit-pricing, coverage-extraction, normalization, procurement, materials]
---

# EST-ACC-0003: NexUNIT — Unit Price Discrimination Engine

> *The estimate says 130 SF. Home Depot says $12.99/roll. NexUNIT says: that roll covers 40 SF, so your effective cost is $0.32/SF — and you need 4 rolls.*

## Work ↔ Signal
> **The Work**: Three-tier coverage extraction that resolves the true per-project-unit cost from any retail product listing — regardless of how it's packaged or priced.
> **The Signal**: Pricing normalization accuracy across heterogeneous retail packaging reveals which suppliers genuinely cost less per installed unit, not per retail package. (→ Procurement Intelligence: true cost transparency)

## Position in the NexSTACK Procurement Pipeline

NexUNIT is **Layer 3** of a four-layer procurement stack. Each layer is a distinct CAM:

1. **PETL → Shop** (OPS-INTL-0002 NexCART) — Estimate line items auto-populate shopping carts with normalized material keys
2. **Scrape for Shop** (EST-INTG-0001 BOM Pricing) — Multi-provider catalog search across HD, Lowe's, Amazon with SSE streaming
3. **Unit Price Discrimination** (EST-ACC-0003 NexUNIT — this CAM) — Converts retail packaging prices to project estimate units
4. **Shopping Aggregator** (OPS-AUTO-0002 NexBUY) — Cross-project consolidated purchasing with per-project allocation

Without Layer 3, Layers 1–2 produce a shopping cart full of raw retail prices that can't be compared to each other or to the estimate. Layer 4 aggregates quantities that haven't been properly converted. NexUNIT is the bridge that makes the entire pipeline's cost math correct.

## The Problem

Retail products are sold in packaging units that don't match project estimate units:

- Insulation: sold per **roll** (15 in × 32 ft) — estimate says **SF**
- Drywall: sold per **sheet** (4 ft × 8 ft) — estimate says **SF**
- Lumber: sold per **piece** (2×4×8 ft) — estimate says **LF**
- Paint: sold per **gallon** (~350 SF coverage) — estimate says **SF**
- Roofing shingles: sold per **bundle** (⅓ square) — estimate says **SQ**
- Flooring: sold per **case** (25.03 SF/case) — estimate says **SF**

When Home Depot says "$12.99" and Lowe's says "$14.99," which is cheaper? **You can't know** until you resolve what each package actually covers in project units. A $14.99 roll that covers 88 SF is cheaper per SF than a $12.99 roll that covers 40 SF.

Every competitor treats the catalog price as the comparison unit. They all get this wrong.

## The NCC Advantage

NexUNIT resolves true unit pricing through a three-tier extraction strategy, each tier with a defined confidence level:

### Tier 1: Spec-Sheet Extraction (HIGH confidence)
Parses the product's `specifications` object (from BigBox/SerpAPI detail responses) for explicit coverage data:
- Direct coverage area fields ("Coverage Area (sq. ft.): 40.0")
- Width × Length computation ("Product Width: 15 in" × "Product Length: 32 ft" = 40 SF)
- Package quantity multiplier ("Number of Pieces: 8" × per-piece area)

Handles both array-format specs (`[{ name, value }]`) and object-format specs (`{ key: value }`), case-insensitive matching across 15+ known spec key variants.

### Tier 2: Title Dimension Parsing (MEDIUM confidence)
When spec sheets are unavailable, parses product title dimensions:
- Unicode-aware regex handles `'`, `'`, `′` (feet) and `"`, `"`, `″` (inches)
- Material-type detection (6 categories: insulation, drywall, plywood, lumber, roofing, flooring) determines how to interpret dimensions
- Context-aware unit inference: "15 in. × 32 ft." → width in inches, length in feet → 40 SF per roll
- Package quantity awareness: batts with short lengths multiply by package count

### Tier 3: Material-Type Heuristics (LOW confidence)
Industry-standard coverage defaults when neither specs nor title dimensions resolve:
- Roofing shingles: 3 bundles = 1 square (33.33 SF/bundle)
- Paint/primer: ~350 SF/gallon
- Concrete mix: 0.6 CF per 80lb bag, 0.45 CF per 60lb bag
- Mortar/thinset: ~95 SF/bag
- Caulk: ~12 LF/tube

### Unit Conversion System
Full conversion matrix between project units and coverage units:
- SF ↔ SY ↔ SQ (area)
- LF (linear)
- CF ↔ CY (volume)
- BF (board feet)
- 30+ unit aliases normalized to canonical keys (e.g., "sq ft", "sqft", "sq. ft.", "square feet" → SF)

### Output: Normalized Pricing
For every product, NexUNIT produces:
- `purchaseQty` — how many retail packages to buy: `ceil(projectQty / coverageValue)`
- `effectiveUnitPrice` — true cost per project unit: `productPrice / coverageValue`
- `totalCost` — actual spend: `purchaseQty × productPrice`
- `coverageConfidence` — HIGH / MEDIUM / LOW so PMs know when to double-check

## Why It Matters

- **Apples-to-apples comparison**: "$12.99/roll @ 40 SF" vs "$14.99/roll @ 88 SF" → $0.32/SF vs $0.17/SF. The "expensive" product is 47% cheaper per installed unit.
- **Correct purchase quantities**: "Need 130 SF of insulation" → "Buy 4 rolls" (not "buy 130 rolls" or "buy 1 roll"). Eliminates the most common field purchasing mistake.
- **CBA integrity**: The CBA engine (NexCART) scores suppliers by all-in cost per project unit. Without normalization, every comparison is wrong.
- **Aggregation integrity**: NexBUY's cross-project consolidation sums quantities in project units. If the unit conversion is wrong, the consolidated order is wrong.
- **Zero manual math**: Field crews don't do coverage math on their phone at the store. The cart already shows "4 rolls needed, $51.96 total."

## Expected Operational Impact

| Category | % of Revenue | What It Represents |
|----------|-------------|-------------------|
| **Mis-pricing prevention** | ~0.30% | Avoids selecting the "cheap" product that's actually more expensive per installed unit |
| **Over/under-ordering prevention** | ~0.20% | Correct purchase quantities eliminate return trips (under) and waste (over) |
| **CBA decision accuracy** | ~0.15% | Correct per-unit costs → correct supplier rankings → correct trip plans |
| **Total NexUNIT Impact** | **~0.65%** | **Pricing accuracy as a share of revenue** |

### Real-World Extrapolation by Tenant Size

| Annual Revenue | NexUNIT Impact (~0.65%) |
|---------------|------------------------|
| **$1M** | **~$6,500** |
| **$2M** | **~$13,000** |
| **$5M** | **~$32,500** |
| **$10M** | **~$65,000** |
| **$50M** | **~$325,000** |

Impact compounds: every procurement decision that touches material pricing flows through this normalization layer. The more materials per project, the more opportunities for incorrect unit comparison.

## Competitive Landscape

| Competitor | Unit Normalization? | Spec-Sheet Parsing? | Coverage Extraction? | Purchase Qty Calc? |
|------------|-----|-----|-----|-----|
| Procore | No | No | No | No |
| Buildertrend | No | No | No | No |
| CoConstruct | No | No | No | No |
| CompanyCam | No | No | No | No |
| JobNimbus | No | No | No | No |
| Fieldwire | No | No | No | No |
| Xactimate | No | No | No | No |
| Home Depot Pro Xtra | No | No | No | No |

No competitor normalizes retail product pricing to project estimate units. All treat the catalog sticker price as the comparison unit.

## Demo Script
1. **The problem**: Show a PETL line item: "R&R Insulation 6¼" — 130 SF." Open Home Depot. Show two insulation products: Roll A at $12.99, Roll B at $14.99. "Which is cheaper?"
2. **Raw comparison fails**: "If you compare sticker prices, you'd buy Roll A. Every contractor in America does this."
3. **NexUNIT resolves**: Show the CBA result. Roll A: 40 SF/roll (spec-sheet, HIGH confidence) → $0.32/SF, need 4 rolls = $51.96. Roll B: 88 SF/roll → $0.17/SF, need 2 rolls = $29.98. "Roll B is 42% cheaper. And you carry 2 rolls instead of 4."
4. **Confidence tiers**: Show a lumber item with MEDIUM confidence (title parse) and a paint item with LOW confidence (heuristic). "The system tells the PM when to trust the math and when to verify."

## Technical Implementation

### Core Module
`apps/api/src/modules/procurement/coverage-extractor.ts` — 627 lines, zero external dependencies.

### Key Functions
- `extractCoverage(product, projectUnit)` — three-tier extraction, returns `CoverageInfo` with value, unit, purchase label, confidence, source
- `normalizePricing(product, projectQty, projectUnit)` — end-to-end: extract coverage → convert units → compute purchase qty → compute effective price
- `normalizeUnit(raw)` — 30+ aliases to canonical keys (SF, LF, SY, SQ, EA, GAL, CF, CY, BF)
- `convertProjectUnit(from, to, qty)` — bidirectional unit conversion with fallback
- `detectMaterialType(title)` — classifies into 6 categories for tier 2/3 interpretation
- `parseTitleDimensions(title)` — Unicode-aware dimension regex with multi-unit inference

### Integration Point
Called from `ProcurementService.runCba()` at line 495:
```
const normalized = normalizePricing(enrichedProduct, item.cartQty, item.unit);
```
When normalization succeeds, the CBA engine uses `effectiveUnitPrice` ($/project-unit) instead of raw catalog price. Results persist to `ShoppingCartPricingSnapshot` and `ShoppingCartItem` with coverage metadata.

### Product Detail Enrichment
Search results from SerpAPI lack spec-sheet data. Before normalization, the CBA pipeline fetches full product detail (`catalogService.getProduct()`) to enable Tier 1 spec-sheet extraction. This is the difference between MEDIUM confidence (title-only) and HIGH confidence (spec-backed).

## Scoring Rationale

- **Uniqueness (9/10):** No construction/restoration SaaS normalizes retail packaging to project estimate units. Enterprise procurement systems have unit conversion, but none apply three-tier extraction from heterogeneous retail product data. Not 10 because the concept of unit conversion is well-understood — the innovation is the extraction strategy.
- **Value (9/10):** Every procurement cost decision flows through this layer. A single mis-priced material type across 10 projects compounds to significant waste. The "buy the cheaper sticker price" mistake is universal in construction — this eliminates it systematically.
- **Demonstrable (7/10):** The math is behind the scenes — users see "effective $0.32/SF" but not the extraction logic. Can be demoed effectively with a side-by-side raw-vs-effective price comparison. Not as visually dramatic as streaming search results or trip plans.
- **Defensible (8/10):** 627 lines of domain-specific material knowledge: 6 material types, 15+ spec-sheet key variants, Unicode-aware dimension parsing, industry-standard coverage defaults, full unit conversion matrix. Requires deep understanding of construction materials, retail packaging conventions, and supplier API data formats.

## Related CAMs

- `OPS-INTL-0002` — NexCART (Layer 1: PETL → Cart — provides the project quantities and units that NexUNIT normalizes against)
- `EST-INTG-0001` — Multi-Provider BOM Pricing (Layer 2: Scrape for Shop — provides the raw product data that NexUNIT normalizes)
- `OPS-AUTO-0002` — NexBUY (Layer 4: Aggregator — depends on NexUNIT for correct per-project-unit quantities)
- `OPS-INTL-0003` — NexCBAML (CBA engine uses NexUNIT's effective unit prices for all-in cost scoring)
- `FIN-INTL-0003` — NexPRICE Regional Pricing (normalized pricing feeds regional intelligence)
- `FIN-VIS-0001` — Purchase Reconciliation (normalized purchase quantities enable accurate reconciliation)

## Expansion Opportunities

- **Confidence escalation** — when tier 2/3 resolves, auto-fetch product detail to attempt tier 1 upgrade
- **Learning loop** — PM corrections ("this roll actually covers 48 SF") feed back to improve heuristics per product/SKU
- **SKU fingerprinting** — cache coverage per product ID so repeat searches skip extraction entirely
- **Custom material types** — company-defined material categories with custom coverage rules (e.g., specialty restoration materials)
- **Receipt-side normalization** — apply the same extraction to receipt OCR line items to compare "what was ordered" vs "what was bought" in the same units
- **Bulk tier detection** — some products have price breaks at quantity thresholds (e.g., "buy 10+ for 15% off") — extract from product detail

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-15 | Initial release — three-tier coverage extraction, 6 material types, full unit conversion, NexSTACK Layer 3 positioning |
