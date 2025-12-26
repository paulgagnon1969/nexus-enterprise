# UI Performance SOP

This document defines how we keep the Nexus web UI (Next.js / React) fast and predictable.

## Goals

- Keep interactions feeling instantaneous on modern hardware.
- Avoid regressions as pages get more complex.
- Make performance expectations part of normal development and review.

## Baseline standards

Per interaction (click, tab change, filter):

- Input delay (time from user action to JS handler running): **< 50 ms**.
- Total click + render time:
  - Normal screens: target **< 200 ms**, acceptable up to **300 ms**.
  - Heavy data views (large tables, logs): OK up to **400–500 ms**, but only when the heavy view is actually opened.

Per page:

- Initial render: should not block longer than ~1 second on a fast desktop.
- Do not fetch or render more data than is needed for what is visible.

These are guidelines, not hard real-time guarantees, but they should hold for all new work unless there is a very clear reason.

## Default patterns for pages

All new complex pages should follow these patterns by default.

### 1. Split pages into subcomponents

- The top-level page component should:
  - Own routing and high-level state (which tab is active, filter values, etc.).
  - Perform data fetching.
- Heavy visual sections (big cards, tables, logs) should live in child components, not inline in the page component.
- Child components should be declared as:
  - `const MySection = memo(function MySection(props) { ... })`.

Benefits:

- Small state changes (messages, flags) at the page level do not force large sections to re-render if their props did not change.
- Easier to reason about what is expensive.

### 2. Memoize derived values

- Any expensive computation over arrays (e.g. `reduce`, `flatMap`, large `map`) should be inside:
  - A memoized child component, and/or
  - A `useMemo` block.
- Only recompute when the relevant input data changes.

Example:

- Computing `itemsWithComponents` and `totalComponents` from `componentsItems` should use `useMemo` keyed on `componentsItems`.

### 3. Keep state local and targeted

- Page-level state should be limited to things that truly affect multiple sections:
  - Active tab.
  - Filters.
  - Shared error banners.
- Section-specific state (e.g. text inputs, open/closed toggles) should live in the child component when possible.
- Avoid having one giant state object that forces everything below it to update on every change.

### 4. Lazy-load heavy data

For heavy data sets (large tables, long logs):

- Load **summaries** at page load (counts, last upload timestamps, small aggregates).
- Load the **full data** only when:
  - The user switches to the relevant tab, or
  - The user scrolls the heavy view into sight.

When implementing a new endpoint for a heavy table, consider providing:

- `GET /resource/summary` – cheap, small payload used in cards.
- `GET /resource/table` (or paginated) – only called when the user explicitly opens the table.

### 5. Pagination and windowing (when needed)

If a table regularly exceeds thousands of rows:

- Prefer server-side pagination or cursors.
- At minimum, limit the initial payload (e.g. first 100–200 rows) and add controls for more.
- Consider simple row virtualization/windowing if the UX truly needs to display very large lists.

## Code review checklist (UI changes)

For any PR that touches `apps/web/app/*` pages or large components:

**Structure**

- [ ] Complex pages are split into logical subcomponents (no monolithic 1,000-line page components).
- [ ] Heavy sections (tables, logs, big cards) are wrapped in `React.memo` or clearly isolated.

**Data and rendering**

- [ ] Expensive derived values (reductions over big arrays) use `useMemo` or live inside memoized children.
- [ ] Props to heavy child components are stable (no new inline object/array literals on every render unless necessary).
- [ ] No obvious over-fetching (we are not pulling back huge payloads we do not show).

**Performance sanity check**

- [ ] A quick Chrome Performance recording was taken for at least one critical interaction on the page.
- [ ] Input delay is comfortably under 50 ms.
- [ ] Overall interaction time is within the target range, or there is a clear justification if not (e.g., first open of a very large table).

## How to run a quick performance check

Use Chrome DevTools Performance panel:

1. Open the page (e.g. Financial, Company Settings).
2. Press the record button.
3. Perform a single important interaction:
   - Click a tab.
   - Apply a filter.
   - Open a heavy table.
4. Stop recording.
5. Inspect:
   - Input delay for the click (should be a tiny slice, well under 50 ms).
   - The total duration of the event until the screen has settled.
   - The React commit(s) associated with the interaction.

If the interaction is slow:

- Identify which component is responsible in the flame chart.
- Apply the patterns above (split into subcomponents, memoize, lazy-load as appropriate).

## Where to apply this first

Priorities for applying this SOP:

1. High-traffic pages:
   - Financial.
   - Daily Logs.
   - Main dashboards.
2. Configuration surfaces that will grow over time:
   - Company Settings.
   - System/Nexus admin screens.
3. Any new page that renders large tables or long historical logs.

Following this SOP keeps the UI responsive as data volumes and feature surface grow, and gives future contributors a clear target when building new screens.