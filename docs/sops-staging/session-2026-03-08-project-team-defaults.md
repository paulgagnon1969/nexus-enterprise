---
title: "Session Export: Project Team Auto-Defaults"
module: project-team
revision: "1.0"
tags: [session, project-team, backfill, bug-fix]
status: draft
created: 2026-03-08
updated: 2026-03-08
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin]
---

# Session Export — 2026-03-08: Project Team Auto-Defaults

## Summary
Implemented automatic project team defaulting so that when a PM (or above) creates a new project, they are immediately assigned as Project Manager, Superintendent, and Foreman. Backfilled all existing projects in both dev and production databases.

## Problems Solved

### 1. No default project team on creation
- **Before**: New projects had an empty `teamTreeJson`. The Project Team card on the detail page showed all three roles as "— Select —".
- **After**: Creator is auto-assigned to PM, SUPER, and FOREMAN. A HIGH-priority task prompts them to review/update.

### 2. Team tree save button was broken (silent no-op)
- **Before**: The `PUT /projects/:id/team-tree` controller read `body.teamTree` but the frontend sent `{ teamTreeJson: ... }`. Prisma treated `undefined` as "skip field", so nothing saved.
- **After**: Controller accepts both `teamTreeJson` (preferred) and `teamTree` as property names.

## Code Changes

### `apps/api/src/modules/project/project.service.ts`
- `createProject()`: Added `teamTreeJson: { PM: [userId], SUPER: [userId], FOREMAN: [userId] }` to the `prisma.project.create` call.
- `createProject()`: Added auto-creation of a "Set Project Team" task (`PROJECT_TEAM_SETUP`) assigned to the creator.

### `apps/api/src/modules/project/project.controller.ts`
- `updateTeamTree()`: Fixed body destructuring to accept both `teamTreeJson` and `teamTree`, preferring `teamTreeJson`.

## Data Backfill

### Dev Database (NEXUSDEVv3 on :5433)
- 61 total projects → 53 backfilled
- 18 via `createdByUserId`, 35 via OWNER membership fallback
- 8 orphan projects skipped (no creator, no OWNER membership)

### Production Database (NEXUSPRODv3 on :5435)
- 62 total projects → 54 backfilled
- 19 via `createdByUserId`, 35 via OWNER membership fallback
- 8 orphan projects skipped

## Decisions Made
- Used `createdByUserId` as primary source, OWNER membership as fallback — this correctly attributes the team to whoever is responsible for the project.
- Team tree keys: `PM`, `SUPER`, `FOREMAN` — matches existing frontend `TEAM_TREE_SLOTS` constants.
- Task is always created (even for OWNER/ADMIN creators) because team acknowledgement is an operational requirement, not just a review gate.

## CAM Evaluation
- Uniqueness: 4 | Value: 6 | Demonstrable: 7 | Defensible: 3 | **Total: 20/40**
- Below 24 threshold — no CAM created. This is operational automation, not a competitive differentiator.
