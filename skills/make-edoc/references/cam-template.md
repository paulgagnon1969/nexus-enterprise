# CAM Document Template

Use this template when a feature scores ≥ 24/40 on the CAM evaluation.

```markdown
---
cam_id: "{MODE}-{CATEGORY}-{NNNN}"
title: "[Feature Name]"
mode: [FIN|OPS|EST|HR|CLT|CMP|TECH]
category: [AUTO|INTL|INTG|VIS|SPD|ACC|CMP|COLLAB]
score:
  uniqueness: N
  value: N
  demonstrable: N
  defensible: N
  total: N
tags: [cam, mode, category, relevant-tags]
status: draft
website: false
created: YYYY-MM-DD
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# [Feature Name]

## What It Does
[2–3 sentences describing the capability]

## Why It Matters
[Business value — time saved, errors prevented, competitive edge]

## How It Works
[Technical summary — architecture, key components, data flow]

## Demo Script
[Step-by-step walkthrough someone could follow to demonstrate the feature]

## Competitive Landscape
[What alternatives exist, why ours is better]
```

## Mode Reference

- **FIN** — Financial (invoicing, billing, payments)
- **OPS** — Operations (scheduling, daily logs, field management)
- **EST** — Estimating (Xactimate, PETL, cost books)
- **HR** — Workforce (timecards, payroll, candidates)
- **CLT** — Client Relations (collaborator portal, owner comms)
- **CMP** — Compliance (insurance, licensing, auditing)
- **TECH** — Technology (platform, performance, infrastructure)

## Category Reference

- **AUTO** — Automation (reduces manual steps)
- **INTL** — Intelligence (smart defaults, ML, analytics)
- **INTG** — Integration (connects external systems)
- **VIS** — Visibility (dashboards, reporting, transparency)
- **SPD** — Speed (performance, faster workflows)
- **ACC** — Accuracy (error reduction, validation)
- **CMP** — Compliance (regulatory, audit trail)
- **COLLAB** — Collaboration (multi-user, cross-role)
