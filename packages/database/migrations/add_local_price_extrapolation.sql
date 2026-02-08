-- Local Price Extrapolation Migration
-- Generated: 2026-02-08
-- Updated: 2026-02-08 (removed API dependency, use learned tax rates from PETL)
--
-- This migration adds support for learning regional pricing factors from PETL imports
-- and extrapolating accurate local prices when adding cost book items to estimates.
--
-- Key additions:
-- 1. ProjectRegionalFactors: Stores tax rate, O&P rate, and category-level price adjustments per project
-- 2. ProjectCategoryAdjustment: Category-specific price variance factors (by CAT/activity)
-- 3. ProjectTaxConfig: Tax rate learned from PETL imports (no external API)
-- 4. Company.defaultOPRate: Default O&P rate for bootstrap scenarios (defaults to 20%)

-- Add default O&P rate to Company for bootstrap mode
ALTER TABLE "Company" ADD COLUMN "defaultOPRate" DOUBLE PRECISION DEFAULT 0.20;

-- Create ProjectRegionalFactors table
CREATE TABLE "ProjectRegionalFactors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "aggregateTaxRate" DOUBLE PRECISION NOT NULL,
    "aggregateOPRate" DOUBLE PRECISION NOT NULL,
    "avgLaborRatio" DOUBLE PRECISION,
    "avgMaterialRatio" DOUBLE PRECISION,
    "avgEquipmentRatio" DOUBLE PRECISION,
    "totalItemAmount" DOUBLE PRECISION NOT NULL,
    "totalLineItems" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRegionalFactors_pkey" PRIMARY KEY ("id")
);

-- Create ProjectCategoryAdjustment table
CREATE TABLE "ProjectCategoryAdjustment" (
    "id" TEXT NOT NULL,
    "regionalFactorsId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "activity" TEXT,
    "avgPriceVariance" DOUBLE PRECISION NOT NULL,
    "medianPriceVariance" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "laborAdjustment" DOUBLE PRECISION,
    "materialAdjustment" DOUBLE PRECISION,
    "equipmentAdjustment" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCategoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- Create ProjectTaxConfig table
CREATE TABLE "ProjectTaxConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxZipCode" TEXT,
    "taxCity" TEXT,
    "taxState" TEXT,
    "learnedTaxRate" DOUBLE PRECISION,
    "learnedFromEstimateId" TEXT,
    "cachedStateTaxRate" DOUBLE PRECISION,
    "cachedCountyTaxRate" DOUBLE PRECISION,
    "cachedCityTaxRate" DOUBLE PRECISION,
    "taxRateSource" TEXT,
    "taxRateLastUpdated" TIMESTAMP(3),
    "taxRateConfidence" DOUBLE PRECISION,
    "manualTaxRateOverride" DOUBLE PRECISION,
    "useManualTaxRate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTaxConfig_pkey" PRIMARY KEY ("id")
);

-- Create unique indexes
CREATE UNIQUE INDEX "ProjectRegionalFactors_projectId_key" ON "ProjectRegionalFactors"("projectId");
CREATE UNIQUE INDEX "ProjectCategoryAdjustment_regionalFactorsId_categoryCode_activity_key" ON "ProjectCategoryAdjustment"("regionalFactorsId", "categoryCode", "activity");
CREATE UNIQUE INDEX "ProjectTaxConfig_projectId_key" ON "ProjectTaxConfig"("projectId");

-- Create indexes for performance
CREATE INDEX "ProjectRegionalFactors_projectId_idx" ON "ProjectRegionalFactors"("projectId");
CREATE INDEX "ProjectRegionalFactors_estimateVersionId_idx" ON "ProjectRegionalFactors"("estimateVersionId");
CREATE INDEX "ProjectCategoryAdjustment_regionalFactorsId_idx" ON "ProjectCategoryAdjustment"("regionalFactorsId");
CREATE INDEX "ProjectTaxConfig_projectId_idx" ON "ProjectTaxConfig"("projectId");
CREATE INDEX "ProjectTaxConfig_companyId_idx" ON "ProjectTaxConfig"("companyId");

-- Add index to RawXactRow for better matching performance
CREATE INDEX "RawXactRow_estimate_cat_sel_idx" ON "RawXactRow"("estimateVersionId", "cat", "sel");

-- Add foreign keys
ALTER TABLE "ProjectRegionalFactors" ADD CONSTRAINT "ProjectRegionalFactors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectRegionalFactors" ADD CONSTRAINT "ProjectRegionalFactors_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectCategoryAdjustment" ADD CONSTRAINT "ProjectCategoryAdjustment_regionalFactorsId_fkey" FOREIGN KEY ("regionalFactorsId") REFERENCES "ProjectRegionalFactors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTaxConfig" ADD CONSTRAINT "ProjectTaxConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTaxConfig" ADD CONSTRAINT "ProjectTaxConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
