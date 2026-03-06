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
score: { uniqueness: 6, value: 7, demonstrable: 8, defensible: 5, total: 26 }
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

## Competitive Angle
Most restoration field tools treat categories as static admin-configured lists. NEXI's approach turns uncategorized field data into a feedback loop that continuously improves the taxonomy — driven by the people who actually see the materials on site.

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-06 | Initial draft |
