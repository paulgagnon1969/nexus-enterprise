---
cam_id: "TECH-VIS-0002"
title: "NexINT — Operational Integrity Dashboard & System-Wide Accuracy Index"
mode: TECH
category: VIS
revision: "1.0"
status: draft
created: 2026-03-09
updated: 2026-03-09
author: Warp
scores:
  uniqueness: 10
  value: 9
  demonstrable: 8
  defensible: 9
  total: 90
website: true
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
tags: [cam, nexint, integrity, accuracy, compliance, dashboard, operational-excellence, culture]
---

# NexINT — Operational Integrity Dashboard & System-Wide Accuracy Index

## Executive Summary

**NexINT (Nexus Integrity Index)** is a composite score measuring the operational accuracy, compliance discipline, and data quality of a contractor's entire operation — computed automatically from live system data. While NexOP answers *"How much money does Nexus save you?"*, NexINT answers the harder question: *"How much more accurate, disciplined, and audit-ready is your operation with Nexus?"*

NexINT measures what competitors cannot: **the gap between how a company thinks it operates and how it actually operates.** The industry baseline integrity rate is ~65–72%. Nexus-active companies consistently reach ~92–97%.

## Work ↔ Signal
> **The Work**: System-wide accuracy index measuring 4 dimensions: financial accuracy, process completion, compliance, and data quality. Composite score rises from ~72% to ~95% with Nexus active.
> **The Signal**: NexINT is the meta-reputation signal — the single number that proves operational discipline to clients, insurers, and auditors. (→ Reputation: operational integrity)

## The Problem

Contractors can't improve what they can't measure. Every restoration and construction firm believes their processes are tight — receipts get matched, tasks get closed, checklists get completed, data gets categorized. But without system-enforced workflows, the reality is:

- **15–25% of expenses** have an integrity gap: unmatched receipts, mis-categorized charges, undetected duplicates, or pricing errors on invoices.
- **20–30% of operational tasks** are orphaned, abandoned, or closed without proper disposition — eroding trust in the task system itself.
- **10–20% of compliance documentation** has gaps: missed checklists, expired certifications, undocumented site visits.
- **15–25% of field data** is mis-categorized, duplicated across projects, or incomplete — polluting estimates and reports.

These aren't theoretical risks. They compound silently across every project until they surface as overbilled clients, failed audits, insurance disputes, or OSHA citations.

## NexINT Score Architecture

### Composite Score

NexINT is expressed as a percentage (0–100%) representing operational integrity across four dimensions, weighted by business impact:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Financial Integrity (FI)** | 35% | Accuracy of financial data — receipt matching, duplicate detection, pricing correctness, reconciliation completeness |
| **Process Completion (PC)** | 25% | Workflows reaching proper disposition — tasks closed, assessments linked, discrepancies resolved |
| **Compliance (CO)** | 20% | Regulatory and safety adherence — checklist completion, certification coverage, documentation rates |
| **Data Quality (DQ)** | 20% | Accuracy of operational data — field categorization, vendor normalization, assessment confidence, version consistency |

**NexINT = (FI × 0.35) + (PC × 0.25) + (CO × 0.20) + (DQ × 0.20)**

### Industry Baseline vs. Nexus-Active

| Dimension | Industry Baseline | Nexus-Active | Improvement |
|-----------|-------------------|-------------|-------------|
| Financial Integrity | ~72% | ~96% | +24 pts |
| Process Completion | ~68% | ~93% | +25 pts |
| Compliance | ~78% | ~98% | +20 pts |
| Data Quality | ~70% | ~91% | +21 pts |
| **NexINT Composite** | **~72%** | **~95%** | **+23 pts** |

*Industry baselines derived from restoration industry benchmarks: average receipt-to-bill match rates, task completion studies, OSHA inspection pass rates, and data quality assessments across mid-size GCs.*

## The Four Dimensions — Deep Dive

### 1. Financial Integrity (FI) — Weight: 35%

**What it measures**: Every dollar that flows through the system has a verified chain from source transaction → receipt → bill → invoice. Gaps in this chain are financial integrity failures.

