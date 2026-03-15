---
cam_id: "TECH-COLLAB-0002"
title: "Session Mirror — Remote Dev Oversight from Any Device"
mode: TECH
category: COLLAB
revision: "1.3"
tags: [cam, tech, collab, mobile, web, dev-oversight, session-mirror, super-admin, idle-management, search, device-driven, cross-platform]
status: validated
created: 2026-03-13
updated: 2026-03-15
author: Warp
score:
  uniqueness: 9
  value: 8
  demonstrable: 9
  defensible: 7
  total: 83
website: false
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# TECH-COLLAB-0002 — Session Mirror: Remote Dev Oversight from Any Device

## Executive Summary

Session Mirror enables the CEO/SUPER_ADMIN to monitor, review, comment on, and approve/reject development work happening on the Mac Studio — from anywhere in the world, via the NCC mobile app **or the NCC web app on any laptop/desktop browser**. This is a first-of-its-kind capability in the restoration industry: real-time cross-platform command-and-control over AI-assisted software development.

## Problem Statement

Development velocity is constrained when the decision-maker must be physically present to review changes, approve deployments, or redirect the AI agent. Context-switching to a laptop breaks the flow of field work, client meetings, and travel.

## Solution

A full-stack "Session Mirror" system that bridges the Warp AI agent on the Mac Studio with both the NCC mobile app and the NCC web app:

1. **Live Event Feed** — Every file change, command, design decision, and milestone streams to mobile in real-time
2. **Approval Gates** — Critical actions (deployments, schema changes, destructive operations) require explicit mobile approval before proceeding
3. **Comment System** — SUPER_ADMIN can post comments that the agent sees and responds to
4. **Push Notifications** — Approval requests trigger iOS/Android push with Approve/Reject action buttons
5. **WebSocket Real-Time** — Socket.IO gateway (`/dev-session`) pushes events instantly; REST fallback with 5-second polling
6. **Device-Driven Architecture** — Mobile controls all data flow; polling only runs when screen is visible and app is in foreground
7. **Idle Management** — 3-minute inactivity timer stops all polling; "tap to resume" overlay eliminates background noise
8. **Session Archive + Search** — Full chronological archive of all dev sessions (backfilled from git history), with debounced server-side search across titles, descriptions, and event summaries
9. **Remote Session Creation** — Create new dev sessions directly from mobile or web via inline form; navigate to detail immediately on creation
10. **Web Session Mirror** — Full two-column browser UI at `/system/session-mirror` with identical capabilities: session list with search, real-time event feed, idle management, comment input, and approval actions. Maximum portability — works on any laptop or desktop

## Technical Architecture

- **Database:** 3 new Prisma models (DevSession, DevSessionEvent, DevApprovalRequest) with full audit trail
- **API:** NestJS module with REST controller + Socket.IO gateway, all gated by `@GlobalRoles(GlobalRole.SUPER_ADMIN)`
- **API Search:** Server-side `?q=` parameter searches across session title, description, sessionCode, and event summaries (case-insensitive)
- **WebSocket Security:** JWT validated on connection; non-SUPER_ADMIN sockets rejected immediately
- **Mobile — Session List:** Flat chronological list sorted by `updatedAt DESC` with total session count badge, debounced search bar, and inline session creation form
- **Mobile — Focus-Aware Polling:** `useFocusEffect` + `AppState` listener ensures polling only runs when the screen is visible and the app is in the foreground. Stops immediately on blur or background.
- **Mobile — Idle Timer:** 3-minute inactivity timeout on the detail screen. Tracks scroll/touch/comment interactions. On idle: stops 5-second event polling, shows 💤 overlay. On touch: resumes instantly.
- **Mobile — Remote Creation:** "+" button in header opens inline form (title + optional description) → POST to `/dev-session` → navigates to new session detail
- **Web — Two-Column Layout:** Left panel (380px) shows session list with search; right panel shows selected session's event feed, comment input, and approval actions. Full viewport-height, scroll-constrained design.
- **Web — Same Idle Management:** 3-minute inactivity timer on detail pane; mouse-move resets timer; 💤 overlay with click-to-resume. Event polling at 5s when active, stops on idle.
- **Web — Session Creation:** Inline form at top of page (title + description) with Enter key shortcut. Session auto-selects in detail pane on creation.
- **Web — ADMIN+ Access:** Page lives at `/system/session-mirror` behind the existing system layout ADMIN+ guard. Nav pill link in the superuser menu bar.
- **Cross-Company Visibility:** SUPER_ADMIN sees all sessions across all companies (not scoped to JWT company context)
- **Session Archive:** Historical sessions backfilled from git commit history — 32+ sessions spanning Feb 26 through present, each with title, description, and start/completion events
- **Race Condition Guard:** `initialRouteName` safely falls back to HomeTab when DevSessionsTab hasn't mounted yet (async role check)
- **Safe Area Compliance:** Detail screen header respects iOS safe area insets with enlarged touch targets for iPad landscape
- **Push:** Expo push notifications with `dev_approval` category (Approve/Reject buttons) and `dev_session` category (View button)
- **Deep Links:** Tapping a notification navigates directly to the session detail screen

## Competitive Advantage

No competitor in restoration or construction software offers:
- Real-time cross-platform oversight of AI-assisted development (mobile + web)
- Push-notification-gated deployment approvals from a phone
- Device-driven data flow control with idle management — zero background noise when not in use
- A searchable archive of every development session indexed from git history
- Remote session creation from any device — start directing AI work from anywhere
- A browser-based session control surface accessible from any laptop without installing anything
- A unified platform where operational software and its own development lifecycle are managed in the same app

This capability demonstrates that NEXUS is not just software — it's a self-evolving platform where the CEO maintains strategic control regardless of location or device.

## Key Metrics

- Time to approve/reject: < 5 seconds (push notification → tap)
- Event delivery latency: < 1 second (WebSocket), < 5 seconds (polling fallback)
- Approval expiry: 30 minutes (prevents stale approvals)

## Related Modules

- TECH-COLLAB-0001 (NexBRIDGE Remote Support) — shares the Socket.IO gateway architecture pattern
- Mobile Push Notification system — leveraged for delivery
- Warp AI Agent — primary producer of session events

## Revision History

| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-13 | Initial release — full Session Mirror implementation |
| 1.1 | 2026-03-15 | Fixed race condition crash, cross-company visibility, safe area back button, live session demo |
| 1.2 | 2026-03-15 | Device-driven architecture: focus-aware polling, 3-min idle timer, server-side search, remote session creation, historical session archive from git (32+ sessions) |
| 1.3 | 2026-03-15 | Web Session Mirror: two-column browser UI at /system/session-mirror with full feature parity — list, search, event feed, idle management, comments, approval actions |
