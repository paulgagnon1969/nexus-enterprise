-- CreateTable: SkillCategory
CREATE TABLE "SkillCategory" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SkillDefinition
CREATE TABLE "SkillDefinition" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "SkillDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserSkillRating
CREATE TABLE "UserSkillRating" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "selfLevel" INTEGER NOT NULL,
  "selfLevelLabel" TEXT,
  "yearsExperience" INTEGER,
  "notes" TEXT,
  "employerAvgLevel" DOUBLE PRECISION,
  "employerRatingCount" INTEGER,
  "adminOverrideLevel" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OnboardingSkillRating
CREATE TABLE "OnboardingSkillRating" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OnboardingSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployerSkillRating
CREATE TABLE "EmployerSkillRating" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "ratedByUserId" TEXT,
  "level" INTEGER NOT NULL,
  "levelLabel" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployerSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateEnum: ReputationSubjectType
CREATE TYPE "ReputationSubjectType" AS ENUM ('USER', 'COMPANY');

-- CreateEnum: ReputationSourceType
CREATE TYPE "ReputationSourceType" AS ENUM (
  'EMPLOYER_ON_WORKER',
  'WORKER_ON_EMPLOYER',
  'CLIENT_ON_COMPANY',
  'COMPANY_ON_CLIENT',
  'MODERATOR_ADJUSTMENT'
);

-- CreateEnum: ReputationDimension
CREATE TYPE "ReputationDimension" AS ENUM ('OVERALL', 'SAFETY', 'PAYMENT', 'COMMUNICATION', 'QUALITY');

-- CreateEnum: ReputationModerationStatus
CREATE TYPE "ReputationModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable: ReputationRating
CREATE TABLE "ReputationRating" (
  "id" TEXT NOT NULL,
  "subjectType" "ReputationSubjectType" NOT NULL,
  "subjectUserId" TEXT,
  "subjectCompanyId" TEXT,
  "raterUserId" TEXT,
  "raterCompanyId" TEXT,
  "sourceType" "ReputationSourceType" NOT NULL,
  "dimension" "ReputationDimension" NOT NULL DEFAULT 'OVERALL',
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "moderationStatus" "ReputationModerationStatus" NOT NULL DEFAULT 'PENDING',
  "moderatedByUserId" TEXT,
  "moderatedAt" TIMESTAMP(3),
  "moderatorNote" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReputationRating_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "SkillCategory_code_key" ON "SkillCategory"("code");
CREATE UNIQUE INDEX "SkillDefinition_code_key" ON "SkillDefinition"("code");
CREATE UNIQUE INDEX "UserSkillRating_user_skill_key" ON "UserSkillRating"("userId", "skillId");
CREATE INDEX "EmployerSkillRating_user_skill_idx" ON "EmployerSkillRating"("userId", "skillId");
CREATE INDEX "EmployerSkillRating_company_idx" ON "EmployerSkillRating"("companyId");
CREATE INDEX "ReputationRating_subject_user_idx" ON "ReputationRating"("subjectUserId");
CREATE INDEX "ReputationRating_subject_company_idx" ON "ReputationRating"("subjectCompanyId");

-- Foreign keys for skill tables (loose coupling; can be relaxed later if needed)
ALTER TABLE "SkillDefinition" ADD CONSTRAINT "SkillDefinition_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSkillRating" ADD CONSTRAINT "UserSkillRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSkillRating" ADD CONSTRAINT "UserSkillRating_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnboardingSkillRating" ADD CONSTRAINT "OnboardingSkillRating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingSkillRating" ADD CONSTRAINT "OnboardingSkillRating_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployerSkillRating" ADD CONSTRAINT "EmployerSkillRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployerSkillRating" ADD CONSTRAINT "EmployerSkillRating_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployerSkillRating" ADD CONSTRAINT "EmployerSkillRating_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "SkillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- (Optional) Foreign keys for ReputationRating can be added later if desired.

-- Add aggregate reputation fields to User and Company with default 2-star baseline
ALTER TABLE "User" ADD COLUMN "reputationOverallAvg" DOUBLE PRECISION NOT NULL DEFAULT 2;
ALTER TABLE "User" ADD COLUMN "reputationOverallCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "reputationOverallOverride" INTEGER;

ALTER TABLE "Company" ADD COLUMN "reputationOverallAvg" DOUBLE PRECISION NOT NULL DEFAULT 2;
ALTER TABLE "Company" ADD COLUMN "reputationOverallCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "reputationOverallOverride" INTEGER;