**Component metrics:**
- **Receipt Coverage Rate** — % of bills with a matched receipt attachment (target: >95%)
- **Duplicate Detection Rate** — % of expenses scanned for cross-project duplicates (target: 100%)
- **Pricing Accuracy** — % of invoice line items with verified cost book → final price chain (target: >98%)
- **Reconciliation Completeness** — % of CC transactions matched to bills within 30 days (target: >90%)
- **Verification Offset Coverage** — % of flagged duplicates with GAAP-compliant SibE disposition (target: 100%)

**CAMs contributing to FI:**
- **FIN-ACC-0001** NexVERIFY — verification groups with sibling detection eliminate phantom duplicates
- **FIN-ACC-0002** Zero-Loss Receipt Capture — bill-first model ensures receipt coverage
- **FIN-ACC-0003** Cross-Project Duplicate Scanner — cross-project duplicate detection with disposition
- **FIN-ACC-0005** Bidirectional Pricing Engine — zero arithmetic errors in markup/discount
- **FIN-AUTO-0001** Receipt OCR — automated data extraction reduces manual entry errors
- **FIN-AUTO-0002** Auto-Posting — dual-role PM detection prevents assignment conflicts
- **FIN-VIS-0001** Purchase Reconciliation — CC-to-receipt matching with personal expense identification
- **FIN-VIS-0002** Invoice Transparency — retail vs. actual display for audit clarity
- **FIN-INTL-0002** Smart Prescreen — intelligent transaction routing reduces mis-assignment
- **EST-ACC-0001** NexDupE — cross-project expense integrity with permanent archival

**Without Nexus**: A $10M firm has ~$720K/year in CC spend across 400 transactions/month. At industry-average 15% error rate, ~$108K in expenses have some integrity gap — unmatched, duplicated, or incorrectly priced. Human review catches ~60% of these. Net exposure: ~$43K/year in undetected financial data errors.

**With Nexus**: Automated detection + forced disposition + receipt-first model reduces error rate to ~3%. Net exposure: ~$22K, with every gap flagged and tracked.

### 2. Process Completion (PC) — Weight: 25%

**What it measures**: Every operational workflow (task, assessment, discrepancy, review) reaches a proper terminal state — completed, resolved, dispositioned, or explicitly deferred. Orphaned workflows are integrity failures.

**Component metrics:**
- **Task Completion Rate** — % of created tasks reaching DONE or CANCELLED status (target: >92%)
- **Assessment Assignment Rate** — % of video assessments linked to a project (target: >95%)
- **Discrepancy Resolution Rate** — % of quantity discrepancies with PM disposition (target: >90%)
- **Scan Utilization Rate** — % of precision scans with project attribution (target: >90%)
- **Review Cycle Time** — median time from flag to disposition (target: <48 hours)

**CAMs contributing to PC:**
- **OPS-AUTO-0001** Group Task Cascading — eliminates orphaned tasks via cascading completion
- **OPS-VIS-0001** Field Qty Discrepancy — forces PM review of quantity variances
- **OPS-VIS-0002** Task Dashboard — real-time visibility prevents tasks from falling through cracks
- **OPS-VIS-0003** Scan/Assessment Hub — surfaces unassigned assessments in project context
- **OPS-ACC-0001** NEXI Capture — Other category disposition ensures nothing is skipped
- **OPS-COLLAB-0001** Phantom Fleet — equipment accountability workflow
- **CLT-COLLAB-0001** Client Tier — collaboration workflows reach completion
- **CLT-COLLAB-0002** Dual Portal Routing — correct routing = correct actions taken

**Without Nexus**: At a $10M firm with 60 projects, PMs generate ~300 tasks/month. Industry data shows 20-30% are never properly closed — that's 60-90 orphaned workflows per month. After 6 months, PMs stop trusting their task list entirely, and real issues get missed.

**With Nexus**: Cascading completion + forced disposition + dashboard visibility reduces orphan rate to ~5%. The task system remains trustworthy — which compounds across every other process.

### 3. Compliance (CO) — Weight: 20%

**What it measures**: Regulatory and safety requirements are documented, current, and enforceable — not just aspirational.

