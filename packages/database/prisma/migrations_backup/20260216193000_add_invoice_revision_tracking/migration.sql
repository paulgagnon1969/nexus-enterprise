-- Add revision tracking fields to ProjectInvoice
-- revisionNumber starts at 1, increments each time invoice is unlocked and re-issued
-- unlockHistory stores JSON array of unlock events for audit trail

ALTER TABLE "ProjectInvoice" ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProjectInvoice" ADD COLUMN "unlockHistory" JSONB;
