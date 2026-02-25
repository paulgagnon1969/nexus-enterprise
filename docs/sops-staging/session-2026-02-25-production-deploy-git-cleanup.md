---
title: "Production Deploy, Git Cleanup & Mobile Builds — 2026-02-25"
module: deployment
revision: "1.0"
tags: [sop, deployment, git, mobile, api, web, production, git-filter-repo]
status: draft
created: 2026-02-25
updated: 2026-02-25
author: Warp
visibility:
  public: false
  internal: true
  roles: [admin, exec, pm]
---

# Production Deploy, Git Cleanup & Mobile Builds — Feb 25, 2026

## Purpose
Session export documenting the full production deployment cycle, git repository optimization, and mobile build pipeline executed on February 25, 2026.

## Summary of Work

### 1. API Production Deployment
- **Docker image** built for `linux/amd64` and pushed to GCR: `gcr.io/nexus-enterprise-480610/nexus-api:917fc256`
- **Prisma migrations** applied to production DB via Cloud SQL proxy (port 5433):
  - `20260225120531_add_bom_source_tracking`
  - `20260225124231_add_plan_sheets`
- **Cloud Run** deployment succeeded: `nexus-api-00774-bpd` serving 100% traffic
- **Production URL**: `https://nexus-api-979156454944.us-central1.run.app`
- **Key fix**: Initial build was ARM64 (Apple Silicon default) — rebuilt with `--platform linux/amd64` for Cloud Run compatibility

### 2. Mobile Build v2.5.0 (Build 42)
- **Version bumped** from 2.4.0 → 2.5.0 (both `version` and `runtimeVersion`)
- **Native rebuild required** due to new `expo-contacts` module
- **Android APK**: Built locally via Gradle, saved to Google Drive as `nexus-mobile-release-20260225-074710.apk`
- **iOS IPA**: Built locally via `eas build --local`, submitted to TestFlight (build 42)
- **New features in v2.5.0**: Unified contacts system, phone contact import, invite workflows, plan sheets, BOM tracking

### 3. Drawings BOM Bug Fix
- **Problem**: Web app called `/drawings-bom/:projectId/uploads` — returned 404
- **Root cause**: Frontend URLs didn't match API controller route `projects/:projectId/drawings-bom`
- **Fix**: Corrected both the list endpoint and detail endpoint URLs in `apps/web/app/projects/[id]/page.tsx`

### 4. Drawings BOM Upload Button
- **Problem**: Drawings BOM view showed "Use the Drawings BOM API to upload architectural PDFs" with no upload UI
- **Solution**: Added:
  - Hidden file input (`accept="application/pdf"`)
  - Blue "Upload Drawing PDF" button (always visible)
  - Client-side validation (PDF type, 100 MB limit)
  - `handleDrawingsBomUpload` callback using `POST /projects/:projectId/drawings-bom/upload`
  - Auto-selects new upload after success

### 5. Git Repository Optimization (5 GB → 53 MB)

#### Phase 1: Stop Tracking (`.gitignore` + `git rm --cached`)
Updated `.gitignore` and untracked 578 files:
- `docs/data/` — 415 files of reference data (CSVs, Excel, images, PDFs)
- `docs/plan-sheets/` — 72 plan sheet images
- `apps/api/uploads/` — 17 runtime upload files
- `.turbo/cache/` — 72 build cache files
- `.cache/` — 1 sitemap file

#### Phase 2: History Rewrite (`git-filter-repo`)
- Installed `git-filter-repo` via Homebrew
- Ran `git filter-repo --invert-paths` to strip 5 directories from all 855 commits
- **Result**: `.git` directory went from ~5 GB → 53 MB (99% reduction)
- Force-pushed rewritten history to GitHub
- All commit content preserved, only SHAs changed

