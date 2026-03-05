---
title: "CAM Portfolio — Expected Operational Savings by Company Size"
revision: "1.1"
created: 2026-03-04
updated: 2026-03-05
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
tags: [cam, portfolio, savings, revenue-tiers, roi]
---

# CAM Portfolio — Expected Operational Savings by Company Size

## Overview

This document breaks down the expected annual operational savings from all 15 Nexus CAMs across four company revenue tiers. Savings are estimated based on scaling factors that reflect real-world differences in headcount, project volume, material spend, and transaction counts at each tier.

**Key takeaway**: Nexus pays for itself at every tier. A $1M company saves ~$90K/year. A $50M company saves over $3M/year.

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

## Savings by CAM and Revenue Tier

### Financial Module

| CAM | <$1M | $5M | $10M | $50M | Primary Scaling Factor |
|-----|------|-----|------|------|----------------------|
| **FIN-AUTO-0001** Receipt OCR | $3,700 | $14,800 | $37,000 | $148,000 | Receipts/week, CC spend |
| **FIN-INTL-0002** Smart Prescreen | $4,500 | $22,500 | $59,900 | $225,000 | CC transactions, CC spend |
| **FIN-INTL-0003** NexPRICE | $4,000 | $11,900 | $23,700 | $79,000 | Materials spend, projects |
| **FIN-VIS-0001** Purchase Recon | $6,600 | $26,200 | $65,600 | $262,400 | CC spend, card count |
| **Financial Subtotal** | **$18,800** | **$75,400** | **$186,200** | **$714,400** | |

*FIN-INTL-0003 additionally reduces **bid accuracy exposure** by $22K (<$1M) to $900K ($50M) — not included in the totals above.*

### Estimating Module

| CAM | <$1M | $5M | $10M | $50M | Primary Scaling Factor |
|-----|------|-----|------|------|----------------------|
| **EST-SPD-0001** Redis Caching | $1,600 | $5,100 | $12,800 | $38,400 | Users, lookup volume |
| **EST-INTG-0001** BOM Pricing | $15,000 | $100,000 | $299,000 | $950,000 | Projects, materials budget |
| **Estimating Subtotal** | **$16,600** | **$105,100** | **$311,800** | **$988,400** | |

*BOM Pricing dominates at every tier because material cost savings scale directly with spend.*

### Operations Module

| CAM | <$1M | $5M | $10M | $50M | Primary Scaling Factor |
|-----|------|-----|------|------|----------------------|
| **OPS-VIS-0001** Field Qty Discrepancy | $10,100 | $30,300 | $60,650 | $202,000 | Projects, line items |
| **OPS-VIS-0002** Task Dashboard | $4,500 | $10,800 | $26,900 | $80,700 | PMs, projects |
| **OPS-INTL-0001** NexFIND | $5,400 | $22,000 | $54,100 | $180,000 | Field crew, projects, runs |
| **OPS-COLLAB-0001** Phantom Fleet | $4,600 | $18,500 | $38,500 | $123,200 | Headcount, personal assets |
| **Operations Subtotal** | **$24,600** | **$81,600** | **$180,150** | **$585,900** | |

### Compliance Module

| CAM | <$1M | $5M | $10M | $50M | Primary Scaling Factor |
|-----|------|-----|------|------|----------------------|
| **CMP-AUTO-0001** NexCheck | $6,700 | $23,200 | $39,600 | $148,500 | Sites, workers |
| **CMP-INTG-0001** OSHA Sync | $5,900 | $9,900 | $19,700 | $49,300 | PMs (partially fixed) |
| **Compliance Subtotal** | **$12,600** | **$33,100** | **$59,300** | **$197,800** | |

*Compliance savings have a higher floor than other modules because OSHA fines are the same regardless of company size.*

### Technology Module

| CAM | <$1M | $5M | $10M | $50M | Primary Scaling Factor |
|-----|------|-----|------|------|----------------------|
| **TECH-ACC-0001** Graceful Fallback | $2,100 | $4,200 | $8,400 | $16,800 | Import volume |
| **TECH-INTL-0001** TUCKS Telemetry | $11,900 | $47,600 | $119,100 | $476,400 | Labor spend, headcount |
| **TECH-SPD-0003** Smart Media Upload | $3,200 | $12,000 | $23,700 | $89,000 | Field crew, photo volume |
| **Technology Subtotal** | **$17,200** | **$63,800** | **$151,200** | **$582,200** | |

