---
title: "Session Export — Daily Log Tasks, ToDo's Tab, Watch Strategy"
module: mobile
revision: "1.0"
tags: [sop, mobile, tasks, todos, daily-log, watch, session-export]
status: draft
created: 2026-02-22
updated: 2026-02-22
author: Warp
---

# Session Export — 2026-02-22

## Summary
This session added interactive task management to daily logs, a new ToDo's tab to the mobile app bottom nav, fixed the contacts API 404, and deployed v2.2.0 to both Android (local APK) and iOS (TestFlight). The session also covered watch app development strategy for Apple Watch and Wear OS.

## Problems Solved

### 1. Daily Log Tasks — Interactive Task Management
**Problem:** Users could see todos on daily logs but couldn't interact with them or create new ones.

**Solution (API):**
- Extended `CreateTaskDto` with optional `relatedEntityType` and `relatedEntityId` fields
- Updated `TaskService.createTask` to store related entity fields and set `createdByUserId`
- Relaxed task creation from OWNER/ADMIN-only → any project member can create tasks
- Added `relatedEntityType`/`relatedEntityId` query filters to `TaskService.listTasks`
- Task list responses now include `assignee` and `createdBy` user details

**Solution (Mobile):**
- Created `apps/mobile/src/api/tasks.ts` — `fetchTasksForDailyLog`, `fetchAllTasks`, `createTask`, `updateTaskStatus`
- Added `TaskItem`, `CreateTaskRequest` types to `types/api.ts`
- `DailyLogDetailScreen` now shows a Tasks section with:
  - Checkbox per task (tap to toggle TODO ↔ DONE, optimistic update)
  - Assignee, due date, priority badge per task
  - "+ Add Task" button → modal with title + description fields
  - Tasks linked via `relatedEntityType: "DAILY_LOG"`

**Files changed:**
- `apps/api/src/modules/task/dto/task.dto.ts`
- `apps/api/src/modules/task/task.service.ts`
- `apps/api/src/modules/task/task.controller.ts`
- `apps/mobile/src/api/tasks.ts` (new)
- `apps/mobile/src/types/api.ts`
- `apps/mobile/src/screens/DailyLogDetailScreen.tsx`

### 2. ToDo's Tab — Urgency-Based Task Dashboard
**Problem:** No centralized place to see all assigned tasks with urgency context.

**Solution:**
- New `TodosScreen.tsx` with color-coded collapsible sections:
  - 🛑 **Red (Overdue)** — past due date
  - ⚠️ **Yellow (Due Soon)** — within 24 hours
  - ✅ **Green (Upcoming)** — more than 1 day out
  - 📌 **No Due Date** — gray
  - ☑️ **Completed** — collapsed by default
- Summary strip at top with pill counts per urgency level
- Red badge on tab icon showing overdue + due-soon count (refreshes every 60s)
- Tap any task to toggle status; pull-to-refresh
- Foreman+ (OWNER/ADMIN) sees all project tasks; regular members see only their assigned tasks

**Files changed:**
- `apps/mobile/src/screens/TodosScreen.tsx` (new)
- `apps/mobile/src/navigation/AppNavigator.tsx`

### 3. Contacts API 404 Fix
**Problem:** Mobile app called `/contacts` but the API controller is registered at `/personal-contacts`.

**Solution:** Updated `apps/mobile/src/api/contacts.ts` to use `/personal-contacts` for both `fetchContacts` and `fetchContact`.

### 4. Daily Log Type Picker Scroll Fix
**Problem:** Last item (Quality Inspection) was cut off behind the toolbar in the Add Daily Log modal.

**Solution:** Added `contentContainerStyle={{ paddingBottom: 40 }}` to the ScrollView in the daily log type picker modal.

## Decisions Made

### Task Creation Permissions
- **Decision:** Relaxed from OWNER/ADMIN-only to any project member with verified project membership
- **Rationale:** Field workers need to create follow-up tasks directly from daily logs without waiting for admin intervention

### Task Linking via relatedEntity
- **Decision:** Used existing `relatedEntityType` + `relatedEntityId` fields on the Task model rather than a new join table
- **Rationale:** Schema already supports polymorphic entity linking; no migration needed

### Urgency Thresholds
- **Decision:** Overdue = past due, Yellow = within 24h, Green = > 1 day out
- **Rationale:** Aligns with construction daily rhythm — tasks due tomorrow need attention today

### Watch App Architecture
- **Decision:** Watch app with companion iOS app (not watch-only)
- **Rationale:**
  - Ships inside the existing iOS bundle — single App Store listing
  - Shared auth via WatchConnectivity (no tiny-screen login)
  - Offline handoff through phone's outbox for WiFi-only watches
  - watchOS extension in SwiftUI; Wear OS as separate Kotlin Compose app
  - Both talk to existing Nexus API endpoints directly when connected

## Deployment

- **Version:** 2.2.0 (build 29)
- **Commit:** `c0db31bf` on `main`
- **Android APK:** `nexus-mobile-release-20260222-123130.apk` → Google Drive
- **iOS IPA:** EAS Build `ab79a3f6-8521-4b90-9a67-218e2d12c013` → TestFlight submitted

## Lessons Learned

1. **Existing schema fields are underutilized** — `relatedEntityType`/`relatedEntityId` on Task and `createdByUserId` were already in the schema but not wired through the DTO or service. Always check existing columns before proposing migrations.
2. **API path mismatches** — The contacts 404 was a simple path mismatch (`/contacts` vs `/personal-contacts`). Consider adding an API route registry or OpenAPI spec to prevent drift between mobile client and API.
3. **Optimistic updates improve UX dramatically** — Task toggle feels instant with optimistic state + silent revert on failure.

## Next Steps

- [ ] Scaffold watchOS extension target (SwiftUI) with clock in/out and task badge screens
- [ ] Scaffold Wear OS companion app (Kotlin Compose)
- [ ] Procedure / Checklist daily log type (research started, needs plan)
- [ ] Task escalation system — auto-escalate overdue tasks to the assignee's manager
- [ ] Consider adding `npm run docs:sync` to push this session export to Nexus Documents

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-22 | Initial session export |