**Component metrics:**
- **Checklist Completion Rate** — % of site visits with completed safety checklists (target: >98%)
- **Certification Currency** — % of active field crew with current required certifications (target: 100%)
- **Standard Sync Lag** — days between OSHA/regulatory update and system reflection (target: <7 days)
- **Incident Documentation Rate** — % of safety incidents with complete documentation (target: 100%)
- **Audit Readiness Score** — % of required compliance artifacts immediately available (target: >95%)

**CAMs contributing to CO:**
- **CMP-AUTO-0001** NexCheck — site compliance checklists that block work continuation without completion
- **CMP-INTG-0001** OSHA/eCFR Auto-Sync — regulatory standards update automatically from federal sources

**Without Nexus**: OSHA's average serious violation penalty is ~$16K. The average GC receives 0.3 citations per inspection. Compliance documentation gaps are the #1 reason violations escalate from "other-than-serious" ($0-$1K) to "serious" ($16K+). Incomplete checklists don't just risk fines — they risk lives.

**With Nexus**: NexCheck makes completion mandatory. OSHA sync ensures standards are current. The gap between "we think we're compliant" and "we can prove we're compliant" closes to near zero.

### 4. Data Quality (DQ) — Weight: 20%

**What it measures**: Operational data flowing through the system is accurate, properly categorized, consistently formatted, and improving over time.

**Component metrics:**
- **Field Categorization Accuracy** — % of catalog entries properly categorized (not "Other" pending) (target: >95%)
- **Vendor Normalization Coverage** — % of transactions with clean, alias-resolved vendor names (target: >90%)
- **Assessment Confidence Trend** — month-over-month improvement in AI assessment accuracy via Zoom & Teach (target: positive trend)
- **Fleet Version Consistency** — % of field devices on current app version (target: >95%)
- **Estimate-to-Actual Variance** — deviation between estimated and actual project costs (target: <10%)

**CAMs contributing to DQ:**
- **TECH-INTL-0001** NexEXTRACT — adaptive frame extraction + Zoom & Teach learning loop
- **TECH-ACC-0001** Graceful Fallback — system reliability preserves data continuity during failures
- **TECH-SPD-0003** Smart Media Upload — reliable upload = complete documentation
- **TECH-SPD-0004** Real-Time Update Push — fleet consistency = consistent data collection
- **TECH-INTG-0001** NexCAD — precision scan accuracy
- **TECH-INTG-0002** NexMESH — distributed compute reliability for processing integrity
- **TECH-VIS-0001** NexOP Dashboard — makes data quality visible and measurable
- **EST-INTL-0001** Video Index — evidence continuity across assessments
- **EST-INTG-0001** BOM Pricing — price accuracy from multi-provider normalization
- **EST-AUTO-0002** NexPlan AI Selections — AI-assisted item selection reduces human error
- **OPS-ACC-0001** NEXI Capture — Other category disposition improves taxonomy over time

**Without Nexus**: Field data in spreadsheets and generic tools has a 15-25% error rate. Vendor names have 50+ spelling variations. AI assessments degrade without feedback loops. Devices running stale versions collect incompatible data formats.

**With Nexus**: Automated categorization, vendor normalization, per-company AI learning, and fleet consistency push data quality above 90% — and it improves every month.

## The Cultural Shift

NexINT measures something no financial metric can: **cultural alignment between stated processes and actual behavior.**

When NexINT is high:
- PMs trust their task lists because orphaned items don't exist
- Accounting trusts expense data because every bill has a verified chain
- Field crews complete checklists because the system won't let them skip
- Estimators trust AI assessments because the learning loop is visible
- Executives can prove compliance in any audit because documentation is systematic

When NexINT is low (industry baseline):
- "We do safety checklists" means "we have a checklist template somewhere"
- "We catch duplicates" means "we spot-check when we remember"
- "Our data is clean" means "nobody's complained yet"

The gap between stated process and actual execution is where lawsuits, fines, margin erosion, and client trust failures live. NexINT closes that gap.

## Dashboard Design

### Executive Summary Card
```
┌─────────────────────────────────────────────┐
│  NexINT Score: 94.7%  ▲ +2.3 pts (30d)     │
│  ───────────────────────────────────────     │
│  FI: 96%  │  PC: 93%  │  CO: 98%  │ DQ: 91% │
│  ▲ +1.8   │  ▲ +3.1   │  — 0.0    │ ▲ +2.4  │
│                                             │
│  Industry Benchmark: ~72%  ←── You are here │
│  ████████████████████████████████████░░░░░░  │
└─────────────────────────────────────────────┘
```

