-- AlterTable
ALTER TABLE "OnboardingSession" ADD COLUMN     "detailStatusCode" TEXT;

-- CreateTable
CREATE TABLE "CandidateStatusDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CandidateStatusDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CandidateStatusDefinition_companyId_code_key" ON "CandidateStatusDefinition"("companyId", "code");

-- CreateIndex
CREATE INDEX "OnboardingSession_company_detail_status_idx" ON "OnboardingSession"("companyId", "detailStatusCode");
