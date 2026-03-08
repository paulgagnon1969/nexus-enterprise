-- AlterTable
ALTER TABLE "VideoAssessmentFinding" ADD COLUMN     "measuredConfidence" DOUBLE PRECISION,
ADD COLUMN     "measuredQuantity" DOUBLE PRECISION,
ADD COLUMN     "measuredUnit" TEXT,
ADD COLUMN     "measurementMethod" TEXT,
ADD COLUMN     "measurementMs" INTEGER,
ADD COLUMN     "meshAnalysisJson" JSONB;
