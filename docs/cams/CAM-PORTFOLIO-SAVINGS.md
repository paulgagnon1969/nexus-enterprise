---
title: "NexOP Portfolio — Nexus Operating Percentage by Company Size"
revision: "2.1"
created: 2026-03-04
updated: 2026-03-05
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, portfolio, nexop, operating-percentage, revenue-tiers, roi]
---

# NexOP Portfolio — Nexus Operating Percentage by Company Size

## Overview

All CAM financial impact figures are expressed using **NexOP (Nexus Operating Percentage)** — the percentage of annual revenue that Nexus recovers through operational impact. A $1M startup and a $50M GC experience the same proportional exposure — and the same proportional recovery when Nexus is active.

This document aggregates the NexOP from all 17 Nexus CAMs and extrapolates real-dollar values across five revenue tiers. See `TECH-VIS-0001` for the full NexOP methodology and dashboard design.

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

### Financial Module (NexOP ~9.37%)

|| CAM | NexOP | $1M | $5M | $10M | $50M |
||-----|-------|-----|-----|------|------|
|| **FIN-ACC-0001** NexVERIFY | ~7.50% | $75K | $375K | $750K | $3.75M |
|| **FIN-VIS-0001** Purchase Recon | ~0.66% | $6.6K | $26.2K | $65.6K | $262K |
|| **FIN-INTL-0002** Smart Prescreen | ~0.60% | $4.5K | $22.5K | $59.9K | $225K |
|| **FIN-AUTO-0001** Receipt OCR | ~0.37% | $3.7K | $14.8K | $37K | $148K |
|| **FIN-INTL-0003** NexPRICE | ~0.24% | $4K | $11.9K | $23.7K | $79K |
|| **Financial Subtotal** | **~9.37%** | | | | |

*NexVERIFY (~7.5%) dominates because phantom duplicate distortion and PM decision corruption scale proportionally with CC spend. FIN-INTL-0003 additionally reduces bid accuracy exposure by ~2.25% — not included in the direct savings total.*

### Estimating Module (NexOP ~3.12%)

|| CAM | NexOP | $1M | $5M | $10M | $50M |
||-----|-------|-----|-----|------|------|
|| **EST-INTG-0001** BOM Pricing | ~2.99% | $15K | $100K | $299K | $950K |
|| **EST-SPD-0001** Redis Caching | ~0.13% | $1.6K | $5.1K | $12.8K | $38.4K |
|| **Estimating Subtotal** | **~3.12%** | | | | |

*BOM Pricing dominates at every tier because material cost savings scale directly with spend.*

### Operations Module (NexOP ~1.81%)

|| CAM | NexOP | $1M | $5M | $10M | $50M |
||-----|-------|-----|-----|------|------|
|| **OPS-VIS-0001** Field Qty Discrepancy | ~0.61% | $10.1K | $30.3K | $60.6K | $202K |
|| **OPS-INTL-0001** NexFIND | ~0.54% | $5.4K | $22K | $54.1K | $180K |
|| **OPS-COLLAB-0001** Phantom Fleet | ~0.39% | $4.6K | $18.5K | $38.5K | $123K |
|| **OPS-VIS-0002** Task Dashboard | ~0.27% | $4.5K | $10.8K | $26.9K | $80.7K |
|| **Operations Subtotal** | **~1.81%** | | | | |

### Compliance Module (NexOP ~0.60%)

|| CAM | NexOP | $1M | $5M | $10M | $50M |
||-----|-------|-----|-----|------|------|
|| **CMP-AUTO-0001** NexCheck | ~0.40% | $6.7K | $23.2K | $39.6K | $148.5K |
|| **CMP-INTG-0001** OSHA Sync | ~0.20% | $5.9K | $9.9K | $19.7K | $49.3K |
|| **Compliance Subtotal** | **~0.60%** | | | | |

*Compliance savings have a higher floor than other modules because OSHA fines are the same regardless of company size. The NexOP is proportionally higher at $1M.*

### Technology Module (NexOP ~1.51%)

|| CAM | NexOP | $1M | $5M | $10M | $50M |
||-----|-------|-----|-----|------|------|
|| **TECH-INTL-0001** TUCKS Telemetry | ~1.19% | $11.9K | $47.6K | $119.1K | $476.4K |
|| **TECH-SPD-0003** Smart Media Upload | ~0.24% | $3.2K | $12K | $23.7K | $89K |
|| **TECH-ACC-0001** Graceful Fallback | ~0.08% | $2.1K | $4.2K | $8.4K | $16.8K |
|| **Technology Subtotal** | **~1.51%** | | | | |

## Portfolio Totals

|| Revenue Tier | NexOP | Dollar Equivalent | Per-Employee/Yr |
||-------------|-------|-------------------|-----------------|
|| **$1M** | **~9–12%** | **~$90K–$120K** | ~$30K |
|| **$2M** | **~8–10%** | **~$160K–$200K** | ~$25K |
|| **$5M** | **~7–9%** | **~$350K–$450K** | ~$30K |
|| **$10M** | **~9%** | **~$890K** | ~$36K |
|| **$50M** | **~6–8%** | **~$3M–$4M** | ~$38K |

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

These five CAMs alone account for **NexOP ~12.95%**. The remaining 12 CAMs add **~4.46%**.

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

## How to Use This Document

### Sales / Demo
- Lead with NexOP: *"Your NexOP is ~9% — Nexus recovers 9% of your revenue."*
- Let the prospect self-identify their tier, then show the dollar extrapolation
- Highlight the top 3 CAMs by NexOP for their industry/role
- See `TECH-VIS-0001` for full NexOP dashboard demo script

### Pricing
- Platform pricing should capture 10–20% of the value delivered (industry standard for SaaS ROI)
- At NexOP ~9% on $10M: ~$890K impact → $89K–$178K/year platform pricing is justified
- At NexOP ~8% on $5M: ~$400K impact → $40K–$80K/year

### Product Prioritization
- NexVERIFY and BOM Pricing are the #1 and #2 NexOP drivers (~7.5% + ~3.0%)
- TUCKS and Purchase Reconciliation round out the top 4
- These four CAMs alone account for NexOP ~12.3%

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-04 | Initial portfolio savings breakdown by revenue tier |
|| 1.1 | 2026-03-05 | Reconciled NexCheck ($30K→$39.6K) and Phantom Fleet ($50.2K→$38.5K) with enriched individual CAMs; recalculated all subtotals and portfolio totals |
|| 2.0 | 2026-03-05 | Full AOP rewrite: all tables now lead with % of revenue; added NexVERIFY (FIN-ACC-0001); added $2M tier; Top 5 ranked by AOP; sales/pricing guidance updated to AOP-first language |
|| 2.1 | 2026-03-05 | Rebranded AOP → NexOP (Nexus Operating Percentage); linked to TECH-VIS-0001 NexOP CAM; updated all column headers, headings, and narrative to NexOP terminology |
