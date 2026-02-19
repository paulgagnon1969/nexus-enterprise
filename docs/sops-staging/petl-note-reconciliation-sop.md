---
title: "PETL Note Reconciliation SOP"
module: petl-reconciliation
revision: "1.0"
tags: [sop, petl, reconciliation, notes, estimating]
status: draft
created: 2026-02-19
updated: 2026-02-19
author: Warp
---

# PETL Note Reconciliation

## Purpose
Allow users to view and reconcile V0 (original estimate) notes as sub-line items within the PETL, enabling better tracking of notes that require reconciliation actions.

## Who Uses This
- Project Managers
- Estimators
- Administrators

## Workflow

### Step-by-Step Process
1. Navigate to a project's PETL tab
2. Find a line item with a NOTE badge (amber colored)
3. Click the expand toggle (▸) to reveal sub-rows
4. The V0 note appears as a sub-row with "↳ 📝 V0" indicator
5. Click "Reconcile Note" to open the reconciliation workflow
6. Complete the reconciliation (Supplement or Change Order) as needed

### Flowchart

```mermaid
flowchart TD
    A[View PETL Line Item] --> B{Has Note?}
    B -->|No| C[Standard Reconcile Flow]
    B -->|Yes| D[Click Expand Toggle]
    D --> E[View Note Sub-Row]
    E --> F[Click 'Reconcile Note']
    F --> G{Select Transaction Type}
    G -->|Supplement| H[Create Supplement Entry]
    G -->|Change Order| I[Create Change Order Entry]
    H --> J[Entry Linked to Line Item]
    I --> J
```

## Key Features
- V0 notes display as expandable sub-rows with amber styling
- "Reconcile Note" button opens standard reconciliation workflow
- Notes remain visible alongside financial reconciliation entries
- Expand toggle appears for items with notes even without existing recon entries

## Related Modules
- PETL Management
- Reconciliation Workflow
- Supplements & Change Orders

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-02-19 | Initial release |
