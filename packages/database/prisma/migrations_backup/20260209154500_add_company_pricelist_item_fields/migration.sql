-- AlterTable: Add division, source tracking, and component breakdown fields to CompanyPriceListItem
-- These columns support division categorization, PETL source tracking, and cost component breakdowns

-- Division tracking
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "divisionCode" TEXT;

-- Source tracking for PETL auto-import
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "sourceProjectId" TEXT;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "sourceEstimateVersionId" TEXT;

-- Metadata for UI freshness and price history
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "lastPriceChangedAt" TIMESTAMP(3);
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "lastPriceChangedByUserId" TEXT;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "lastPriceChangedSourceImportJobId" TEXT;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "lastPriceChangedSource" TEXT;

-- Xactimate cost component breakdown (auto-populated from PETL imports)
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "workersWage" DOUBLE PRECISION;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "laborBurden" DOUBLE PRECISION;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "laborOverhead" DOUBLE PRECISION;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "materialCost" DOUBLE PRECISION;
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "equipmentCost" DOUBLE PRECISION;

-- Create index for divisionCode
CREATE INDEX IF NOT EXISTS "CompanyPriceListItem_divisionCode_idx" ON "CompanyPriceListItem"("divisionCode");

-- Create index for sourceProjectId
CREATE INDEX IF NOT EXISTS "CompanyPriceListItem_sourceProjectId_idx" ON "CompanyPriceListItem"("sourceProjectId");
