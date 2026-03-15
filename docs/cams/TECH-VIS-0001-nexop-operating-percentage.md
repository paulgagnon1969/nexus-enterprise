---
cam_id: "TECH-VIS-0001"
module_code: TECHNOLOGY
title: "NexOP — Nexus Operating Percentage"
mode: TECH
category: VIS
revision: "1.0"
tags: [cam, nexop, operating-percentage, roi, analytics, revenue-impact, dashboard, meta-feature, value-communication]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
website: true
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
scores:
  uniqueness: 9
  value: 9
  demonstrable: 9
  defensible: 8
  total: 88
---

# TECH-VIS-0001: NexOP — Nexus Operating Percentage

> *What percentage of your revenue is Nexus recovering? Now you know.*

## Work ↔ Signal
> **The Work**: NexOP expresses every module's impact as a percentage of annual revenue. Self-scaling, self-evident — '~9% of revenue recovered' is instantly meaningful at any company size.
> **The Signal**: NexOP is itself a marketplace signal — it tells prospective tenants exactly what operational improvement to expect, denominated in the only metric that matters. (→ Market Intelligence: value quantification)

## Elevator Pitch

NexOP is the unified metric that expresses every Nexus module's operational impact as a **percentage of annual revenue**. Instead of telling a $2M firm they save "$150K" and a $50M firm they save "$3.75M" — and hoping both numbers land — NexOP says **"~9% of revenue recovered"** and every company on earth immediately knows what that means for them. It's the first construction SaaS metric that makes platform ROI self-evident, self-scaling, and dashboard-ready.

## The Problem with Dollar-Based ROI

### Every SaaS Platform Has This Problem

Software vendors quote savings in dollars: "$50K/year in saved labor," "$200K in prevented waste." These numbers are:

- **Meaningless without context** — $50K is a rounding error for a $50M firm and a transformative number for a $500K shop. The same dollar figure lands completely differently depending on who's reading it.
- **Anchored to one firm size** — marketing says "saves $200K/year" based on a mid-size reference firm. The $1M startup thinks "that's twice my entire materials budget" and tunes out. The $50M GC thinks "that's one week of payroll" and isn't impressed.
- **Impossible to compare across modules** — "Receipt OCR saves $37K" and "BOM Pricing saves $299K" — are those both good? Which matters more for *my* company? Without a common denominator, there's no way to rank them.
- **Static** — dollar estimates don't grow with the company. A firm that doubles revenue from $5M to $10M doesn't intuitively know their Nexus value also doubled.

### What Competitors Do

Every construction SaaS — Procore, Buildertrend, CoConstruct — quotes dollar savings in marketing materials. None express impact as a percentage of revenue. None provide a live, per-tenant impact metric. None give prospects a way to self-calculate ROI without talking to sales.

## The NexOP Solution

### The Concept

NexOP (Nexus Operating Percentage) is a single number: **the percentage of annual revenue that Nexus recovers through operational impact across all active modules.**

For a typical Nexus tenant: **NexOP ≈ 6–12%**

That number is:
- **Self-scaling** — a $1M firm and a $50M firm both see a percentage that's meaningful in their context
- **Module-decomposable** — the total breaks down into per-module contributions so you can see exactly where the value comes from
- **Tier-aware** — the methodology accounts for scaling factors (headcount, CC spend, materials budget, project count) that vary by company size
- **Dashboard-ready** — can be displayed as a live metric: "Your NexOP: 8.7% — Nexus is recovering 8.7% of your annual revenue"

### How It's Calculated

Each Nexus module has a validated NexOP contribution computed against a $10M reference baseline:

**Step 1: Module NexOP**
Each CAM's operational impact is expressed as `% of revenue` at the $10M baseline. This percentage is derived from validated savings models that scale with specific cost drivers (CC spend, materials budget, labor spend, project count, headcount).

