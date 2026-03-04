---
cam_id: "FIN-INTL-0002"
title: "Smart Transaction Prescreening with Self-Improving Learning Loop & Store-to-Card Reconciliation"
mode: FIN
category: INTL
score:
  uniqueness: 8
  value: 9
  demonstrable: 9
  defensible: 7
  total: 33
status: draft
created: 2026-03-04
updated: 2026-03-04
author: Warp
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, accounting]
---

# FIN-INTL-0002: Smart Transaction Prescreening with Learning Loop

## Competitive Advantage
Every imported financial transaction — HD Pro Xtra line items, Apple Card charges, Chase bank entries — is automatically evaluated by a 6-signal intelligence engine that predicts which project it belongs to, creates tentative bills instantly, and gets smarter with every accept, reject, or override. On top of that, HD store receipts are automatically matched against credit card charges by date and amount, catching discrepancies and double-charges before they hit the books. No construction PM software offers this combination of predictive project allocation with a self-improving feedback loop and cross-source reconciliation.

## What It Does

### Predictive Prescreening
- Every CSV import triggers automatic evaluation of each transaction against 6 scoring signals
- Produces a confidence score (0.0–1.0) and human-readable reason for each suggestion
- Transactions above the confidence threshold (0.30) get a project suggestion chip in the UI
- A TENTATIVE bill is auto-created in the suggested project — no manual entry
- Users accept, reject with a reason, or override to a different project
- Bulk operations: accept all above a confidence threshold with one click

### Self-Improving Learning Loop
- **Acceptance boost**: each time a user accepts a job→project mapping, future confidence for that mapping increases (+0.05/accept, capped at +0.20)
- **Rejection penalty**: each rejection reduces future confidence for that specific mapping (−0.15/rejection, capped at −0.50)
- **Override learning**: when a user corrects a suggestion to a different project, the system remembers the corrected mapping and proactively suggests it for similar future transactions (Signal 6)
- **Store-level learning**: rejections at a specific store suppress that store→project affinity independently
- The algorithm compounds: after 10-20 transactions of feedback, prescreening accuracy increases measurably

### Store-to-Card Reconciliation
- Groups HD line items by (date, store number) and sums amounts
- Matches against Apple Card/Chase charges within ±1 day and ±$0.02
- Presents matched pairs side-by-side: HD items on left, card charge on right
- Link (permanent reconciliation) or Dismiss (manual review)
- Unmatched items visible in separate tabs for investigation

## Why It Matters

- **No construction PM tool does predictive transaction-to-project allocation** — competitors expect manual assignment of every transaction. Nexus does it automatically on import.
- **The learning loop means the system gets better the more you use it** — unlike static rule engines, the feedback from every accept/reject/override compounds into higher accuracy. After a month of usage, most HD transactions auto-match with 0.90+ confidence.
- **Store-to-card matching catches real financial discrepancies** — HD Pro Xtra totals should match card charges. When they don't (returns not reflected, double-charges, tax discrepancies), this surfaces them before reconciliation close.
- **Tentative bills eliminate the "I'll do it later" gap** — as soon as a transaction is prescreened, a bill exists in the project. PMs see pending costs immediately instead of discovering them at month-end.
- **Override learning is the killer feature** — when a user corrects a mapping, the system doesn't just accept the correction — it learns the pattern and applies it to future similar transactions. One correction today prevents 20 mismatches next month.
- **Bulk accept by confidence** — accounting can close out high-confidence prescreens in seconds instead of reviewing them one by one.

## Demo Script
1. Open Financial → Banking, import an HD Pro Xtra CSV (~50 transactions)
2. Watch prescreening run: show the confidence chips appearing (0.95 green, 0.45 yellow)
3. Click a green chip — show the reason: "HD Job Name 'SMITH RESIDENCE' → exact match with project 'Smith Residence'"
4. Accept it — show the tentative bill promoted to DRAFT in the project
5. Reject a low-confidence one — enter reason "This is personal, not project"
6. Override another — change from "Smith" to "Johnson" project
7. Import the SAME store's next month of transactions — show the overridden mapping now appears as Signal 6 with higher confidence
8. Show the rejected mapping now has reduced confidence
9. Use "Bulk Accept ≥ 0.70" — show 30+ transactions accepted in one click
10. Navigate to Financial → Reconciliation → expand Store ↔ Card Matching
11. Show 12 matched pairs: HD store groups with line items on left, Apple Card charges on right
12. Link a match — show both sides marked as reconciled
13. Point out an unmatched HD group ($847.23) with no matching card charge — potential return or split payment

## Technical Differentiators
- **6-signal architecture** — not just text matching. Combines job name fuzzy matching, store purchase history, purchaser behavior patterns, description frequency analysis, keyword detection, and learned override mappings
- **Levenshtein distance** for fuzzy job name matching (≤2 edits) — catches typos and abbreviations
- **Multi-signal agreement boost** — when 2+ signals independently suggest the same project, confidence gets a +0.10 boost, reducing false positives
- **Feedback persistence** — all feedback stored in `PrescreenFeedback` table with full audit trail (who, when, what was suggested, what was chosen, reason)
- **Adaptive penalty scaling** — not a binary reject/accept. Multiple rejections of the same mapping progressively reduce confidence, but a single rejection doesn't kill a strong signal
- **Store-card matching** uses grouped sum comparison, not individual line matching — handles the real-world pattern where one card swipe covers 15 HD line items
- **Bidirectional reconciliation links** — both the store transactions and the card charge reference each other, preventing orphaned links

## The 6 Signals
| # | Signal | Sources | Base Confidence | Description |
|---|--------|---------|-----------------|-------------|
| 1 | Job Name Match | HD | 0.80–0.95 | Exact/fuzzy/substring against project names |
| 2 | Store Affinity | HD | 0.40–0.75 | Historical % of store purchases per project |
| 3 | Purchaser+Store | HD | 0.35–0.65 | Purchaser behavior at specific stores |
| 4 | Description Pattern | All | 0.30–0.60 | Merchant+description frequency analysis |
| 5 | Keyword Match | All | 0.35 | Project name found in transaction text |
| 6 | Override Learning | All | 0.40–0.70 | User corrections applied to similar transactions |

## Competitive Landscape
| Competitor | Predictive Allocation? | Learning Loop? | Store-Card Matching? |
|------------|----------------------|----------------|---------------------|
| Buildertrend | No | No | No |
| CoConstruct | No | No | No |
| Procore | No | No | No |
| Xactimate | No (estimating only) | No | No |
| QuickBooks | Basic rules | No | No |
| Sage 300 | Manual | No | No |
| Expensify | Category rules | No | Partial (receipt matching) |

No competitor offers predictive project-level allocation with a self-improving feedback loop. Most require fully manual transaction assignment. QuickBooks and Expensify offer category-level rules but not project-level prediction, and none learn from corrections.

## Expansion Opportunities
- **Cross-source learning** — Apple Card merchant patterns informing HD store affinity and vice versa
- **Confidence auto-accept threshold** — company-configurable: "auto-accept anything above 0.90" for zero-touch operation
- **Anomaly detection** — flag transactions where the prescreened project differs significantly from recent patterns (possible fraud or misallocation)
- **Cost code prediction** — extend prescreening to suggest not just the project but the cost code within the project
- **Receipt OCR integration** — match OCR'd receipt line items against HD CSV line items for triple-verification (receipt → HD CSV → card charge)
- **Time-decay weighting** — recent feedback weighted more heavily than 6-month-old feedback
- **Per-purchaser confidence profiles** — some purchasers are more consistent than others; weight their feedback accordingly
