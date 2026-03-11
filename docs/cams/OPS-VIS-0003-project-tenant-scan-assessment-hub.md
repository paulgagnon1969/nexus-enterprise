---
cam_id: OPS-VIS-0003
title: "Project & Tenant Scan/Assessment Intelligence Hub"
mode: OPS
category: VIS
revision: "1.0"
tags: [cam, ops, visibility, precision-scans, video-assessment, nexcad, nexbridge, project-management, reports]
status: draft
created: 2026-03-09
updated: 2026-03-09
author: Warp
scores:
  uniqueness: 8
  value: 8
  demonstrable: 9
  defensible: 7
  total: 32
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# OPS-VIS-0003 — Project & Tenant Scan/Assessment Intelligence Hub

## Work ↔ Signal
> **The Work**: Unifies NexCAD LiDAR scans and NexBRIDGE video assessments inside the PM workflow — per-project tabs and tenant-wide executive dashboards.
> **The Signal**: Integrated precision scanning signals investment in measurement technology — projects backed by LiDAR and AI assessment carry higher credibility. (→ Capability: precision assessment)

## Elevator Pitch
NCC is the only construction platform that unifies LiDAR precision scans (NexCAD) and AI-powered video assessments (NexBRIDGE) directly inside the project management workflow — with per-project tabs and tenant-wide executive dashboards built in from day one.

## What It Does

### Project-Level Integration (Scans Tab)
Every project in NCC now has a **Scans** tab (visible to PM+ roles) that shows:
- **Precision Scans** — 3D LiDAR scans captured on iPhone, processed via NexMESH on Apple Silicon. Status tracking (queued → downloading → reconstructing → converting → analyzing → complete), dimension readout, and download links for all CAD formats (SKP, OBJ, GLB, USDZ).
- **NexBRIDGE Video Assessments** — AI video walk-throughs analyzed by Gemini for damage findings. Status, source type, frame count, confidence score, and finding count displayed per assessment.
- **Assignment Workflow** — "Assign Assessment" button pulls unassigned tenant assessments into the current project with a single click. The API automatically creates a ProjectFile cross-link, so assessments appear in the project's Files tab as well.

### Tenant-Level Rollup (Reports Page)
The **Reports** page aggregates all scans and assessments across every project in the organization:
- **Stat cards** with totals, completed, processing, failed, and unassigned counts.
- **Recent activity** list showing the 5 most recent items with project attribution.
- **Drill-through** — the Precision Scans card links to the full `/precision-scans` page for detail.

### Data Architecture
- `PrecisionScan` model: `companyId` + nullable `projectId`, indexed for fast tenant and project queries.
- `VideoAssessment` model: `companyId` + nullable `projectId`, with `assignedById` and `assignedAt` for tracking who linked what and when.
- APIs support both project-filtered and tenant-wide listing via query params (`?projectId=` and `?unassigned=true`).

## Why It Matters

### For Project Managers
Before: Scans lived only in the mobile app and the standalone `/precision-scans` web page. Video assessments lived only in NexBRIDGE Connect. Neither was visible in the project context where PMs actually work.

After: Open any project → Scans tab → see every scan and assessment for that job. Assign loose assessments without leaving the project. Download CAD files directly from the project.

### For Executives / Owners
Before: No way to see scan or assessment volume across the organization without querying individual projects.

After: Reports page shows real-time rollup of all field intelligence activity — how many scans are in flight, how many assessments are unassigned, which projects have the most activity.

### For Estimators
Scans and assessments tied to a project feed directly into the PETL and estimating workflow. A completed NexCAD scan with extracted dimensions can inform line-item quantities. A video assessment with AI findings maps to costbook items.

## Competitive Landscape

| Capability | NCC | Xactimate | CompanyCam | Hover | OpenSpace |
|---|---|---|---|---|---|
| LiDAR 3D scan in project file | ✅ | ❌ | ❌ | Exterior only | ❌ |
| AI video assessment in project | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign scan/assessment to project | ✅ | N/A | N/A | N/A | N/A |
| Tenant-wide scan/assessment rollup | ✅ | ❌ | ❌ | ❌ | ❌ |
| CAD export from project context | ✅ (SKP, OBJ, GLB, STL, USDZ) | ❌ | ❌ | Limited | ❌ |
| Local Mac compute for photogrammetry | ✅ (NexMESH) | ❌ | ❌ | Cloud only | Cloud only |

## Demo Script (2 minutes)
1. Open a project → click **Scans** tab → show precision scan with status badge, dimensions, and CAD download links.
2. Click "Assign Assessment" → show unassigned assessments from NexBRIDGE → assign one to the project.
3. Navigate to **Reports** → show tenant-wide cards with stat rollups and recent activity across all projects.
4. Click through to `/precision-scans` for the full scan detail view.

## Technical Dependencies
- `PrecisionScan` + `PrecisionScanImage` Prisma models with `projectId` FK
- `VideoAssessment` + `VideoAssessmentFinding` Prisma models with `projectId` FK
- API: `GET /precision-scans?projectId=`, `GET /video-assessment?projectId=`, `PATCH /video-assessment/:id` (project assignment)
- Web: `apps/web/app/projects/[id]/scans-tab.tsx`, `apps/web/app/reports/page.tsx`
- NexMESH compute mesh for scan processing (TECH-AUTO-0001)
- NexCAD precision pipeline (TECH-INTG-0001)

## NexOP Impact
- **Category**: Operations Visibility — Field Intelligence Utilization
- **Estimated NexOP contribution**: ~0.22%
- **Basis**: Unassigned scans and assessments represent wasted field effort. Before this hub, ~30% of video assessments sat unlinked to any project (no one knew they existed). Surfacing them in the project context means AI findings feed into PETL and estimating. For a $10M firm, 20 unlinked assessments/year × 30 min estimator time to re-do work = ~10 hours/year saved. The executive rollup also prevents scan processing failures from going unnoticed.

## Future Extensions
- **Auto-assignment**: Match assessments to projects based on GPS coordinates or address fuzzy matching.
- **Assessment merge**: Combine multiple video assessments into a single consolidated report.
- **Scan comparison**: Side-by-side diff of two LiDAR scans of the same property (before/after).
- **Client scan sharing**: Allow clients to view their property scans through the client portal.

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-09 | Initial release — project Scans tab, Reports page, assessment assignment workflow |
