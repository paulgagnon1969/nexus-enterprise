-- CreateEnum
CREATE TYPE "VideoAssessmentSourceType" AS ENUM ('DRONE', 'HANDHELD', 'OTHER');

-- CreateEnum
CREATE TYPE "VideoAssessmentStatus" AS ENUM ('PROCESSING', 'COMPLETE', 'FAILED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "FindingZone" AS ENUM ('ROOF', 'SIDING', 'WINDOWS', 'GUTTERS', 'FASCIA_SOFFIT', 'FOUNDATION', 'DECK_PATIO', 'FENCING', 'LANDSCAPING', 'INTERIOR_WALLS', 'INTERIOR_CEILING', 'INTERIOR_FLOOR', 'INTERIOR_CABINETS', 'INTERIOR_FIXTURES', 'PLUMBING', 'ELECTRICAL', 'HVAC', 'OTHER');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('MISSING_SHINGLES', 'CURLING', 'GRANULE_LOSS', 'HAIL_IMPACT', 'WIND_LIFT', 'ALGAE_MOSS', 'FLASHING', 'RIDGE_CAP', 'VALLEY', 'UNDERLAYMENT', 'DRAINAGE', 'CRACKING', 'PEELING', 'ROT', 'WATER_STAIN', 'MOLD', 'WARPING', 'BROKEN_SEAL', 'MISSING_CAULK', 'STRUCTURAL_SHIFT', 'CORROSION', 'INSECT_DAMAGE', 'EFFLORESCENCE', 'SPALLING', 'OTHER');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MODERATE', 'SEVERE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingCausation" AS ENUM ('HAIL', 'WIND', 'AGE', 'WATER', 'FIRE', 'IMPACT', 'THERMAL', 'IMPROPER_INSTALL', 'SETTLING', 'PEST', 'UNKNOWN');

-- CreateTable
CREATE TABLE "VideoAssessment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "sourceType" "VideoAssessmentSourceType" NOT NULL DEFAULT 'OTHER',
    "status" "VideoAssessmentStatus" NOT NULL DEFAULT 'PROCESSING',
    "videoFileName" TEXT,
    "videoDurationSecs" INTEGER,
    "videoResolution" TEXT,
    "frameCount" INTEGER,
    "thumbnailUrls" JSONB,
    "assessmentJson" JSONB,
    "rawAiResponse" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "weatherContext" TEXT,
    "captureDate" TIMESTAMP(3),
    "errorMessage" TEXT,
    "notes" TEXT,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoAssessmentFinding" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "zone" "FindingZone" NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "causation" "FindingCausation" NOT NULL DEFAULT 'UNKNOWN',
    "description" TEXT,
    "frameTimestamp" DOUBLE PRECISION,
    "thumbnailUrl" TEXT,
    "boundingBoxJson" JSONB,
    "costbookItemCode" TEXT,
    "estimatedQuantity" DOUBLE PRECISION,
    "estimatedUnit" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "overriddenByUserId" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoAssessmentFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoAssessment_company_status_idx" ON "VideoAssessment"("companyId", "status");

-- CreateIndex
CREATE INDEX "VideoAssessment_company_project_idx" ON "VideoAssessment"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "VideoAssessment_company_created_idx" ON "VideoAssessment"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoAssessmentFinding_assessment_idx" ON "VideoAssessmentFinding"("assessmentId");

-- CreateIndex
CREATE INDEX "VideoAssessmentFinding_company_zone_idx" ON "VideoAssessmentFinding"("companyId", "zone");

-- CreateIndex
CREATE INDEX "VideoAssessmentFinding_company_category_idx" ON "VideoAssessmentFinding"("companyId", "category");

-- AddForeignKey
ALTER TABLE "VideoAssessment" ADD CONSTRAINT "VideoAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessment" ADD CONSTRAINT "VideoAssessment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessment" ADD CONSTRAINT "VideoAssessment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessment" ADD CONSTRAINT "VideoAssessment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessmentFinding" ADD CONSTRAINT "VideoAssessmentFinding_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "VideoAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessmentFinding" ADD CONSTRAINT "VideoAssessmentFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoAssessmentFinding" ADD CONSTRAINT "VideoAssessmentFinding_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
