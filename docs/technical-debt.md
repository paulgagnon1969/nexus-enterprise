---
title: "Technical Debt Registry"
module: engineering
revision: "1.0"
tags: [technical-debt, engineering, architecture, cleanup]
status: draft
created: 2026-02-15
updated: 2026-02-15
author: Warp
---

# Technical Debt Registry

This document tracks known technical debt, architectural shortcuts, and cleanup tasks across the Nexus codebase. Items are prioritized by impact and effort.

## Priority Legend
- **🔴 HIGH** - Impacts performance, stability, or developer velocity significantly
- **🟡 MEDIUM** - Should be addressed but not blocking
- **🟢 LOW** - Nice-to-have cleanup

---

## Active Items

### 🟡 [MEDIUM] page.tsx schedule dead code cleanup
- **Added:** 2026-02-15
- **Location:** `apps/web/app/projects/[id]/page.tsx`
- **Context:** ScheduleSection was extracted to a separate component in PR #9. The original schedule code (~1,800 lines) remains in page.tsx but is never called.
- **Impact:** File bloat (27,800 → 26,000 lines), slower IDE performance, confusing for new developers
- **Effort:** ~2 hours
- **Tracking:** [GitHub Issue #10](https://github.com/paulgagnon1969/nexus-enterprise/issues/10)
- **Blocks to remove:**
  1. Mermaid imports & MermaidGantt component
  2. Schedule state variables (`useState` declarations)
  3. Schedule transition callbacks (`setSchedule*Transition`)
  4. Schedule loading `useEffect` hooks
  5. Schedule helper functions & useMemos (KEEP `roomToUnitLabel`)
  6. `renderSchedulePanel` function

### 🟢 [LOW] Legacy `any` types in PETL API responses
- **Added:** 2026-02-15
- **Location:** `apps/web/app/projects/[id]/page.tsx`, `apps/api/src/projects/`
- **Context:** Many PETL-related fetch responses use `any` type casting instead of proper interfaces
- **Impact:** Reduced type safety, potential runtime errors
- **Effort:** ~4 hours
- **Tracking:** None yet

### 🟢 [LOW] Duplicate utility functions across components
- **Added:** 2026-02-15
- **Location:** Various components in `apps/web/`
- **Context:** Functions like `unitSortKey`, date helpers appear in multiple places
- **Impact:** Code duplication, inconsistent behavior risk
- **Effort:** ~2 hours
- **Tracking:** None yet
- **Suggested fix:** Extract to `packages/utils` or `apps/web/lib/`

---

## Resolved Items

### ~~🔴 [HIGH] 2+ second INP on schedule toggle buttons~~
- **Added:** 2026-02-10
- **Resolved:** 2026-02-15
- **Resolution:** Extracted ScheduleSection to memoized component (PR #9), wrapped callbacks in `useTransition`
- **PR:** #8 (quick fix), #9 (full extraction)

---

## Patterns & Observations

### Large Component Files
The project page (`page.tsx`) grew to 27,800+ lines, causing:
- IDE slowdowns
- Difficult code review
- High INP on interactions

**Mitigation strategy:** Extract logical sections into memoized child components (as done with ScheduleSection).

### State Management
Currently using local `useState` extensively. Consider:
- React Query for server state
- Zustand/Jotai for complex client state
- URL state for filter persistence

---

## Adding New Items

When adding technical debt:
1. Assign a priority (🔴/🟡/🟢)
2. Include the date added
3. Describe context and impact
4. Estimate effort
5. Link to GitHub issue if actionable soon

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-15 | Initial registry created |
