---
cam_id: CLT-INTL-0001
title: "NexFIT — Personalized Module Discovery & ROI Engine"
mode: CLT
category: INTL
revision: "1.0"
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
scores:
  uniqueness: 9
  value: 9
  demonstrable: 10
  defensible: 8
  total: 90
website: true
visibility:
  public: true
  internal: true
  roles: [all]
tags: [cam, nexfit, discovery, roi, questionnaire, onboarding, lead-capture, personalization, intelligence, conversion]
---

# CLT-INTL-0001: NexFIT — Personalized Module Discovery & ROI Engine

> *You don't know what you don't know — until the system shows you what you're losing.*

## Work ↔ Signal
> **The Work**: An interactive needs-analysis wizard that asks 8 questions about a contractor's business, then returns a personalized three-tier module recommendation (Essential / Discovery / Growth) with dollar-ROI projections for every module.
> **The Signal**: A top-of-funnel conversion engine that transforms anonymous visitors into informed prospects who understand *exactly* how NCC recovers revenue for their specific business profile. (→ Lead capture, qualification, and lifecycle communication)

---

## I. The Problem

Contractors evaluating NCC face a catalog of 18+ modules across estimating, financials, compliance, workforce, scheduling, and AI tooling. The current billing page shows them as a flat list with prices. There is no guidance, no personalization, and no context for *which modules matter for which business*.

The result:
- **Low module activation**: Users sign up and stick with 1-2 obvious modules, missing 5-10 that would compound value.
- **Missed revenue**: Every un-activated module is revenue left on the table — both for NCC (subscription revenue) and the contractor (operational recovery they don't know they're losing).
- **The "don't know what I don't know" gap**: A restoration contractor doesn't think to activate TIMEKEEPING until they realize their crew hours are untracked. A bookkeeper doesn't think to activate ESTIMATING until they see that reconciliation fails without structured estimate data. The connections aren't obvious from a price list.

No competitor in construction SaaS offers personalized module recommendations based on business profile analysis. The standard approach is either "here's the feature list" or "talk to a salesperson." Neither works for contractors who evaluate tools at 11pm on their phone.

---

## II. The NexFIT Engine

### Architecture

NexFIT is a **pure-function engine** with zero database dependencies. The entire system is a TypeScript function: `answers → recommendations`. This makes it:
- **Instant**: No database queries, no API calls to external services. Analysis completes in <5ms.
- **Testable**: Pure function with deterministic output. Every input produces the same recommendations.
- **Portable**: Runs anywhere — API, CLI, embedded in the web app, or in a future mobile onboarding flow.

### The Questionnaire (8 Questions)

1. **What's your role?** — Owner / PM / Estimator / Field Supervisor / Office Admin / Bookkeeper
2. **What's your primary trade?** — General Contractor / Restoration / Electrical / Plumbing / HVAC / Roofing / Other
3. **Company size?** — Solo / 2-5 / 6-15 / 16-50 / 50+
4. **Annual revenue?** — Logarithmic slider: $250K → $50M+
5. **What tools do you use today?** — Multi-select: Spreadsheets, Xactimate, QuickBooks, Procore, Buildertrend, Paper, None
6. **Where do you lose the most time?** — Multi-select: Estimating, Scheduling, Receipt tracking, Invoicing, Finding suppliers, Compliance, Client communication, Managing crews
7. **What keeps you up at night?** — Multi-select: Missing receipts, Budget overruns, Scheduling delays, Client disputes, Compliance risk, Finding good subs, Cash flow, Employee tracking
8. **What would make the biggest difference?** — Multi-select: Faster estimates, Better financial visibility, Automated compliance, Client transparency, Mobile field tools, Supplier discovery, All-in-one platform

Each answer is tagged with module relevance codes and optional weight multipliers. Multi-select answers accumulate relevance across multiple modules simultaneously.

### Inference Rules — "You Don't Know What You Don't Know"

This is the differentiator. Beyond direct answer-to-module mapping, NexFIT applies **inference rules** that surface modules the user didn't ask for:

- Selects "Estimating" as pain point → needs **FINANCIALS** (estimates create purchases → purchases need tracking)
- Selects "Receipt tracking" → needs **DOCUMENTS** (receipts are documents that need OCR + storage)
- Has field crews (size > 5) → needs **TIMEKEEPING + COMPLIANCE** (crew time + safety tracking)
- Uses Xactimate → needs **XACT_IMPORT** (existing workflow feeds directly into NCC)
- Selects "Finding suppliers" → needs **NEXFIND** (crowdsourced supplier intelligence)
- Selects "Client disputes" → needs **DOCUMENTS + FINANCIALS** (audit trail + invoice transparency)
- Role is Bookkeeper → needs **FINANCIALS + ESTIMATING** (reconciliation requires both)
- Trade is Restoration → needs **XACT_IMPORT + NEXBRIDGE_ASSESS** (Xactimate + video assessment are restoration essentials)
- Any company > $2M annual → **FINANCIALS** is always Essential (at scale, financial leakage is guaranteed)

These rules encode domain knowledge that contractors don't have. They represent the "you don't know what you don't know" insight that a human sales consultant would provide — but delivered instantly, at scale, 24/7.

### Three-Tier Recommendation

Every recommended module is assigned to one of three tiers based on relevance scoring:

