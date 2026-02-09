-- AlterTable: Add itemNote and Change Order fields to SowItem
-- These columns were added to support Xactimate item notes and standalone change orders

-- Add itemNote field (Xactimate Note 1 column)
ALTER TABLE "SowItem" ADD COLUMN IF NOT EXISTS "itemNote" TEXT;

-- Add Change Order tracking fields
ALTER TABLE "SowItem" ADD COLUMN IF NOT EXISTS "isStandaloneChangeOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SowItem" ADD COLUMN IF NOT EXISTS "coSequenceNo" INTEGER;
ALTER TABLE "SowItem" ADD COLUMN IF NOT EXISTS "coSourceLineNo" INTEGER;
