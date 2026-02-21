-- Add origin / carry-forward metadata to PetlReconciliationEntry
ALTER TABLE "PetlReconciliationEntry"
  ADD COLUMN "originEstimateVersionId" TEXT,
  ADD COLUMN "originSowItemId" TEXT,
  ADD COLUMN "originLineNo" INTEGER,
  ADD COLUMN "carriedForwardFromEntryId" TEXT,
  ADD COLUMN "carryForwardCount" INTEGER NOT NULL DEFAULT 0;

-- Optional index to help querying by origin estimate
CREATE INDEX IF NOT EXISTS "PetlReconEntry_origin_estimate_idx"
  ON "PetlReconciliationEntry"("originEstimateVersionId");
