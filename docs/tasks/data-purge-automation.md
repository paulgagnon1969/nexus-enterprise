# Task: Implement Automated Data Purge Jobs

**Created:** February 16, 2026
**Target Date:** Week of February 23, 2026
**Priority:** Medium
**Status:** Pending

---

## Overview

Implement automated data retention enforcement as defined in the Data Retention and Deletion Policy (`docs/policies/data-retention-policy.md`).

---

## Requirements

### 1. Inactive User Identification (Weekly Job)

- Flag user accounts with no login activity > 2 years
- Send notification to tenant admins
- After 30 days without action, soft-delete accounts

### 2. Session Token Cleanup (Daily Job)

- Remove expired refresh tokens from Redis
- Already partially implemented via Redis TTL
- Add logging for compliance reporting

### 3. Log Rotation (Daily Job)

- Archive logs older than retention period
- Compress and encrypt archived logs
- Move to cold storage (S3 Glacier or equivalent)

### 4. Backup Pruning (Weekly Job)

- Remove daily backups older than 30 days
- Remove weekly backups older than 90 days
- Coordinate with database provider (Neon/Supabase)

### 5. Data Purge (Monthly Job - Manual Trigger)

- Identify records eligible for permanent deletion
- Require admin approval before execution
- Hard delete soft-deleted records past retention period
- Generate compliance report

---

## Technical Implementation

### Job Scheduler Options

1. **Cron jobs via Vercel** (limited)
2. **GitHub Actions scheduled workflows**
3. **Separate worker service** (apps/api/src/worker.ts already exists)
4. **External service** (AWS Lambda, Cloud Functions)

### Recommended Approach

Extend `apps/api/src/worker.ts` with scheduled tasks:

```typescript
// Pseudo-code structure
async function runRetentionJobs() {
  await identifyInactiveUsers();
  await cleanupExpiredTokens();
  await archiveOldLogs();
  await generateComplianceReport();
}
```

---

## Database Changes Needed

1. Add `lastLoginAt` field to User model (if not exists)
2. Add `archivedAt` field for archival tracking
3. Create `DataPurgeLog` model for audit trail

---

## Compliance Report

Generate monthly report including:
- Number of inactive users identified
- Number of records archived
- Number of records permanently deleted
- Any deletion requests processed
- Exceptions (legal holds, etc.)

---

## Testing

1. Test in staging environment first
2. Verify soft-delete doesn't break referential integrity
3. Verify hard-delete cascade behavior
4. Test data export before deletion

---

## Acceptance Criteria

- [ ] Weekly job identifies inactive users
- [ ] Daily session cleanup runs automatically
- [ ] Monthly purge job with manual approval
- [ ] Compliance report generated
- [ ] All actions logged in AdminAuditLog
- [ ] Documentation updated

---

## Notes

- Do NOT implement hard delete without explicit user approval
- Always generate export before permanent deletion
- Legal holds must block deletion regardless of retention period

---

**Assigned to:** Development Team
**Reviewer:** Data Protection Officer