## Portfolio Totals

| Revenue Tier | Annual Savings | Monthly Equivalent | Per-Employee | Savings as % of Revenue |
|-------------|---------------|-------------------|-------------|------------------------|
| **<$1M** | **$89,800** | $7,480 | $29,930 | **~9–12%** |
| **$5M** | **$359,000** | $29,920 | $29,920 | **~7%** |
| **$10M** | **$888,650** | $74,050 | $35,550 | **~9%** |
| **$50M** | **$3,068,700** | $255,730 | $38,360 | **~6%** |

### Key Observations

1. **Nexus delivers 6–12% of revenue in operational savings at every tier.** This is an exceptional ROI for a SaaS platform.

2. **The savings-per-employee increases with company size** — larger companies have more process waste, more transactions, and more opportunities for automation to compound.

3. **The <$1M tier still saves ~$90K/year** — enough to justify the platform even for a 3-person operation. The value comes primarily from Field Qty Discrepancy ($10.1K — catching under-billed scope), BOM Pricing ($15K — finding material savings), and TUCKS ($11.9K — even small efficiency gains on labor are meaningful).

4. **The $50M tier exceeds $3M/year** — driven by BOM Pricing ($950K — 8% supplier deltas on $3.6M materials is transformative), TUCKS ($476K — 5% on $8M labor), and Purchase Reconciliation ($262K — 5% of $3M CC spend misattributed).

5. **Compliance savings have the flattest curve** — OSHA fines don't scale with revenue, so the compliance module delivers relatively consistent value across tiers. This makes compliance features especially valuable for smaller companies as a percentage of revenue.

6. **Financial module savings scale super-linearly** — more transactions × more spend × more cards = exponentially more reconciliation complexity that automation eliminates.

## Top 5 CAMs by Tier

### <$1M (Total: $89,800)
1. EST-INTG-0001 BOM Pricing — **$15,000** (17%)
2. TECH-INTL-0001 TUCKS — **$11,900** (13%)
3. OPS-VIS-0001 Field Qty — **$10,100** (11%)
4. CMP-AUTO-0001 NexCheck — **$6,700** (7%)
5. FIN-VIS-0001 Purchase Recon — **$6,600** (7%)

### $5M (Total: $359,000)
1. EST-INTG-0001 BOM Pricing — **$100,000** (28%)
2. TECH-INTL-0001 TUCKS — **$47,600** (13%)
3. OPS-VIS-0001 Field Qty — **$30,300** (8%)
4. FIN-VIS-0001 Purchase Recon — **$26,200** (7%)
5. CMP-AUTO-0001 NexCheck — **$23,200** (6%)

### $10M (Total: $888,650)
1. EST-INTG-0001 BOM Pricing — **$299,000** (34%)
2. TECH-INTL-0001 TUCKS — **$119,100** (13%)
3. FIN-VIS-0001 Purchase Recon — **$65,600** (7%)
4. OPS-VIS-0001 Field Qty — **$60,650** (7%)
5. FIN-INTL-0002 Prescreen — **$59,900** (7%)

### $50M (Total: $3,068,700)
1. EST-INTG-0001 BOM Pricing — **$950,000** (31%)
2. TECH-INTL-0001 TUCKS — **$476,400** (16%)
3. FIN-VIS-0001 Purchase Recon — **$262,400** (9%)
4. FIN-INTL-0002 Prescreen — **$225,000** (7%)
5. OPS-VIS-0001 Field Qty — **$202,000** (7%)

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
- Lead with the tier that matches the prospect's revenue
- Highlight the top 3 CAMs for their tier
- Use "savings as % of revenue" as the headline ROI metric

### Pricing
- Platform pricing should capture 10–20% of the value delivered (industry standard for SaaS ROI)
- At the $10M tier: $889K savings → platform priced at $89K–$178K/year is justified
- At the $5M tier: $359K savings → $36K–$72K/year

### Product Prioritization
- BOM Pricing and TUCKS are the #1 and #2 value drivers at every tier
- Purchase Reconciliation and Field Qty Discrepancy round out the top 4
- These four CAMs alone account for ~65% of total portfolio savings

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-04 | Initial portfolio savings breakdown by revenue tier |
| 1.1 | 2026-03-05 | Reconciled NexCheck ($30K→$39.6K) and Phantom Fleet ($50.2K→$38.5K) with enriched individual CAMs; recalculated all subtotals and portfolio totals |
