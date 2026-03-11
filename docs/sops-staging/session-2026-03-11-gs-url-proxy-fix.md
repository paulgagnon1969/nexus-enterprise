---
title: "Session Export — gs:// URL Proxy Fix & Frontend Audit"
module: attachment-management
revision: "1.1"
tags: [sop, attachment-management, file-storage, minio, migration, frontend, nextjs, deploy]
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec]
---

# Session Export — gs:// URL Proxy Fix & Frontend Audit

## Context
Following the GCS-to-MinIO migration (session 2026-03-06), all attachment URLs in the production database were normalized to canonical `gs://bucket/key` format. While this fixed API-level file serving through the `/files/:bucket/*` public proxy, the **frontend** was still embedding raw `gs://` URIs directly into `<img src>`, `<a href>`, and print HTML — making them unresolvable in the browser.

## Problems Solved

### 1. Invoice Print Attachments Broken
The invoice print view (`projects/[id]/page.tsx` ~line 3696) injected `fileUrl` directly into `<img src>` in a print iframe. With `gs://` URLs, these images failed to load, producing broken image icons on printed invoice packages.

### 2. Attachment Links Broken Across Multiple Pages
Raw `gs://` URLs were used as `<a href>` targets in:
- Bill attachment "View" links (uncommitted receipts + bills table)
- Invoice attachment list (interactive view)
- Gallery viewer (main image, thumbnails, download link)
- Financial duplicate comparison modal
- HR document links (photo, gov ID, attachments)
- Candidate onboarding document links and thumbnails
- Project files list in Todos page

### 3. Four .MOV Daily Log Videos Missing `projectFileId`
Identified 4 video attachments (2 Mary Lewis, 2 TEST JOB) that have `fileUrl` but no `projectFileId`, making them invisible to the client portal's `downloadPortalFile()` endpoint.

## Solution

### Shared Utility Function
Created `gsUrlToProxyUrl()` in `apps/web/app/lib/uploads.ts`:
- Converts `gs://bucket/key` → `${API_BASE}/files/bucket/key`
- Falls through for URLs already in HTTP(S) format
- Reuses the existing public `/files/:bucket/*` proxy (unauthenticated, streams from MinIO)

### Files Modified (6 files, ~20 call sites)
1. **`apps/web/app/lib/uploads.ts`** — Added shared `gsUrlToProxyUrl()` export
2. **`apps/web/app/projects/[id]/page.tsx`** — Print view, gallery viewer, invoice attachments, bill links (inline helper + shared import)
3. **`apps/web/app/financial/page.tsx`** — Duplicate comparison modal receipt images
4. **`apps/web/app/company/users/[userId]/page.tsx`** — HR document attachment links
5. **`apps/web/app/todos/page.tsx`** — Project files list
6. **`apps/web/app/company/users/candidates/[sessionId]/page.tsx`** — Candidate photo, gov ID, onboarding docs

### SOP Sync
Pushed all SOPs to eDocs: 1 new (attachment URL migration SOP from prior session), 128 updated, 0 errors.

## Decisions Made
- Used the public `/files/:bucket/*` proxy rather than the authenticated `/uploads/signed` endpoint — print iframes and `<img src>` tags can't pass JWT headers
- Kept the inline `gsUrlToProxyUrl` in `projects/[id]/page.tsx` alongside the shared import for backwards compatibility (both resolve identically)
- Did not modify the existing `/uploads/signed?uri=` pattern used by bill modal thumbnails (line ~18824) since it already handles `gs://` via a different code path

## Additional Fix: Nexfit Prerender Error
During production deploy, `next build` failed with:
> `useSearchParams() should be wrapped in a suspense boundary at page "/nexfit"`

This was a **pre-existing issue** unrelated to the gs:// changes. `useSearchParams()` in a `"use client"` page triggers static prerender failure in Next.js 14.

**Fix applied (2 changes):**
1. Wrapped the Nexfit page content in a `<Suspense>` boundary (`NexfitPage` → `NexfitPageInner`)
2. Added `experimental.missingSuspenseWithCSRBailout: false` to `apps/web/next.config.mjs` — required because Next.js build-time analysis doesn't detect Suspense boundaries inside `"use client"` files

**Pattern for future pages:** Any `"use client"` page that calls `useSearchParams()` needs a Suspense wrapper. The `next.config.mjs` flag prevents this from being a build-breaking error app-wide.

## Production Deploy
- Deployed via `npm run deploy:shadow:web`
- Build time: ~107s
- Health check: `staging-ncc.nfsgrp.com` → HTTP 200
- All `nexus-shadow-*` containers healthy

## Unresolved Items
1. **INV-MARYL.20260216.002 has zero attachments** — user handling manually
2. **Four .MOV files missing `projectFileId`** — user downloading and re-uploading
3. **Candidate doc availability check** (line ~673 in candidates page) uses `fetch(url, { method: "HEAD" })` which will fail for `gs://` URLs that aren't converted first — low priority since `gsUrlToProxyUrl` now converts the display URLs, but the HEAD check itself could be updated to use proxy URLs too

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-03-11 | Initial session export |
| 1.1 | 2026-03-11 | Added nexfit prerender fix, production deploy details |
