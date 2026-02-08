-- Migration: Add itemNote field to SowItem
-- Purpose: Preserve Xactimate Note 1 values in SOW items so they're visible in the UI

-- Add itemNote column to SowItem
ALTER TABLE "SowItem" 
ADD COLUMN "itemNote" TEXT;

-- Optional: Backfill existing SowItems with notes from their RawXactRow
-- This will populate itemNote for all existing line items
UPDATE "SowItem" 
SET "itemNote" = r."note1"
FROM "RawXactRow" r
WHERE "SowItem"."rawRowId" = r.id
  AND r."note1" IS NOT NULL
  AND r."note1" != '';
