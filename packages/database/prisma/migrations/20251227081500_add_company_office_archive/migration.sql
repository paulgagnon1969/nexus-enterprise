-- Simplified migration for CompanyOffice soft-delete support.
--
-- Originally this migration attempted to create a partitioned archive table
-- (archive."CompanyOffice") with RANGE partitioning on deletedAt. Postgres
-- requires that the PRIMARY KEY on a partitioned table include all
-- partitioning columns, which conflicted with the existing primary key
-- definition on "CompanyOffice". That caused Prisma's shadow database
-- validation to fail.
--
-- For now we keep the design simple and only add a partial index on the main
-- table for active (non-deleted) offices. This keeps day-to-day queries fast
-- while still allowing long-term soft-deleted rows to accumulate. If we need
-- true archive partitioning later, we can introduce it via a dedicated,
-- hand-crafted migration.

CREATE INDEX "CompanyOffice_company_active_idx"
    ON "CompanyOffice" ("companyId")
    WHERE "deletedAt" IS NULL;
