---
cam_id: OPS-ACC-0001
title: "NEXI Capture — Other Category Disposition & PM Review"
mode: OPS
category: ACC
revision: "1.0"
tags: [cam, ops, accuracy, nexi, capture, field-data, pm-review, disposition]
status: draft
created: 2026-03-06
updated: 2026-03-06
author: Warp
scores:
  uniqueness: 6
  value: 7
  demonstrable: 8
  defensible: 5
  total: 26
website: false
visibility:
  public: false
  internal: true
  roles: [admin, pm, exec]
---

# OPS-ACC-0001 — NEXI Capture: Other Category Disposition

## Problem
Field crews cataloging materials, equipment, or site conditions often encounter items that don't fit any existing category. Without a structured catch-all, these items are either mis-categorized (polluting data) or skipped entirely (data loss).

## Solution
NEXI Capture now includes an **"Other"** category with a built-in disposition workflow:

1. **Field capture** — crew selects "Other", enters a required description, and saves normally.
2. **Auto-flag** — the entry is saved with `status: pending_approval` and a `reviewNote` attached.
3. **PM review** — Project Managers see flagged items in the catalog with a clear "Pending PM review" badge and the crew's description in quotes.
4. **Disposition** — the PM can reclassify the item into an existing category or create a new one.

## Why It Matters
- **Zero data loss** — every field observation is captured, even when categories don't exist yet.
- **Category evolution** — PM review of "Other" items surfaces patterns that inform new category creation.
- **Accountability** — the review note creates a clear audit trail from field to disposition.

## Technical Summary
- `NexiCatalogEntry.reviewNote` field added to the catalog type system.
- Enrollment screen shows an amber warning card when "Other" is selected, requiring a description.
- Catalog screen surfaces pending items with the review note and PM-action hint.
- No backend changes required — uses existing `pending_approval` status flow.

## Competitive Differentiation
- **CompanyCam / fieldwire**: Photo capture with fixed category lists; no "Other" workflow, no PM review loop.
- **Procore**: Observation logs have categories but no disposition-to-reclassify pipeline.
- **Buildertrend**: Daily logs accept free-text notes but don't feed into a structured catalog.
- **NEXI**: Turns uncategorized field data into a feedback loop that continuously improves the taxonomy — driven by the people who actually see the materials on site.

## NexOP Impact
- **Category**: Operations Accuracy — Field Data Quality
- **Estimated NexOP contribution**: ~0.08%
- **Basis**: Preventing mis-categorized items from polluting material quantity estimates. One incorrectly categorized material type per project can cause $200–$500 in estimating rework. Across 60 projects/year at a $10M firm, this compounds to ~$8K–$12K in avoided rework plus improved catalog accuracy over time.

## Demo Script
1. Open NEXI Capture on mobile → start a new catalog entry.
2. Show the category picker — scroll to the bottom, select **Other**.
3. Amber warning card appears: "Describe what you're capturing" → type "spray foam insulation, 2-inch closed cell".
4. Save → entry appears in the catalog with a **Pending PM review** badge.
5. Switch to PM view on web → show the flagged entry with crew description in quotes.
6. PM clicks "Reclassify" → moves it to a new "Insulation" category → badge clears.
7. Key message: *"Nothing gets lost. Every observation feeds the next project."*

## Future Extensions
- **Auto-suggest categories**: Use AI to recommend the most likely category based on the description text before saving.
- **Trend analysis**: Dashboard showing which "Other" descriptions appear most frequently → prompts for new category creation.
- **Photo matching**: Pair the "Other" entry with a photo capture and use vision AI to suggest categorization.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial draft |
