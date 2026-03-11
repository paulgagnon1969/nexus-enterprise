---
title: "Attachment URL Migration & File Integrity SOP"
module: file-storage
revision: "1.0"
tags: [sop, file-storage, migration, attachments, minio, infrastructure]
status: draft
created: 2026-03-11
updated: 2026-03-11
author: Warp
---

# Attachment URL Migration & File Integrity

## Purpose
Documents the one-time migration of attachment URLs from legacy GCS/API domains to canonical `gs://bucket/key` format after moving production from GCP Cloud Run to the local Mac Studio shadow stack. Also defines the ongoing procedure for auditing file integrity.

## Background
When production moved from GCP to the local Mac Studio (Cloudflare Tunnel), all files were copied from Google Cloud Storage into the local MinIO instance. However, the database still contained URLs pointing to three dead domains:

- `https://storage.googleapis.com/{bucket}/{key}` — old GCS public URLs
- `https://api-staging.ncc-nexus-contractor-connect.com/files/{bucket}/{key}` — old API proxy domain
- `gs://{bucket}/{key}` — already correct (native MinIO URI format)

The canonical format is `gs://bucket/key`. The API's `signFileUrl()` method (daily-log.service.ts) and `downloadPortalFile()` method (project.service.ts) convert `gs://` URIs to proper proxy URLs via `MINIO_PUBLIC_URL` at runtime.

## Who Uses This
- System administrators performing infrastructure migrations
- Developers working on file storage or attachment features

## What Was Migrated (2026-03-11)

### Tables Affected
- `ProjectFile.storageUrl` — 139 rows (112 GCS HTTPS + 27 legacy API)
- `DailyLogAttachment.fileUrl` — 120 rows (109 GCS HTTPS + 11 legacy API)
- `ProjectBillAttachment.fileUrl` — 13 rows (13 legacy API)
- `ProjectInvoiceAttachment.fileUrl` — 0 rows (already correct)

**Total: 272 rows normalized across 4 tables.**

### MinIO Buckets Containing Migrated Files
- `ncc-uploads-prod` — original GCS bucket (daily logs, project files from pre-migration era)
- `nexus-xact-uploads` — Xact estimate uploads and newer daily log photos
- `nexus-uploads` — uploads from the transitional API domain period

### SQL Migration Applied

```sql
-- Pattern 1: GCS HTTPS → gs://
UPDATE "ProjectFile"
SET "storageUrl" = regexp_replace("storageUrl",
  '^https://storage\.googleapis\.com/([^/]+)/(.+)$', 'gs://\1/\2')
WHERE "storageUrl" LIKE 'https://storage.googleapis.com/%';

-- Pattern 2: Legacy API → gs://
UPDATE "ProjectFile"
SET "storageUrl" = regexp_replace("storageUrl",
  '^https://api-staging\.ncc-nexus-contractor-connect\.com/files/(.+)$', 'gs://\1')
WHERE "storageUrl" LIKE 'https://api-staging.ncc-nexus-contractor-connect.com/%';

-- Same patterns repeated for DailyLogAttachment, ProjectInvoiceAttachment,
-- and ProjectBillAttachment (fileUrl column).
```

## File Integrity Audit Procedure

### When to Run
- After any infrastructure migration (storage backend change)
- If a user reports broken attachments
- Quarterly as a health check

### Step 1: Check URL Patterns

```sql
-- Run against prod DB to identify broken URL patterns
SELECT
  CASE
    WHEN "storageUrl" LIKE 'gs://%' THEN 'gs:// (OK)'
    WHEN "storageUrl" LIKE 'https://storage.googleapis.com/%' THEN 'GCS HTTPS (BROKEN)'
    WHEN "storageUrl" LIKE 'https://api-staging.ncc-nexus-contractor-connect.com/%' THEN 'Legacy API (BROKEN)'
    ELSE LEFT("storageUrl", 40)
  END as pattern,
  COUNT(*) as cnt
FROM "ProjectFile"
GROUP BY 1 ORDER BY 2 DESC;
```

### Step 2: Extract MinIO Paths

```sql
SELECT DISTINCT
  CASE
    WHEN "storageUrl" ~ '^gs://' THEN
      regexp_replace("storageUrl", '^gs://([^/]+)/(.+)$', '\1/\2')
    WHEN "storageUrl" ~ '^https://storage.googleapis.com/' THEN
      regexp_replace("storageUrl", '^https://storage.googleapis.com/([^/]+)/(.+)$', '\1/\2')
    WHEN "storageUrl" ~ '^https://api-staging.ncc-nexus-contractor-connect.com/files/' THEN
      regexp_replace("storageUrl", '^https://api-staging.ncc-nexus-contractor-connect.com/files/(.+)$', '\1')
  END as minio_path
FROM "ProjectFile"
WHERE "projectId" = '<PROJECT_ID>';
```

### Step 3: Verify Files Exist in MinIO

```bash
# Save paths to file, then verify each with mc stat
docker exec nexus-shadow-minio mc stat "local/<bucket>/<key>"
```

### Step 4: Verify API Proxy Serves Files

```bash
# Test via Cloudflare Tunnel
curl -s -o /dev/null -w "HTTP %{http_code}" \
  "https://staging-api.nfsgrp.com/files/<bucket>/<key>"
```

## Known Remaining Issues

### 1. Invoice Print Embeds Raw fileUrl
**Location:** `apps/web/app/projects/[id]/page.tsx` ~line 3685
**Problem:** The invoice print function embeds `fileUrl` directly as `<img src>`. With URLs now in `gs://` format, these are not browser-loadable.
**Impact:** Attachment images appear broken in printed invoices.
**Fix needed:** Have the API return proxy URLs for invoice/bill attachments (same pattern as `signFileUrl()` in daily-log.service.ts), or have the frontend convert `gs://` URIs to proxy URLs before rendering.

### 2. DailyLogAttachments Without ProjectFile Records
Some older `DailyLogAttachment` rows (e.g., .MOV video files) have no `projectFileId`. These cannot be downloaded via the client portal's `downloadPortalFile()` endpoint, which requires a `ProjectFile` record.
**Fix needed:** Either backfill `ProjectFile` records for orphaned attachments, or add a fallback download path that uses the `DailyLogAttachment.fileUrl` directly.

### 3. Future Upload Paths
New uploads go through `UploadProxyService` which stores files in the bucket defined by `MINIO_BUCKET` env var (currently `nexus-uploads`) and saves `gs://` URIs. No action needed — new files are already in the correct format.

## Related Modules
- File Proxy Controller (`apps/api/src/modules/uploads/file-proxy.controller.ts`)
- MinIO Storage Service (`apps/api/src/infra/storage/minio-storage.service.ts`)
- Daily Log Service — `signFileUrl()` (`apps/api/src/modules/daily-log/daily-log.service.ts`)
- Project Service — `downloadPortalFile()` (`apps/api/src/modules/project/project.service.ts`)
- Client Portal Project Page (`apps/web/app/client-portal/projects/[id]/page.tsx`)

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-03-11 | Initial release — documents URL migration and audit procedure |
