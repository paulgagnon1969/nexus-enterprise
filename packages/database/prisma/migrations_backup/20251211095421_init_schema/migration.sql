-- DropForeignKey
ALTER TABLE "EmployerSkillRating" DROP CONSTRAINT "EmployerSkillRating_companyId_fkey";

-- DropForeignKey
ALTER TABLE "EmployerSkillRating" DROP CONSTRAINT "EmployerSkillRating_skillId_fkey";

-- DropForeignKey
ALTER TABLE "EmployerSkillRating" DROP CONSTRAINT "EmployerSkillRating_userId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingBankInfo" DROP CONSTRAINT "OnboardingBankInfo_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingDocument" DROP CONSTRAINT "OnboardingDocument_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingProfile" DROP CONSTRAINT "OnboardingProfile_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingSession" DROP CONSTRAINT "OnboardingSession_assignedHiringManagerId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingSession" DROP CONSTRAINT "OnboardingSession_companyId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingSkillRating" DROP CONSTRAINT "OnboardingSkillRating_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "OnboardingSkillRating" DROP CONSTRAINT "OnboardingSkillRating_skillId_fkey";

-- DropForeignKey
ALTER TABLE "SkillDefinition" DROP CONSTRAINT "SkillDefinition_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "UserSkillRating" DROP CONSTRAINT "UserSkillRating_skillId_fkey";

-- DropForeignKey
ALTER TABLE "UserSkillRating" DROP CONSTRAINT "UserSkillRating_userId_fkey";

-- DropIndex
DROP INDEX "OnboardingBankInfo_session_idx";

-- DropIndex
DROP INDEX "OnboardingDocument_session_idx";

-- DropIndex
DROP INDEX "OnboardingProfile_session_idx";

-- DropIndex
DROP INDEX "OnboardingSession_company_status_idx";

-- RenameIndex
ALTER INDEX "UserSkillRating_user_skill_key" RENAME TO "UserSkillRating_userId_skillId_key";
