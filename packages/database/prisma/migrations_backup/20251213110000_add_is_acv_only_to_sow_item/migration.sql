-- Add isAcvOnly flag to SowItem to distinguish ACV-only settlements
ALTER TABLE "SowItem"
ADD COLUMN "isAcvOnly" BOOLEAN NOT NULL DEFAULT FALSE;