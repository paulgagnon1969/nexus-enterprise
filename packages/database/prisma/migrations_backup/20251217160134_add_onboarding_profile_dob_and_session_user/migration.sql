-- DropForeignKey
ALTER TABLE "ImportJob" DROP CONSTRAINT "ImportJob_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ImportJob" DROP CONSTRAINT "ImportJob_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectFinancialSnapshot" DROP CONSTRAINT "ProjectFinancialSnapshot_estimateVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectFinancialSnapshot" DROP CONSTRAINT "ProjectFinancialSnapshot_projectId_fkey";

-- AlterTable
ALTER TABLE "ClientSkillRating" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OnboardingProfile" ADD COLUMN     "dob" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OnboardingSession" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "ProjectFinancialSnapshot" ALTER COLUMN "snapshotDate" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "computedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserSkillSuggestion" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OnboardingDocument_session_idx" ON "OnboardingDocument"("sessionId");

-- CreateIndex
CREATE INDEX "OnboardingSession_company_created_idx" ON "OnboardingSession"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingSession_user_idx" ON "OnboardingSession"("userId");

-- AddForeignKey
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProfile" ADD CONSTRAINT "OnboardingProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingBankInfo" ADD CONSTRAINT "OnboardingBankInfo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingSkillRating" ADD CONSTRAINT "OnboardingSkillRating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OnboardingSkillRating_session_skill_key" RENAME TO "OnboardingSkillRating_sessionId_skillId_key";