**Essential** (★): Directly solves the user's stated needs. High direct-score from explicit pain point answers.

**Discovery** (◆): The user didn't ask for it, but their profile says they need it. These are inferred from indirect signals — the module that the bookkeeper doesn't know she needs until she sees it explained in context.

**Growth** (▲): Aspirational modules that compound value as the business scales. Lower immediate urgency, but high long-term ROI.

### NexOP ROI Calculation

For each recommended module, NexFIT calculates dollar impact using the NexOP (Nexus Operational Performance) percentages aggregated from all 45 CAMs:

```
module_dollar_impact = annual_revenue × module_nexop_percentage
monthly_roi = module_dollar_impact / 12
roi_multiple = monthly_roi / module_monthly_price
```

Example output: **FINANCIALS: $49/mo → recovers ~$5,093/mo (104× return)**

This transforms an abstract subscription price into a concrete, personalized dollar figure that the contractor can evaluate against their own business.

---

## III. The Living Document System

### New Module Highlighting

The NexFIT results page and CAM Library are **living documents**. When users return:
- **NEW** badge appears on modules added since their last visit
- **REVISED** badge highlights modules with updated capabilities or pricing
- Change-aware rendering ensures returning visitors see what's different

### Lead Capture — "Update Me on New Features"

After viewing their personalized report, users see an opt-in: **"Update me on new features →"**

This captures:
- Email address (required)
- Name and company (optional)
- Full questionnaire answers (stored for future re-analysis)
- Report summary (tier counts, total recovery)

When new CAMs are published or existing modules are enhanced, the system can re-run NexFIT analysis for all captured leads and notify them of new recommendations that match their profile.

This turns a one-time marketing page into a **persistent communication channel** — every new feature shipped is a reason to re-engage every captured lead with a personalized "this new capability would recover $X/mo for your business" message.

---

## IV. Technical Implementation

### Files Created

| Component | Path |
|-----------|------|
| NexFIT Engine | `packages/database/src/nexfit/nexfit-engine.ts` (~658 lines) |
| Engine barrel | `packages/database/src/nexfit/index.ts` |
| API Module | `apps/api/src/modules/nexfit/nexfit.module.ts` |
| API Controller | `apps/api/src/modules/nexfit/nexfit.controller.ts` |
| API Service | `apps/api/src/modules/nexfit/nexfit.service.ts` |
| Web Page | `apps/web/app/nexfit/page.tsx` (~989 lines) |

### API Endpoints (All Public — No Auth)

- `GET /nexfit/questions` — Returns the 8-question wizard
- `POST /nexfit/analyze` — Accepts answers, returns personalized report
- `GET /nexfit/modules` — Returns full module catalog with NexOP data
- `POST /nexfit/subscribe` — Lead capture for "Update me" feature

### Module-to-NexOP Mapping

18 modules mapped to 45 CAMs with aggregate NexOP percentages:
- **FINANCIALS**: 12.22% (13 CAMs) — highest individual recovery
- **ESTIMATING**: 3.12% (6 CAMs)
- **XACT_IMPORT**: 2.99% (1 CAM)
- **TIMEKEEPING**: 1.19% (1 CAM)
- Full mapping covers SCHEDULING, DOCUMENTS, COMPLIANCE, NEXFIND, MESSAGING, WORKFORCE, BIDDING, NEXBRIDGE variants, DOCUMENT_AI, DRAWINGS_BOM, SUPPLIER_INDEX

---

## V. Competitive Advantage

### Why No One Can Copy This

1. **The engine requires the CAM data**: NexOP percentages are derived from 45 CAMs built on actual system capabilities. Competitors would need to build the operational modules first, then measure their impact, then encode that into an engine. This is years of work.

2. **Inference rules require domain expertise**: The "you need FINANCIALS because you said ESTIMATING" insight isn't obvious. It comes from understanding the construction lifecycle at a granular level. This knowledge is embedded in the engine as executable logic.

3. **Lead capture creates a compounding asset**: Every visitor who completes the questionnaire becomes a qualified, profiled lead. Over time, this builds a database of contractor profiles with stated needs, business characteristics, and contact information — directly attributable to specific module recommendations.

4. **The living document creates lock-in**: Re-engaging leads with "new feature matches your profile" messages is only possible when the system knows the lead's profile AND has new capabilities to recommend. Competitors without the full module stack have nothing to re-engage about.

### CAM Score Justification

- **Uniqueness (9/10)**: No construction SaaS offers AI-driven personalized module recommendations with dollar-ROI projections. Procore, Buildertrend, and others show feature lists. NCC shows personalized financial impact.
- **Value (9/10)**: Converts the #1 barrier to module activation (confusion about which modules matter) into a clear, personalized, dollar-denominated action plan. Also captures leads at the top of the funnel.
- **Demonstrable (10/10)**: The wizard is a live, interactive web page at `/nexfit`. Anyone can complete it in 60 seconds and see their personalized report. Perfect demo material.
- **Defensible (8/10)**: The engine itself is straightforward TypeScript, but the *data it operates on* (45 CAMs, 18 modules, NexOP mapping, inference rules) represents accumulated domain knowledge that takes years to replicate.

---

## VI. Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — 8-question wizard, 3-tier recommendations, NexOP ROI, lead capture |
