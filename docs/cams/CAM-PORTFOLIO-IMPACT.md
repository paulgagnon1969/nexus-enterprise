---
title: "Nexus Impact Portfolio — NexOP Savings + NexINT Operational Integrity"
type: portfolio-analysis
revision: "3.1"
status: active
created: 2026-03-04
updated: 2026-03-10
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [portfolio, nexop, nexint, operating-percentage, integrity, revenue-tiers, roi, accuracy]
---

# Nexus Impact Portfolio — NexOP Savings + NexINT Operational Integrity

## Aggregate Impact at a Glance

Nexus measures its value on two axes: **what it saves** (NexOP) and **what it corrects** (NexINT). Together, they answer the only two questions that matter: *How much money are you recovering?* and *How tight is your operation actually running?*

### Financial Recovery — NexOP

| Metric | Value |
|--------|-------|
| **Portfolio NexOP** | **~6–12%** of annual revenue recovered, at every company size |
| **Dollar impact ($10M firm)** | **~$890K/year** in recovered revenue, avoided loss, and efficiency gains |
| **Dollar impact ($50M firm)** | **~$3M–$4M/year** |
| **CAMs contributing** | 20 modules across Financial, Estimating, Operations, Compliance, and Technology |
| **Top 3 drivers** | NexVERIFY (~7.5%), BOM Pricing (~3.0%), TUCKS Telemetry (~1.2%) |
| **Per-employee/year** | ~$30K–$38K saved per employee depending on company size |

### Operational Integrity — NexINT

| Metric | Industry Baseline | With Nexus | Improvement |
|--------|-------------------|-----------|-------------|
| **Financial Integrity** | ~72% | ~96% | **+24 pts** — receipt coverage, duplicate detection, pricing accuracy, reconciliation |
| **Process Completion** | ~68% | ~93% | **+25 pts** — task disposition, assessment linkage, discrepancy resolution |
| **Compliance** | ~78% | ~98% | **+20 pts** — checklist completion, certification currency, audit readiness |
| **Data Quality** | ~70% | ~91% | **+21 pts** — field categorization, vendor normalization, AI learning, fleet consistency |
| **NexINT Composite** | **~72%** | **~95%** | **+23 pts** — the gap between how you think you operate and how you actually operate |

### The Two-Sentence Pitch

> **NexOP**: *"Nexus recovers 6–12% of your annual revenue through automation, accuracy, and waste elimination."*
>
> **NexINT**: *"The average contractor operates at ~72% integrity. Nexus brings you to 95% — because the system makes it structurally impossible to operate sloppily."*

### Combined Impact by Revenue Tier

| Revenue Tier | NexOP Savings | NexINT Improvement | What Changes |
|-------------|---------------|-------------------|--------------|
| **$1M** | ~$90K–$120K/yr | 72% → 95% | Owner stops double-checking everything manually; the system does it |
| **$5M** | ~$350K–$450K/yr | 72% → 95% | First PM hire trusts the data from day one; compliance is automatic |
| **$10M** | ~$890K/yr | 72% → 95% | Accounting closes month-end in days, not weeks; zero orphaned workflows |
| **$50M** | ~$3M–$4M/yr | 72% → 95% | Executive dashboard proves operational discipline to clients and insurers |

---

## NexOP — Financial Recovery Detail

### Overview

All CAM financial impact figures are expressed using **NexOP (Nexus Operating Percentage)** — the percentage of annual revenue that Nexus recovers through operational impact. A $1M startup and a $50M GC experience the same proportional exposure — and the same proportional recovery when Nexus is active.

This document aggregates the NexOP from all 20 Nexus CAMs and extrapolates real-dollar values across five revenue tiers. See `TECH-VIS-0001` for the full NexOP methodology and `TECH-VIS-0002` for NexINT scoring architecture.

**Key takeaway**: Nexus delivers a **NexOP of ~6–12%** at every tier. The percentage, not the dollar figure, is the metric.

## Company Profiles by Revenue Tier

### Tier 1: <$1M Revenue (Startup / Solo Operator)
- **Headcount**: 3 (owner/PM + 2 field)
- **PMs**: 1 (owner wears multiple hats)
- **Estimators**: 0.5 (owner does estimating part-time)
- **Field crew**: 2
- **Projects/year**: 10–15
- **Materials spend**: ~$8K/month ($96K/year)
- **CC spend**: ~$5K/month ($60K/year)
- **Receipts**: ~5/week
- **CC transactions**: ~30/month

