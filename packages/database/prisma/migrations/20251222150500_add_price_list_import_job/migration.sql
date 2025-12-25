-- Add PRICE_LIST import job type and allow ImportJob.projectId to be NULL

-- Extend ImportJobType enum with PRICE_LIST
ALTER TYPE "ImportJobType" ADD VALUE 'PRICE_LIST';

-- Allow company-level import jobs (e.g., Golden price list) without a projectId
ALTER TABLE "ImportJob"
  ALTER COLUMN "projectId" DROP NOT NULL;
