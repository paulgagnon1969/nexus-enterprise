---
title: "Production Migrations & Troubleshooting SOP (Local Mac Studio)"
module: database-migrations
revision: "1.2"
tags: [sop, database, migrations, troubleshooting, local-production, docker, admin-only]
status: draft
created: 2026-02-16
updated: 2026-03-03
author: Warp
---

# Production Migrations & Troubleshooting

## Purpose
This SOP documents the procedure for diagnosing production API errors (500s) caused by missing database columns, creating migrations, and applying them to the **local Mac Studio production database** (`NEXUSPRODv3`).

As of **March 2026**, production no longer runs on GCP Cloud Run / Cloud SQL. The old GCP workflow is archived at `docs/sops-staging/legacy-gcp/ncc-pm-production-migration-sop.md` for posterity.

## Current Workflow (Local Production)

### 1. Identify the Error
When users report 500 errors on specific pages:
1. Get the failing URL and check browser DevTools Network tab
2. Identify which API endpoint is returning 500 (e.g., `/projects/:id/invoices`)

### 2. Check Local Production Logs
```bash
# API logs
docker logs nexus-shadow-api --tail 200

# Worker logs (import jobs)
docker logs nexus-shadow-worker --tail 200
```

### 3. Identify Missing Column
Look for Prisma errors like:
```
originalMessage: 'column TableName.columnName does not exist'
kind: 'ColumnNotFound'
```

### 4. Create Migration
Create a migration in `packages/database/prisma/migrations/` and commit it.

### 5. Apply Migration to Local Production
Run Prisma migrations from `packages/database`.

```bash
# Use DATABASE_URL from .env.shadow (do not print it)
export DATABASE_URL="$(grep '^DATABASE_URL=' .env.shadow | head -1 | cut -d= -f2-)"

npm -w @repo/database exec -- npx prisma migrate deploy
```

### 6. Verify Fix
```bash
curl -s http://localhost:8000/health
```

## Who Uses This
- System Administrators
- DevOps Engineers
- Senior Developers with production access

## Legacy (Archived)
The former GCP Cloud Run / Cloud SQL workflow is archived at `docs/sops-staging/legacy-gcp/ncc-pm-production-migration-sop.md` for posterity.

## Environment Details (Current Local)
- **Production Stack**: Mac Studio shadow stack (Docker Compose)
- **Production API**: `nexus-shadow-api` (host port 8000)
- **Production Database**: `NEXUSPRODv3` on `nexus-shadow-postgres` (host port 5435)


## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.2 | 2026-03-03 | Removed GCP workflow from the active SOP and archived it under `docs/sops-staging/legacy-gcp/`. |
| 1.1 | 2026-03-03 | Updated SOP for local Mac Studio production migrations; demoted GCP Cloud Run/Cloud SQL instructions to legacy reference. |
| 1.0 | 2026-02-16 | Initial release (GCP Cloud SQL era). |
