---
title: "Next.js useSearchParams Suspense Boundary SOP"
module: web-frontend
revision: "1.0"
tags: [sop, web-frontend, nextjs, build, suspense, useSearchParams]
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin]
---

# Next.js useSearchParams Suspense Boundary

## Purpose
Prevent `next build` failures caused by `useSearchParams()` in `"use client"` pages. This is a Next.js 14+ requirement that causes silent dev-mode success but hard build-time failures.

## The Problem
Next.js 14 requires `useSearchParams()` to be called inside a `<Suspense>` boundary. During `next build`, pages using it without Suspense will fail with:
```
useSearchParams() should be wrapped in a suspense boundary at page "/example"
Error occurred prerendering page "/example"
```

This does NOT fail during `next dev` — it only fails during production builds, making it a deploy-time surprise.

## Required Pattern

### Option A: Suspense Wrapper (Preferred)
Split the page into a thin wrapper + inner component:

```tsx
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

export default function MyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MyPageInner />
    </Suspense>
  );
}

function MyPageInner() {
  const searchParams = useSearchParams();
  // ... rest of page
}
```

### Option B: Config Flag (Safety Net)
`apps/web/next.config.mjs` includes:
```js
experimental: {
  missingSuspenseWithCSRBailout: false,
}
```
This prevents the build from failing when a Suspense boundary exists in the same `"use client"` file but isn't detected by Next.js static analysis. **This flag is currently enabled** as of 2026-03-11.

## Pages Currently Using useSearchParams
- `apps/web/app/nexfit/page.tsx` — Suspense boundary added 2026-03-11
- Any other `"use client"` page importing `useSearchParams` from `next/navigation`

## When Adding New Pages
1. If your page needs query parameters, use `useSearchParams()`
2. Always wrap the component using it in a `<Suspense>` boundary
3. Test with `npm run build` (not just `npm run dev`) before deploying

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-03-11 | Initial SOP after nexfit build failure |