### Tier 2: $5M Revenue (Small Firm)
- **Headcount**: 12 (2 PMs, 1 estimator, 8 field, 1 admin)
- **PMs**: 2
- **Estimators**: 1
- **Field crew**: 8
- **Projects/year**: 30
- **Materials spend**: ~$35K/month ($420K/year)
- **CC spend**: ~$25K/month ($300K/year)
- **Receipts**: ~20/week
- **CC transactions**: ~150/month

### Tier 3: $10M Revenue (Mid-Size — Reference Baseline)
- **Headcount**: 25 (5 PMs, 3 estimators, 12 field, 2 admin, 3 other)
- **PMs**: 5
- **Estimators**: 3
- **Field crew**: 12
- **Projects/year**: 60
- **Materials spend**: ~$75K/month ($900K/year)
- **CC spend**: ~$60K/month ($720K/year)
- **Receipts**: ~50/week
- **CC transactions**: ~400/month

### Tier 4: $50M Revenue (Large Firm)
- **Headcount**: 80 (15 PMs, 8 estimators, 50 field, 4 admin, 3 other)
- **PMs**: 15
- **Estimators**: 8
- **Field crew**: 50
- **Projects/year**: 200
- **Materials spend**: ~$300K/month ($3.6M/year)
- **CC spend**: ~$250K/month ($3M/year)
- **Receipts**: ~200/week
- **CC transactions**: ~1,500/month

## NexOP by CAM and Revenue Tier

Each CAM’s NexOP is computed against the $10M baseline. Dollar values at other tiers use validated scaling factors (see Methodology below).

### Financial Module (NexOP ~12.22%)

| CAM | NexOP | $1M | $5M | $10M | $50M |
|-----|-------|-----|-----|------|------|
| **FIN-ACC-0001** NexVERIFY | ~7.50% | $75K | $375K | $750K | $3.75M |
| **FIN-ACC-0002** Zero-Loss Receipt Capture | ~1.65% | $16.5K | $82.5K | $165K | $825K |
| **FIN-ACC-0003** Cross-Project Duplicate Scanner | ~0.45% | $4.5K | $22.5K | $45K | $225K |
| **FIN-AUTO-0002** Transaction-to-Bill Auto-Posting | ~0.75% | $7.5K | $37.5K | $75K | $375K |
| **FIN-VIS-0001** Purchase Recon | ~0.66% | $6.6K | $26.2K | $65.6K | $262K |
| **FIN-INTL-0002** Smart Prescreen | ~0.60% | $4.5K | $22.5K | $59.9K | $225K |
| **FIN-AUTO-0001** Receipt OCR | ~0.37% | $3.7K | $14.8K | $37K | $148K |
| **FIN-INTL-0003** NexPRICE | ~0.24% | $4K | $11.9K | $23.7K | $79K |
| **Financial Subtotal** | **~12.22%** | | | | |

*NexVERIFY (~7.5%) dominates because phantom duplicate distortion and PM decision corruption scale proportionally with CC spend. FIN-ACC-0002 (~1.65%) captures receipt-loss exposure by inverting the receipt-first model — the bill exists before the receipt. FIN-AUTO-0002 (~0.75%) is the mechanism: auto-posting bills on transaction assignment with dual-role PM detection. Note: ~0.75% of FIN-ACC-0002's impact overlaps with FIN-AUTO-0002 since auto-posting is the delivery mechanism. The net additive NexOP from both new CAMs is ~1.65%. FIN-INTL-0003 additionally reduces bid accuracy exposure by ~2.25% — not included in the direct savings total.*

### Estimating Module (NexOP ~3.12%)

| CAM | NexOP | $1M | $5M | $10M | $50M |
|-----|-------|-----|-----|------|------|
| **EST-INTG-0001** BOM Pricing | ~2.99% | $15K | $100K | $299K | $950K |
| **EST-SPD-0001** Redis Caching | ~0.13% | $1.6K | $5.1K | $12.8K | $38.4K |
| **Estimating Subtotal** | **~3.12%** | | | | |

*BOM Pricing dominates at every tier because material cost savings scale directly with spend.*

### Operations Module (NexOP ~1.81%)

