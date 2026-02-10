---
title: "Xactimate Activity Codes SOP"
module: xactimate
revision: "1.0"
tags: [sop, xactimate, estimating, activity-codes, operations]
status: draft
created: 2026-02-08
updated: 2026-02-08
author: Warp
featureId: xactimate-activity-codes
---

# Xactimate Activity Codes

## Purpose
This document defines the seven main activity codes used in Xactimate for creating estimates. These codes appear in the **Act** (Activity) dropdown for line items and control how labor, materials, and equipment are billed.

## Who Uses This
- Estimators
- Project Managers
- Claims Adjusters
- Operations Staff

## Activity Codes Reference

### + Replace (or Replace Only)
**Symbol:** +

**Components:**
- Materials (new item cost)
- Install Labor (plus equipment if applicable)

**When to Use:** For installing **new** material/item only (no removal/demo). Pure replacement/install side.

---

### - Remove (or Remove Only)
**Symbol:** -

**Components:**
- Remove Labor (demo/tear-out, plus equipment if applicable)
- No materials

**When to Use:** For demolition/removal of existing item only (nothing new installed).

---

### & Remove and Replace
**Symbol:** &

**Components:**
- Remove Labor (demo old item, plus equipment)
- Install Labor (new item, plus equipment)
- Materials (new item cost)

**When to Use:** Bundled full tear-out + new install. Can often be separated on reports (e.g., FEMA style: shows as separate - and + lines).

---

### R Detach and Reset
**Symbol:** R

**Components:**
- Detach/Remove Labor (temporary uninstall, plus equipment)
- Reset/Reinstall Labor (reinstall same item, plus equipment)
- No materials (same item reused)

**When to Use:** For salvage/reuse scenarios (e.g., remove toilet before flooring, then reset same one). No built-in split option; manual workaround needed if separating detach vs. reset.

---

### I Install Only
**Symbol:** I

**Components:**
- Install Labor only (plus equipment if applicable)
- No materials

**When to Use:** Labor/equipment to install when materials are supplied separately (e.g., owner-furnished or already paid).

---

### M Material Only
**Symbol:** M

**Components:**
- Materials only (new item cost)
- No labor or equipment

**When to Use:** Materials cost alone (e.g., for reimbursement, supplier invoice, or when labor is separate).

---

### Default / Blank (Labor Only)
**Symbol:** — (no code)

**Components:**
- Varies (often just Labor if no activity selected)

**When to Use:** Not a standard activity; some older references use this for custom/labor-only scenarios.

## Common Splits

### & Remove and Replace → Split
Can be easily separated into:
- **-** Remove
- **+** Replace

Use report settings or create manual lines.

### + Replace → Split
Can be manually split into:
- **M** Material Only
- **I** Install Only

### R Detach and Reset → Split
No native split available. Manual workaround:
- **-** (detach)
- **I** (reset)

Note: Pricing may not match exactly when manually splitting R codes.

## Version Notes
These activity codes are consistent across Xactimate versions including X1 desktop and online. If using an older Silverlight version, verify activity code availability in your specific price list.

## Related Modules
- Estimating
- Project Scoping
- FEMA Claims Processing

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-02-08 | Initial release |
