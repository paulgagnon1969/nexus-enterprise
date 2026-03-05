---
title: "Urgency-Based Task Dashboard SOP"
module: urgency-task-dashboard
revision: "1.0"
tags: [sop, operations, visibility, tasks, urgency, daily-log, mobile, badge, overdue]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
cam_ref: OPS-VIS-0002
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm, field]
---

# Urgency-Based Task Dashboard

## Purpose
The mobile ToDo tab organizes every project task into color-coded urgency buckets with real-time badge counts and one-tap status toggling. Tasks created from daily log observations are automatically linked back to the originating log. This SOP documents the task lifecycle and urgency system.

## Who Uses This
- **Field workers** — view and complete assigned tasks, create tasks from daily log observations
- **Foremen** — see all project tasks across team members
- **PMs** — monitor task completion, track overdue items, create follow-up tasks

## Workflow

### Creating Tasks

#### From a Daily Log
1. Open a daily log → scroll to the **Tasks** section
2. Tap **+ Add Task**
3. Enter: title, description, assignee, due date
4. Save — task is linked to the daily log via `relatedEntityType=DAILY_LOG`
5. Task appears in the assignee's ToDo tab immediately

#### Standalone Task
1. Open the **ToDo's** tab on mobile
2. Tap **+ New Task**
3. Enter: title, description, assignee, due date, project
4. Save — task appears in the urgency dashboard

### Urgency Buckets
Tasks are automatically classified into three buckets based on due date:

| Bucket | Color | Badge | Criteria |
|--------|-------|-------|----------|
| 🛑 **Overdue** | Red | Counted in badge | Due date has passed |
| ⚠️ **Due Soon** | Yellow/Amber | Counted in badge | Due within 24 hours |
| ✅ **Upcoming** | Green | Not counted | Due date is in the future (>24h) |

The tab badge shows a **red count** of Overdue + Due Soon items, refreshed every 60 seconds.

### Completing Tasks
1. Tap the checkbox next to any task
2. Task moves to ☑️ **Completed** with strikethrough (optimistic update — instant UI response)
3. If the server rejects the update, the task reverts silently

### Role-Scoped Visibility
| Role | What They See |
|------|--------------|
| Field worker | Only their own assigned tasks |
| Foreman+ | All project tasks across team members |
| PM | All tasks for their projects |
| Admin | All tasks across all projects |

## Daily Log → Task Pipeline
When a task is created from a daily log:
- The task maintains a link back to the originating log
- Opening the task shows a "Created from Daily Log" reference
- The daily log shows the task in its Tasks section
- This creates traceability: field observation → task → resolution

## Best Practices

### For Field Workers
- **Check the ToDo tab first thing each morning** — red badges mean something is overdue
- **Complete tasks immediately when done** — don't batch at end of day
- **Create tasks from daily logs** when you observe something that needs follow-up (don't just write it in the log text)

### For PMs
- **Review overdue tasks daily** — if a task stays red for 2+ days, follow up directly
- **Set realistic due dates** — overly tight deadlines create false urgency noise
- **Use daily log tasks for accountability** — when a log notes an issue, create a task so it doesn't get lost

### For Managers
- **Monitor badge counts by user** — consistently high overdue counts may indicate workload issues
- **Use completion rates for performance conversations** — TUCKS telemetry tracks task completion KPIs

## Key Features
- **Color-coded urgency** — red/yellow/green instant visual priority
- **60-second badge refresh** — always current
- **Optimistic toggle** — instant UI response on task completion
- **Daily log linkage** — tasks born from field observations maintain traceability
- **Role-scoped visibility** — appropriate access without information overload

## Related Modules
- [Field Qty Discrepancy Pipeline](field-qty-discrepancy-pipeline-sop.md) — field-reported issues generate follow-up tasks
- [TUCKS Telemetry](tucks-analytics-platform-sop.md) — task completion rates feed KPI dashboards
- [NexCheck Compliance](nexcheck-site-compliance-kiosk-sop.md) — compliance tasks surface in urgency dashboard

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial SOP — urgency buckets, task lifecycle, daily log linkage, best practices |