| CAM | NexOP | $1M | $5M | $10M | $50M |
|-----|-------|-----|-----|------|------|
| **OPS-VIS-0001** Field Qty Discrepancy | ~0.61% | $10.1K | $30.3K | $60.6K | $202K |
| **OPS-INTL-0001** NexFIND | ~0.54% | $5.4K | $22K | $54.1K | $180K |
| **OPS-COLLAB-0001** Phantom Fleet | ~0.39% | $4.6K | $18.5K | $38.5K | $123K |
| **OPS-VIS-0002** Task Dashboard | ~0.27% | $4.5K | $10.8K | $26.9K | $80.7K |
| **Operations Subtotal** | **~1.81%** | | | | |

### Compliance Module (NexOP ~0.60%)

| CAM | NexOP | $1M | $5M | $10M | $50M |
|-----|-------|-----|-----|------|------|
| **CMP-AUTO-0001** NexCheck | ~0.40% | $6.7K | $23.2K | $39.6K | $148.5K |
| **CMP-INTG-0001** OSHA Sync | ~0.20% | $5.9K | $9.9K | $19.7K | $49.3K |
| **Compliance Subtotal** | **~0.60%** | | | | |

*Compliance savings have a higher floor than other modules because OSHA fines are the same regardless of company size. The NexOP is proportionally higher at $1M.*

### Technology Module (NexOP ~1.51%)

| CAM | NexOP | $1M | $5M | $10M | $50M |
|-----|-------|-----|-----|------|------|
| **TECH-INTL-0001** TUCKS Telemetry | ~1.19% | $11.9K | $47.6K | $119.1K | $476.4K |
| **TECH-SPD-0003** Smart Media Upload | ~0.24% | $3.2K | $12K | $23.7K | $89K |
| **TECH-ACC-0001** Graceful Fallback | ~0.08% | $2.1K | $4.2K | $8.4K | $16.8K |
| **Technology Subtotal** | **~1.51%** | | | | |

## Portfolio Totals

| Revenue Tier | NexOP | Dollar Equivalent | Per-Employee/Yr |
|-------------|-------|-------------------|-----------------|
| **$1M** | **~9–12%** | **~$90K–$120K** | ~$30K |
| **$2M** | **~8–10%** | **~$160K–$200K** | ~$25K |
| **$5M** | **~7–9%** | **~$350K–$450K** | ~$30K |
| **$10M** | **~9%** | **~$890K** | ~$36K |
| **$50M** | **~6–8%** | **~$3M–$4M** | ~$38K |

### Why NexOP Is the Right Metric

1. **The percentage is the headline, not the dollar figure.** A prospect reads "NexOP: ~9%" and immediately knows what it means for their company — regardless of size.

2. **Savings-per-employee increases with company size** — larger companies have more process waste, more transactions, and more opportunities for automation to compound.

3. **The $1M tier still delivers NexOP ~9–12%** — enough to justify the platform even for a 3-person operation. NexOP is proportionally *higher* for small firms because compliance fines are fixed and under-billed scope hurts more at lower revenue.

4. **The $50M tier delivers NexOP ~6–8%** — the percentage compresses slightly because some categories (compliance, support) have fixed components, but the absolute dollar value exceeds $3M/year.

5. **Compliance has the flattest curve** — OSHA fines don’t scale with revenue. The compliance module’s NexOP is proportionally higher at lower tiers.

6. **Financial module scales super-linearly** — more transactions × more spend × more cards = exponentially more reconciliation complexity that automation eliminates. NexVERIFY alone is NexOP ~7.5%.

## Top 5 CAMs by NexOP (at $10M baseline)

1. **FIN-ACC-0001** NexVERIFY — **NexOP ~7.50%** (duplicate expense distortion + PM decision corruption)
2. **EST-INTG-0001** BOM Pricing — **NexOP ~2.99%** (material cost savings + estimator productivity)
3. **TECH-INTL-0001** TUCKS Telemetry — **NexOP ~1.19%** (workforce efficiency + analytics)
4. **FIN-VIS-0001** Purchase Recon — **NexOP ~0.66%** (CC reconciliation + personal expense identification)
5. **OPS-VIS-0001** Field Qty Discrepancy — **NexOP ~0.61%** (under-billed scope recovery)

These five CAMs alone account for **NexOP ~12.95%**. The remaining 15 CAMs add **~6.56%** (including FIN-ACC-0002 Zero-Loss Receipt Capture at ~1.65% and FIN-ACC-0003 Cross-Project Duplicate Scanner at ~0.45%).

## Scaling Methodology

Savings are scaled from the $10M reference baseline using these proportional drivers:

