---
title: "System Documents — Clickable Titles & Build Pipeline Fixes"
module: admin-documents
revision: "1.0"
tags: [sop, admin-documents, system-documents, admin-only, build-pipeline]
status: draft
created: 2026-03-05
updated: 2026-03-05
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin]
---

# System Documents — Clickable Titles & Build Pipeline Fixes

## Purpose
Documents the changes deployed on 2026-03-05 that make system document titles clickable in the admin documents page and fix two build-pipeline issues that blocked web deploys.

## Who Uses This
- System administrators managing documents via `/admin/documents#system-docs`

## Changes Made

### 1. Clickable Document Titles (UI)
**File:** `apps/web/app/admin/documents/page.tsx`

Previously, system document titles in the "System Documents" collapsible section were plain text (`<span>`). Admins could only interact with the "Publish" button — there was no way to open a document's detail/viewer page directly from the list.

**After:** Each document title is now a clickable button (styled as a blue underlined link) that navigates to `/system/documents/{id}`. This works for **all** documents regardless of publication status (unpublished, partial, or fully published).

### 2. Missing Workspace Dependency
**File:** `apps/web/package.json`

The `@repo/support-client` package (located at `packages/support-client`) was imported by two pages (`app/support/viewer/page.tsx` and `app/support/screen-share/page.tsx`) but was never declared as a dependency of `apps/web`. This caused the Docker production build to fail with `Module not found: Can't resolve '@repo/support-client'`.

**Fix:** Added `"@repo/support-client": "*"` to `apps/web/package.json` dependencies.

### 3. TypeScript Auto-Type Discovery in Docker
**File:** `packages/support-client/tsconfig.json`

Inside the Docker build, TypeScript auto-discovered `@types/mapbox__point-geometry` (hoisted from `apps/web` devDependencies) and failed because the type definitions weren't fully available in the build context.

**Fix:** Added `"types": []` to `compilerOptions` to disable automatic `@types/*` discovery for this package, which has no need for external type definitions.

## Verification
- Production deploy succeeded: `npm run deploy:shadow:web`
- Health check passed: `staging-ncc.nfsgrp.com` → HTTP 200
- Document titles are clickable and navigate to the detail page for both published and unpublished documents.

## Related Modules
- [Document Import SOP](document-import-sop.md)
- [NCC SOP Sync System](ncc-sop-sync-system-sop.md)
- [Global Document Search](global-document-search-sop.md)

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-05 | Initial release |