**Step 2: Tier Adjustment**
For firms above or below $10M, scaling ratios adjust the dollar equivalent while the percentage remains the reference metric. Some modules (compliance) have fixed-cost components that create a higher NexOP at lower tiers.

**Step 3: Aggregation**
Module NexOPs are summed to produce the total portfolio NexOP. Cross-module synergies (e.g., receipt OCR feeding prescreening feeding NexVERIFY) are not double-counted — each module's NexOP is independently derived.

### The NexOP Stack

| Module | NexOP | Dominant Driver |
|--------|-------|-----------------|
| **Financial** | ~9.37% | NexVERIFY (7.5%) + Purchase Recon (0.66%) + Prescreen (0.60%) + OCR (0.37%) + NexPRICE (0.24%) |
| **Estimating** | ~3.12% | BOM Pricing (2.99%) + Redis Caching (0.13%) |
| **Operations** | ~1.81% | Field Qty (0.61%) + NexFIND (0.54%) + Phantom Fleet (0.39%) + Tasks (0.27%) |
| **Technology** | ~1.51% | TUCKS (1.19%) + Smart Media (0.24%) + Graceful Fallback (0.08%) |
| **Compliance** | ~0.60% | NexCheck (0.40%) + OSHA Sync (0.20%) |
| **Total NexOP** | **~16.41%** | **Combined portfolio — conservative, no cross-module synergies counted** |

*Effective NexOP ranges from ~6–12% depending on which modules are active, tenant tier, and industry segment. The ~16% theoretical maximum assumes all modules are fully utilized.*

### NexOP by Tenant Tier

| Annual Revenue | Effective NexOP | Dollar Equivalent |
|---------------|-----------------|-------------------|
| **$1M** | ~9–12% | ~$90K–$120K |
| **$2M** | ~8–10% | ~$160K–$200K |
| **$5M** | ~7–9% | ~$350K–$450K |
| **$10M** | ~9% | ~$890K |
| **$50M** | ~6–8% | ~$3M–$4M |

The percentage is higher at lower tiers because compliance savings (fixed OSHA fines) and scope recovery (under-billed work) hit harder as a share of smaller revenue. The percentage compresses at $50M because some categories have fixed components.

## NexOP as a Product Feature

### The NexOP Dashboard (Planned)

A live dashboard in the NCC admin panel showing:

- **Headline metric**: "Your NexOP: 8.7%" — large, prominent, updated monthly
- **Module breakdown**: stacked bar or ring chart showing each module's contribution
- **Trend line**: NexOP over time — shows the value growing as the system learns (prescreen accuracy, cost book depth, supplier network)
- **Peer comparison**: "Your NexOP: 8.7% — Industry average: 6.2%" (anonymized, aggregated)
- **What-if calculator**: "If you activate BOM Pricing, your NexOP would increase by ~2.99%"

### Sales Integration

- **Website**: "Nexus recovers ~9% of revenue for the average restoration contractor" — no dollar figure needed
- **Proposal generator**: enter prospect's revenue → instant NexOP projection with module breakdown
- **Pricing justification**: "Your NexOP is 8.7%. Our platform costs 0.9% of revenue. That's a 9.7× return."

### Retention Signal

NexOP becomes a retention metric:
- **High NexOP** (>8%) — customer is getting strong value, low churn risk
- **Declining NexOP** — module underutilization; trigger proactive outreach
- **Low NexOP** (<4%) — customer isn't using key modules; activation campaign needed

## Competitive Landscape

| Competitor | ROI Metric? | Percentage-Based? | Per-Tenant Live? | Module-Level Breakdown? | Self-Scaling? |
|------------|-------------|-------------------|------------------|------------------------|---------------|
| Procore | Dollar estimates in marketing | No | No | No | No |
| Buildertrend | Dollar estimates in sales decks | No | No | No | No |
| CoConstruct | None | No | No | No | No |
| Sage 300 CRE | Dollar TCO studies | No | No | No | No |
| QuickBooks | None | No | No | No | No |