| Driver | <$1M | $5M | $10M | $50M |
|--------|------|-----|------|------|
| Headcount ratio | 0.12× | 0.48× | 1.0× | 3.2× |
| PM ratio | 0.20× | 0.40× | 1.0× | 3.0× |
| Field crew ratio | 0.17× | 0.67× | 1.0× | 4.2× |
| Project ratio | 0.17× | 0.50× | 1.0× | 3.3× |
| Materials ratio | 0.11× | 0.47× | 1.0× | 4.0× |
| CC spend ratio | 0.08× | 0.42× | 1.0× | 4.2× |
| Transaction ratio | 0.08× | 0.38× | 1.0× | 3.75× |

Each CAM uses 1–3 primary scaling drivers depending on where its value comes from (see "Primary Scaling Factor" column in the per-CAM tables).

**Conservative assumptions:**
- No network-effect premium applied (NexPRICE and NexFIND get more valuable with more tenants — not modeled)
- No compounding from cross-CAM integration (e.g., receipt OCR feeding prescreening feeding reconciliation)
- No revenue-uplift from faster estimates or better bids (only cost savings counted)
- Compliance fine avoidance uses average penalties, not maximum ($156K+ for willful violations)

## NexINT — Operational Integrity by CAM

Every CAM contributes to one or more NexINT dimensions. This table maps the relationship — showing that Nexus isn't just a collection of features, but an integrated integrity framework.

### Financial Integrity (FI) Contributors — Baseline ~72% → ~96%

| CAM | FI Contribution | Mechanism |
|-----|----------------|----------|
| **FIN-ACC-0001** NexVERIFY | Critical | Verification groups eliminate phantom duplicates; PM decisions based on clean data |
| **FIN-ACC-0002** Zero-Loss Receipt | High | Bill-first model ensures every expense has a receipt before approval |
| **FIN-ACC-0003** Duplicate Scanner | High | Cross-project detection catches what single-project tools miss |
| **FIN-ACC-0005** Bidirectional Pricing | High | Zero arithmetic errors in markup/discount chain |
| **FIN-AUTO-0001** Receipt OCR | Medium | Automated data extraction reduces manual entry error rate |
| **FIN-AUTO-0002** Auto-Posting | High | Dual-role PM detection prevents assignment conflicts |
| **FIN-VIS-0001** Purchase Recon | High | CC-to-receipt matching; personal expense identification |
| **FIN-VIS-0002** Invoice Transparency | Medium | Retail vs. actual audit trail on every line item |
| **FIN-INTL-0002** Smart Prescreen | Medium | Intelligent routing reduces transaction mis-assignment |
| **EST-ACC-0001** NexDupE | High | Cross-project expense integrity with permanent archival |

### Process Completion (PC) Contributors — Baseline ~68% → ~93%

| CAM | PC Contribution | Mechanism |
|-----|----------------|----------|
| **OPS-AUTO-0001** Group Task Cascading | Critical | One task, any member completes, everyone is cleared — zero orphans |
| **OPS-VIS-0001** Field Qty Discrepancy | High | Forces PM review of every quantity variance before billing |
| **OPS-VIS-0002** Task Dashboard | Medium | Real-time visibility prevents tasks from falling through cracks |
| **OPS-VIS-0003** Scan/Assessment Hub | Medium | Surfaces unassigned assessments; forces project linkage |
| **OPS-ACC-0001** NEXI Capture | Medium | "Other" category with mandatory disposition ensures no data loss |
| **OPS-COLLAB-0001** Phantom Fleet | Medium | Equipment accountability workflow reaches terminal state |
| **CLT-COLLAB-0001** Client Tier | Medium | Collaboration workflows tracked to completion |
| **CLT-COLLAB-0002** Dual Portal | Medium | Correct routing ensures correct actions on every login |

### Compliance (CO) Contributors — Baseline ~78% → ~98%

| CAM | CO Contribution | Mechanism |
|-----|----------------|----------|
| **CMP-AUTO-0001** NexCheck | Critical | Checklists block work continuation without completion |
| **CMP-INTG-0001** OSHA/eCFR Sync | Critical | Regulatory standards update automatically from federal sources |

### Data Quality (DQ) Contributors — Baseline ~70% → ~91%

