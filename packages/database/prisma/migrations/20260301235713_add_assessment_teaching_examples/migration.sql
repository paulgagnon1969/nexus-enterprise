-- AlterTable
ALTER TABLE "VideoAssessmentFinding" ADD COLUMN     "originalValuesJson" JSONB;

-- CreateTable
CREATE TABLE "AssessmentTeachingExample" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "cropBox" JSONB,
    "croppedImageUri" TEXT,
    "fullFrameUri" TEXT,
    "userHint" TEXT NOT NULL,
    "assessmentType" TEXT NOT NULL DEFAULT 'TARGETED',
    "aiRefinedFinding" JSONB,
    "aiRawResponse" TEXT,
    "webSourcesUsed" JSONB,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "userCorrectionJson" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentTeachingExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssessmentTeaching_company_confirmed_idx" ON "AssessmentTeachingExample"("companyId", "confirmed");

-- CreateIndex
CREATE INDEX "AssessmentTeaching_assessment_idx" ON "AssessmentTeachingExample"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentTeaching_company_type_idx" ON "AssessmentTeachingExample"("companyId", "assessmentType");

-- CreateIndex
CREATE INDEX "VideoAssessmentFinding_company_overridden_idx" ON "VideoAssessmentFinding"("companyId", "overriddenAt");

-- AddForeignKey
ALTER TABLE "AssessmentTeachingExample" ADD CONSTRAINT "AssessmentTeachingExample_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTeachingExample" ADD CONSTRAINT "AssessmentTeachingExample_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "VideoAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTeachingExample" ADD CONSTRAINT "AssessmentTeachingExample_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
