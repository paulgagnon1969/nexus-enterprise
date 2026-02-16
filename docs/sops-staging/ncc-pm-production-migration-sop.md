---
title: "NCC Production Migration & Troubleshooting SOP"
module: database-migrations
revision: "1.0"
tags: [sop, database, migrations, cloud-sql, troubleshooting, admin-only]
status: draft
created: 2026-02-16
updated: 2026-02-16
author: Warp
---

# NCC Production Migration & Troubleshooting

## Purpose
This SOP documents the procedure for diagnosing production API errors (500s) caused by missing database columns, creating migrations, and applying them to the production Cloud SQL database.

## Who Uses This
- System Administrators
- DevOps Engineers
- Senior Developers with production access

## Workflow

### Step-by-Step Process

#### 1. Identify the Error
When users report 500 errors on specific pages:

1. Get the failing URL and check browser DevTools Network tab
2. Identify which API endpoint is returning 500 (e.g., `/projects/:id/invoices`)

#### 2. Check Cloud Run Logs
```bash
# Check stderr logs for actual error messages
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="nexus-api" AND logName:"stderr"' \
  --limit=30 \
  --format='value(timestamp,textPayload)' \
  --project=nexus-enterprise-480610

# For more detailed JSON logs
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="nexus-api" AND timestamp>="YYYY-MM-DDTHH:MM:SSZ"' \
  --limit=10 \
  --format=json \
  --project=nexus-enterprise-480610
```

#### 3. Identify Missing Column
Look for Prisma errors like:
```
originalMessage: 'column TableName.columnName does not exist'
kind: 'ColumnNotFound'
```

#### 4. Verify Schema vs Migrations
Check if the column exists in schema but has no migration:
```bash
# Check schema for the column
grep -n "columnName" packages/database/prisma/schema.prisma

# Check if migration exists
grep -r "columnName" packages/database/prisma/migrations/ --include="*.sql"
```

#### 5. Create Migration
```bash
# Create migration directory (use timestamp format: YYYYMMDDHHMMSS)
mkdir -p packages/database/prisma/migrations/20260216150000_descriptive_name

# Create migration.sql file with appropriate ALTER TABLE statements
# Use IF NOT EXISTS for idempotency
```

Example migration:
```sql
ALTER TABLE "TableName" ADD COLUMN IF NOT EXISTS "columnName" TYPE NOT NULL DEFAULT value;
CREATE INDEX IF NOT EXISTS "index_name" ON "TableName"("columnName");
```

#### 6. Start Cloud SQL Proxy
```bash
# Check if proxy is running
ps aux | grep cloud-sql

# Start proxy on available port (avoid 5433 if local Docker is using it)
cloud-sql-proxy nexus-enterprise-480610:us-central1:nexusprod-v2 --port=5434
```

#### 7. Re-authenticate if Needed
If you get "invalid_grant" or "reauth related error":
```bash
gcloud auth application-default login
```
Then restart the proxy.

#### 8. Apply Migration to Production
```bash
# Set password securely
export PROD_DB_PASS="your_password"

# Run migration
cd packages/database
DATABASE_URL="postgresql://postgres:${PROD_DB_PASS}@127.0.0.1:5434/nexus_db" npx prisma migrate deploy
```

#### 9. Commit and Push
```bash
git add packages/database/prisma/migrations/
git commit -m "fix(db): add missing column description

Co-Authored-By: Warp <agent@warp.dev>"
git push origin main
```

#### 10. Verify Fix
Refresh the failing page and confirm the 500 error is resolved.

### Flowchart

```mermaid
flowchart TD
    A[User Reports 500 Error] --> B[Check Browser DevTools]
    B --> C[Identify Failing API Endpoint]
    C --> D[Check Cloud Run Logs]
    D --> E{Column Missing?}
    E -->|Yes| F[Check Schema vs Migrations]
    E -->|No| G[Investigate Other Causes]
    F --> H{Migration Exists?}
    H -->|No| I[Create Migration File]
    H -->|Yes| J[Check Migration Applied]
    I --> K[Start Cloud SQL Proxy]
    K --> L{Auth Valid?}
    L -->|No| M[gcloud auth login]
    M --> K
    L -->|Yes| N[Apply Migration]
    N --> O[Commit & Push]
    O --> P[Verify Fix]
    P --> Q[End]
```

## Key Features
- Uses `IF NOT EXISTS` for idempotent migrations
- Cloud SQL Proxy on alternate port (5434) to avoid Docker conflicts
- Secure password handling via environment variables
- Comprehensive logging queries for diagnosis

## Common Issues

| Issue | Solution |
|-------|----------|
| Port 5433 conflict | Use port 5434 for Cloud SQL Proxy |
| "invalid_grant" error | Run `gcloud auth application-default login` |
| "Can't reach database" | Ensure Cloud SQL Proxy is running |
| Authentication failed | Verify PROD_DB_PASS is correct |

## Related Modules
- [Database Schema Management]
- [Cloud Run Deployment]
- [API Error Handling]

## Environment Details
- **Production Database**: Cloud SQL PostgreSQL (nexusprod-v2)
- **Project ID**: nexus-enterprise-480610
- **Region**: us-central1
- **API Service**: nexus-api (Cloud Run)
- **Prisma Version**: 7.4.0

## Revision History
| Rev | Date | Changes |
|-----|------|---------|
| 1.0 | 2026-02-16 | Initial release based on INP fix and migration session |
