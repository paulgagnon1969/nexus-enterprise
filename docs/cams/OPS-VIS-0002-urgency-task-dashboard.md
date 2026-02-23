---
cam_id: OPS-VIS-0002
title: "Urgency-Based Task Dashboard with Daily Log Integration"
mode: OPS
category: VIS
status: draft
created: 2026-02-22
updated: 2026-02-22
author: Warp
scores:
  uniqueness: 7
  value: 8
  demonstrable: 9
  defensible: 5
  total: 29
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# OPS-VIS-0002 — Urgency-Based Task Dashboard with Daily Log Integration

## What It Is
A mobile ToDo's tab that organizes all project tasks into color-coded urgency buckets (🛑 Overdue, ⚠️ Due Soon, ✅ Upcoming) with real-time badge counts and one-tap status toggling. Tasks can be created directly from daily log detail screens and are automatically linked back to the originating log.

## Why It Matters
In construction, missed follow-ups on daily log action items lead to schedule slips, safety gaps, and cost overruns. Most field apps treat tasks and daily logs as separate silos. Nexus ties them together — when a foreman writes a daily log noting an issue, they create a task right there. That task surfaces in the urgency dashboard with automatic escalation visibility for managers.

## Competitive Advantage
- **Daily Log → Task pipeline:** Tasks born from daily logs maintain traceability back to the field observation that created them
- **Urgency visualization:** Red/yellow/green bucketing with collapsible sections and summary pills — not just a flat list
- **Role-scoped visibility:** Foreman+ sees all project tasks; field workers see only their assignments — built into the API layer
- **Badge-driven attention:** Tab icon shows a red count of overdue + due-soon tasks, refreshed every 60 seconds
- **Optimistic UX:** Task toggle is instant (optimistic update with silent revert on failure)

## Demo Script
1. Open a daily log → scroll to Tasks section → tap "+ Add Task" → create a task with a due date
2. Navigate to ToDo's tab → see the task in the green (Upcoming) bucket
3. Fast-forward the due date to yesterday → pull to refresh → task moves to 🛑 Overdue
4. Show the red badge count on the tab icon
5. Tap the task checkbox → it moves to ☑️ Completed with strikethrough
6. Switch to a Foreman account → show all project tasks visible across team members

## Technical Foundation
- API: `GET /tasks?relatedEntityType=DAILY_LOG&relatedEntityId=<id>` for per-log tasks
- API: `GET /tasks` with urgency filtering via `overdueOnly=true`
- Mobile: `TodosScreen.tsx` with `classifyTask()` bucketing by due date delta
- Mobile: `DailyLogDetailScreen.tsx` Tasks section with inline create modal
- Schema: Uses existing `Task.relatedEntityType` + `Task.relatedEntityId` for polymorphic linking

## Future Extensions
- Auto-escalation: overdue tasks automatically notify the assignee's manager
- KPI reporting: task completion rates by user, project, and type
- Watch app: surface overdue task count as a watch complication