No competitor has a named, percentage-based, live, per-tenant operational impact metric. NexOP is a category-creating concept.

## Demo Script (60 seconds)

1. Open the NexOP dashboard → show the headline: **"Your NexOP: 8.7%"**
2. Expand the module ring chart → point out Financial (5.2%), Estimating (2.1%), Operations (0.9%), Compliance (0.3%), Technology (0.2%)
3. Show the trend line → "Your NexOP was 3.1% in month 1. As the prescreen engine learned and your cost book grew, it's now 8.7%."
4. Open the what-if calculator → toggle on BOM Pricing (currently inactive) → NexOP jumps to 11.7%. *"That one module adds 3% of your revenue in operational impact."*
5. Show peer comparison → "Industry average is 6.2%. You're in the top quartile."
6. Final statement: *"Every month, Nexus recovers 8.7% of your revenue. What would you do with that?"*

## Scoring Rationale

- **Uniqueness (9/10)**: No SaaS platform in any vertical — not just construction — has a named, per-tenant, live, percentage-based operational impact metric. Dollar-based ROI calculators exist but are static marketing tools. NexOP is a live product feature.

- **Value (9/10)**: NexOP doesn't create new savings — it makes existing savings *visible and communicable*. That visibility drives: (1) purchase decisions (prospects self-justify), (2) retention (customers see ongoing value), (3) expansion (the what-if calculator sells modules), (4) pricing power (NexOP/price ratio justifies premium pricing).

- **Demonstrable (9/10)**: The dashboard is visually compelling — a single number that summarizes platform value. The what-if calculator is interactive. The peer comparison creates competitive motivation. Every element demos in seconds.

- **Defensible (8/10)**: NexOP requires the full CAM portfolio to compute — you can't display "8.7% of revenue recovered" without the underlying modules actually recovering it. A competitor would need to build equivalent capabilities across all 16 CAMs, validate the savings models, and implement per-tenant tracking. The concept of a percentage metric is copyable; the validated data behind it is not.

**Total: 35/40** — Highest-scoring Technology CAM. Tied with NexPRICE and NexFIND for highest in the portfolio.

## Technical Requirements

- `NexOpScore` model — per-tenant, per-month aggregate with module breakdown
- `NexOpModuleContribution` — per-module contribution record linked to scoring methodology
- Monthly rollup job computing NexOP from active module usage and tenant profile (revenue tier, headcount, CC spend)
- Dashboard API: `GET /admin/nexop` returning current score, module breakdown, trend, peer comparison
- What-if engine: `POST /admin/nexop/simulate` accepting module activation toggles
- Peer aggregation: anonymized `NexOpScore` aggregation across tenants for benchmarking

## Related CAMs

Every CAM in the portfolio is a related CAM — NexOP is the meta-layer that aggregates their impact:
- `FIN-ACC-0001` NexVERIFY (~7.50%) — largest single NexOP contributor
- `EST-INTG-0001` BOM Pricing (~2.99%) — #2 contributor
- `TECH-INTL-0001` TUCKS (~1.19%) — workforce efficiency driver
- All other CAMs contribute to the total NexOP score

## Expansion Opportunities

- **NexOP Certification** — "NexOP Certified: 8%+" badge for contractors to display on proposals and websites
- **NexOP Benchmarking Report** — quarterly industry report showing NexOP distribution by company size, region, and specialty
- **NexOP-Based Pricing** — variable pricing tied to NexOP: companies pay more when they get more value (aligns incentives)
- **NexOP for Investors** — PE/VC firms evaluating construction companies could use NexOP as a technology efficiency signal
- **Client-Facing NexOP** — "This contractor uses Nexus and recovers 9% more operational value than the industry average" — trust signal for project owners
- **NexOP Goals** — tenants set NexOP targets ("reach 10% by Q4") and the system suggests module activations to get there

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial CAM — NexOP concept, methodology, dashboard design, competitive positioning |