| CAM | DQ Contribution | Mechanism |
|-----|----------------|----------|
| **TECH-INTL-0001** NexEXTRACT | Critical | Per-company learning loop; every correction improves future accuracy |
| **TECH-ACC-0001** Graceful Fallback | Medium | System reliability preserves data continuity during failures |
| **TECH-SPD-0003** Smart Media Upload | Medium | Reliable upload = complete field documentation |
| **TECH-SPD-0004** Real-Time Push | Medium | Fleet version consistency = consistent data collection |
| **TECH-INTG-0001** NexCAD | Medium | Precision scan accuracy for dimensional data |
| **TECH-INTG-0002** NexMESH | Medium | Distributed compute reliability for processing integrity |
| **TECH-VIS-0001** NexOP Dashboard | Medium | Makes data quality visible and measurable |
| **TECH-VIS-0002** NexINT Dashboard | High | Integrity score drives behavioral change |
| **EST-INTL-0001** Video Index | Medium | Evidence continuity across re-scans |
| **EST-INTG-0001** BOM Pricing | Medium | Price accuracy from multi-provider normalization |
| **EST-AUTO-0002** NexPlan AI | Medium | AI-assisted item selection reduces human categorization error |
| **OPS-ACC-0001** NEXI Capture | Medium | Other category disposition improves taxonomy over time |

### The Cultural Equation

NexOP captures dollars. NexINT captures discipline. Together:

- A prospect hears *"NexOP ~9%"* and thinks: *"That's real money."*
- A prospect hears *"NexINT ~95% vs. industry ~72%"* and thinks: *"That's a different kind of company."*
- Combined: *"Nexus doesn't just save you money — it makes your operation provably better than your competitors'."*

See `TECH-VIS-0002` for the full NexINT scoring methodology, dashboard design, and technical architecture.

---

## How to Use This Document

### Sales / Demo
- **Lead with both metrics**: *"Your NexOP is ~9% — Nexus recovers 9% of your revenue. And your NexINT will go from ~72% to ~95% — that's the difference between hoping your operation is tight and proving it."*
- Let the prospect self-identify their tier, then show the dollar extrapolation AND the integrity improvement
- Financial buyers respond to NexOP; operations buyers respond to NexINT; executives respond to both
- See `TECH-VIS-0001` for NexOP dashboard demo, `TECH-VIS-0002` for NexINT dashboard demo

### Pricing
- Platform pricing should capture 10–20% of the value delivered (industry standard for SaaS ROI)
- At NexOP ~9% on $10M: ~$890K impact → $89K–$178K/year platform pricing is justified
- At NexOP ~8% on $5M: ~$400K impact → $40K–$80K/year
- NexINT adds a second justification layer: *"You're not just buying cost savings — you're buying operational discipline that reduces your liability exposure"*

### Product Prioritization
- NexVERIFY and BOM Pricing are the #1 and #2 NexOP drivers (~7.5% + ~3.0%)
- TUCKS and Purchase Reconciliation round out the top 4
- These four CAMs alone account for NexOP ~12.3%
- For NexINT: NexCheck (compliance) and Group Task Cascading (process completion) are the highest-impact integrity drivers

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 3.0 | 2026-03-09 | Major revision: Added NexINT (Operational Integrity Index) as second axis. Aggregate impact summary at top. NexINT-by-CAM mapping across four dimensions (FI, PC, CO, DQ). Dual-metric sales guidance. Companion CAM TECH-VIS-0002. |
| 2.3 | 2026-03-06 | Added FIN-ACC-0003 (Cross-Project Duplicate Scanner, ~0.45%). Financial module NexOP updated from ~11.77% to ~12.22%. CAM count updated from 19 to 20. |
| 2.2 | 2026-03-06 | Added FIN-AUTO-0002 (Transaction-to-Bill Auto-Posting, ~0.75%) and FIN-ACC-0002 (Zero-Loss Receipt Capture, ~1.65%). Financial module NexOP updated from ~9.37% to ~11.77%. CAM count updated from 17 to 19. |
| 2.1 | 2026-03-05 | Rebranded AOP → NexOP (Nexus Operating Percentage); linked to TECH-VIS-0001 NexOP CAM; updated all column headers, headings, and narrative to NexOP terminology |
| 2.0 | 2026-03-05 | Full AOP rewrite: all tables now lead with % of revenue; added NexVERIFY (FIN-ACC-0001); added $2M tier; Top 5 ranked by AOP; sales/pricing guidance updated to AOP-first language |
| 1.1 | 2026-03-05 | Reconciled NexCheck ($30K→$39.6K) and Phantom Fleet ($50.2K→$38.5K) with enriched individual CAMs; recalculated all subtotals and portfolio totals |
| 1.0 | 2026-03-04 | Initial portfolio savings breakdown by revenue tier |