#### Top offenders removed from history:
- `docs/data/NFS*` — ~1 GB
- `docs/data/NEXUS*` — ~150 MB across multiple files
- `docs/plan-sheets/images/` — ~30 MB
- `apps/api/uploads/` — ~290 MB
- `apps/web/public/ncc-login.png` — 12 MB

### 6. Vercel Deployment Optimization
- **Problem**: Vercel was uploading ~5 GB (entire working directory including mobile native builds, data files, etc.)
- **Solution**: Created `.vercelignore` excluding:
  - `apps/mobile/android/` (1.8 GB)
  - `apps/mobile/ios/` (1.1 GB)
  - `docs/data/` (487 MB)
  - `apps/api/uploads/` (286 MB)
  - `docs/plan-sheets/` (70 MB)
  - Build artifacts, infra, scripts
- **Result**: Vercel deploys now complete in ~12 minutes (down from timing out)

### 7. Web Production Deployments (Vercel)
Three Vercel production deploys executed:
1. Drawings BOM URL fix
2. Upload button + `.vercelignore` (failed due to syntax error from edit)
3. Final successful deploy with all fixes
- **Production URL**: `https://ncc.nfsgrp.com`

### 8. Mobile Build v2.6.0 (Build 44)
- **Android APK**: `nexus-mobile-release-20260225-142322.apk` on Google Drive
- **iOS IPA**: Submitted to TestFlight (build 44)
- **New features in v2.6.0**: Plan sheet viewer, video calling enhancements (invite UI, project-scoped calls, active call banners)

### 9. Help Items System (User-authored)
- New `HelpItem` Prisma model with CRUD API (`/help-items`)
- `HelpOverlay` component scanning `data-help` attributes
- Admin management page at `/admin/help`
- Global '?' button in UI shell
- Migration: `20260225154038_add_help_items`

## Lessons Learned

1. **Always build Docker images with `--platform linux/amd64`** when deploying to Cloud Run from Apple Silicon Macs
2. **Cloud SQL socket URLs** (e.g., `?host=/cloudsql/...`) only work inside Cloud Run — use Cloud SQL proxy for local migration runs
3. **`git filter-repo`** is fast and safe for repo cleanup (~4 seconds for 855 commits) — the main risk is force-push breaking other clones
4. **`.vercelignore`** is essential for monorepos with mobile native builds — without it, Vercel uploads everything in the working directory
5. **`eas submit --latest`** picks up the latest EAS cloud build, not local builds — use `--path` for local IPAs

## Commands Reference

```bash
# Deploy API to production
export PROJECT_ID="nexus-enterprise-480610" REGION="us-central1" SERVICE="nexus-api"
docker build --platform linux/amd64 -f apps/api/Dockerfile -t "gcr.io/$PROJECT_ID/nexus-api:$(git rev-parse --short HEAD)" .
docker push "gcr.io/$PROJECT_ID/nexus-api:$(git rev-parse --short HEAD)"
gcloud run deploy nexus-api --image="gcr.io/$PROJECT_ID/nexus-api:TAG" --region=us-central1 --platform=managed

# Run prod migrations via Cloud SQL proxy
cloud-sql-proxy nexus-enterprise-480610:us-central1:nexusprod-v2 --port=5433 &
DATABASE_URL='postgresql://postgres:PASS@127.0.0.1:5433/nexus_db' npm -w packages/database exec -- npx prisma migrate deploy

# Git repo cleanup
git filter-repo --invert-paths --path docs/data/ --path docs/plan-sheets/ --path apps/api/uploads/ --force
git remote add origin git@github.com:user/repo.git
git push origin main --force

# Mobile builds
bash apps/mobile/scripts/build-android-local.sh release
cd apps/mobile && eas build --platform ios --profile production --local --non-interactive
eas submit --platform ios --path ./build-TIMESTAMP.ipa --non-interactive

# Vercel deploy
vercel --prod --yes --archive=tgz
```

## Revision History
| Rev | Date | Changes |
|-----|------|--------|
| 1.0 | 2026-02-25 | Initial session export |