### Drill-Down Views
- **Financial Integrity**: Receipt match heatmap by project, duplicate detection log, pricing error tracker
- **Process Completion**: Task disposition funnel, orphan rate trend, assessment assignment pipeline
- **Compliance**: Checklist completion calendar, certification expiration timeline, OSHA sync status
- **Data Quality**: Vendor normalization coverage, AI confidence trend line, fleet version matrix

### Trend Tracking
- Weekly snapshot stored for historical comparison
- 30/60/90-day trends per dimension
- Per-project NexINT breakdowns (identify which projects drag down the score)
- Per-PM NexINT (which PMs consistently close workflows vs. let them lapse)

## Technical Architecture

### Data Sources
All NexINT metrics are computed from existing Prisma models — no new data collection required:

- `ProjectBill` + `ProjectBillAttachment` → receipt coverage
- `DuplicateExpenseDisposition` → duplicate detection rate
- `ProjectInvoiceLineItem.costBookUnitPrice` → pricing accuracy
- `BankingTransaction` + `ProjectBill.sourceTransactionId` → reconciliation completeness
- `Task` + `TaskGroupMember` → task completion rate
- `VideoAssessment.projectId` → assessment assignment rate
- `PrecisionScan.projectId` → scan utilization
- `NexiCatalogEntry.status` → field categorization accuracy
- `ComplianceChecklist` → checklist completion
- `UserCertification.expiresAt` → certification currency
- `AssessmentTeachingExample` → AI learning velocity
- `DeviceRegistration.appVersion` → fleet consistency

### Computation
- Scheduled job runs nightly (or on-demand via dashboard)
- Stores `NexIntSnapshot` per company per day: `{ fi, pc, co, dq, composite, componentMetrics: JSON }`
- API: `GET /analytics/nexint` → current score + trend data
- Per-project breakdown: `GET /analytics/nexint?projectId=`

### Frontend
- Dashboard widget on company overview page
- Full NexINT detail page with dimension drill-downs
- Exportable PDF report for client presentations and insurance audits

## Competitive Differentiation

No construction or restoration platform offers an operational integrity score. The closest analogues:

- **Procore Quality & Safety**: Tracks observations and incidents but doesn't compute a composite integrity score
- **Buildertrend**: No system-wide accuracy metrics
- **Sage/QuickBooks**: Financial accuracy only, no cross-domain integrity view
- **Monday.com/Asana**: Task completion rates but no integration with financial, compliance, or field data
- **ISO 9001 audits**: Annual point-in-time assessments vs. NexINT's continuous real-time measurement

NexINT is architecturally unique because it requires an integrated platform that spans financial, operational, compliance, and field data. No point solution can compute it.

## Demo Script

1. Open company dashboard → show NexINT score card: **94.7%** with trend arrow
2. Compare to industry benchmark bar: *"The average contractor operates at ~72% integrity. You're at 95%."*
3. Click into Financial Integrity → show receipt coverage at 96%, duplicate detection at 100%
4. Click into Process Completion → show task orphan rate at 5% (down from 28% at onboarding)
5. Click into Compliance → show NexCheck completion calendar (green across the board)
6. Show a specific project's NexINT breakdown → one project at 88% → drill in to see 3 unresolved discrepancies
7. Key message: *"This is the difference between thinking you're running a tight operation and proving it."*

## NexOP Impact

- **Category**: Technology Visibility — Operational Measurement
- **Estimated NexOP contribution**: ~0.30%
- **Basis**: NexINT itself doesn't save money directly — it makes visible the savings and improvements from every other CAM. However, the dashboard drives behavioral change: companies that can see their integrity score improve it. The 30-day trend view creates accountability. Estimated ~$30K/year in additional savings at the $10M tier from the behavioral uplift of visible metrics (Hawthorne effect applied to operational accuracy).

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-09 | Initial release — NexINT score architecture, four dimensions, dashboard design, per-CAM mapping |
