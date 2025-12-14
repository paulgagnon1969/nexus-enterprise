-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OnboardingDocumentType" AS ENUM ('PHOTO', 'GOV_ID', 'OTHER');

-- CreateTable: OnboardingSession
CREATE TABLE "OnboardingSession" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "checklistJson" TEXT,
  "assignedHiringManagerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OnboardingProfile
CREATE TABLE "OnboardingProfile" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "phone" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "country" TEXT,

  CONSTRAINT "OnboardingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OnboardingDocument
CREATE TABLE "OnboardingDocument" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "type" "OnboardingDocumentType" NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OnboardingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OnboardingBankInfo (placeholder for masked/secure details)
CREATE TABLE "OnboardingBankInfo" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "accountHolderName" TEXT,
  "routingNumberMasked" TEXT,
  "accountNumberMasked" TEXT,
  "bankName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OnboardingBankInfo_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "OnboardingSession_token_key" ON "OnboardingSession"("token");
CREATE INDEX "OnboardingSession_company_status_idx" ON "OnboardingSession"("companyId", "status");
CREATE INDEX "OnboardingProfile_session_idx" ON "OnboardingProfile"("sessionId");
CREATE INDEX "OnboardingDocument_session_idx" ON "OnboardingDocument"("sessionId");
CREATE INDEX "OnboardingBankInfo_session_idx" ON "OnboardingBankInfo"("sessionId");

-- Foreign keys
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingSession" ADD CONSTRAINT "OnboardingSession_assignedHiringManagerId_fkey" FOREIGN KEY ("assignedHiringManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnboardingProfile" ADD CONSTRAINT "OnboardingProfile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingDocument" ADD CONSTRAINT "OnboardingDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingBankInfo" ADD CONSTRAINT "OnboardingBankInfo_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OnboardingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
