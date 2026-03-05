---
cam_id: "OPS-AUTO-0001"
title: "Group Task Assignment — Cascading Completion for Crew-Based Work"
mode: OPS
category: AUTO
revision: "1.0"
tags: [cam, ops, auto, task-management, group-assignment, petl, mobile, web]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
score:
  uniqueness: 6
  value: 7
  demonstrable: 8
  defensible: 5
  total: 26
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# OPS-AUTO-0001 — Group Task Assignment with Cascading Completion

## Problem Statement

Restoration projects run on crews, not individuals. When a task like "Review PETL quantity discrepancy" needs PM attention, the system previously created **one separate task per PM** on the project. If three PMs were assigned, three identical tasks appeared. When one PM resolved the issue, the other two were left with orphaned tasks that could never be closed — leading to ever-growing todo lists, alert fatigue, and missed real work buried under noise.

This is not a cosmetic problem. Field crews reported ignoring their todo lists entirely because they couldn't distinguish real outstanding work from already-handled group items.

## Insight

Tasks in restoration are often **group-accountable, not individually-accountable**. The correct model is: assign one task to a group, let any member complete it, record who did, and clear it for everyone. This mirrors how crews actually operate — whoever gets to it first handles it.

## Solution

### Single Task, Multiple Assignees

When a task targets more than one person (e.g. all PMs on a project), Nexus now creates **one task** with a `TaskGroupMember` join table linking each assignee. The task has no single `assigneeId` — instead, all members see it in their todo list.

### Cascading Completion

When **any** group member marks the task complete:
1. The task status flips to `DONE` for everyone
2. `completedByUserId` records exactly who closed it
3. All other group members see it move to their "Completed" section with attribution
4. The task creator (originator) can see who handled it in the activity log

### Permission Model

Any group member can:
- View the task in their "My Tasks" list
- Update status (complete, reopen, change to in-progress)
- Add notes and dispositions

The task creator and admins retain full control as before.

## Technical Architecture

### Schema
- `TaskGroupMember` join table: `(id, taskId, userId, createdAt)` with unique constraint on `(taskId, userId)`
- `Task.completedByUserId` — nullable FK to `User`, set on completion, cleared on reopen

### API (NestJS)
- `createTask()` accepts optional `assigneeIds: string[]`. Two or more IDs triggers group mode (assigneeId=null, TaskGroupMember rows created). Single ID falls back to direct assignee.
- `listTasks()` for non-admin users: `WHERE assigneeId = userId OR groupMembers.some(userId)`
- `updateStatus(DONE)` sets `completedByUserId = actor.userId`
- `canActOnTask()` centralized permission check: admin OR direct assignee OR group member OR task creator

### PETL Integration
The PETL quantity discrepancy escalation (`project.service.ts`) now creates a **single group task** for all PMs/owners on the project instead of N individual tasks. Deduplication checks by `relatedEntityType + relatedEntityId` without per-user filtering.

### Frontend (Mobile + Web)
- **Mobile**: 👥 icon with group member names in task cards. Detail modal shows "Group" label with all names. "Completed By" row on done tasks.
- **Web**: Same 👥 display in todo list rows. "My Tasks" filter includes group membership. Tooltip shows full group on hover.

## Operational Impact

### Before
- 3 PMs on a project × 5 PETL discrepancies = **15 tasks** created
- 1 PM resolves all 5 → 10 orphaned tasks remain on other PMs' lists
- PMs learn to ignore their todo list → real tasks get missed

### After
- 3 PMs × 5 discrepancies = **5 tasks** created (one per discrepancy)
- 1 PM resolves all 5 → all 5 marked complete for everyone, with attribution
- Todo lists stay clean and trustworthy

### Quantified
- **Task volume reduction**: Up to 66% fewer tasks on multi-PM projects (N PMs → 1 task instead of N)
- **Zero orphaned tasks**: Cascading completion eliminates stuck items entirely
- **Accountability preserved**: `completedBy` provides clear audit trail of who handled what

## Competitive Landscape

Most construction/restoration PM tools (Buildertrend, Procore, CoConstruct) offer basic task assignment to individuals. Some allow "watchers" or "followers" on tasks, but these don't solve the completion problem — followers still see the task as open even after someone else handles it.

Nexus's approach is closer to how Slack handles channel-level tasks or how military operations assign objectives to units rather than individuals — first responder completes, team is cleared.

## Demo Script

1. Open a project with 3 PMs assigned
2. Trigger a PETL quantity discrepancy from the field (mobile daily log)
3. Show that **one** task appears, assigned to all 3 PMs (👥 icon)
4. Log in as PM #1 — see the task in "My Tasks"
5. Log in as PM #2 — same task appears
6. PM #1 marks complete → task moves to "Completed" with "Completed By: PM #1"
7. Log in as PM #2 → task is already in "Completed" section, no action needed
8. Show the activity log: clear record of who created, who completed

## Scoring Rationale

- **Uniqueness (6/10)**: Group task assignment exists in enterprise tools, but cascading completion with single-task-for-crew is uncommon in restoration/construction PM software.
- **Value (7/10)**: Directly solves a user-reported pain point (ever-growing orphaned task lists). Restores trust in the todo system.
- **Demonstrable (8/10)**: Highly visual — 👥 badges, before/after task counts, completedBy attribution. Easy to show in a 2-minute demo.
- **Defensible (5/10)**: The PETL integration and restoration-specific workflow context add domain defensibility. The core pattern is implementable by competitors but the integration depth is not.

## Future Extensions

- **Partial completion**: Allow group tasks where each member must independently verify (e.g. safety checklists) — all must complete before task closes
- **Escalation on inaction**: If no group member acts within the reminder interval, escalate to next tier
- **Group task creation from mobile**: Let field supervisors assign tasks to "all PMs" or "all field crew" directly from the mobile app
- **Analytics**: Dashboard showing group task resolution times, who completes most often, load balancing insights

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial release |
