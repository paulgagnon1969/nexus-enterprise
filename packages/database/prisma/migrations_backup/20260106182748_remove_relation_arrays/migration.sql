-- CreateEnum
CREATE TYPE "CandidateVisibilityScope" AS ENUM ('TENANT_ONLY', 'GLOBAL_POOL', 'PRIVATE_TEST');

-- CreateEnum
CREATE TYPE "CandidateTrainingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidateTrainingAttemptStatus" AS ENUM ('PASSED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CandidateCertificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VALID', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CandidateInterestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'HIRED');

-- DropForeignKey
ALTER TABLE "CompanyPriceList" DROP CONSTRAINT "CompanyPriceList_company_fkey";

-- DropForeignKey
ALTER TABLE "CompanyPriceListItem" DROP CONSTRAINT "CompanyPriceListItem_companyPriceList_fkey";

-- AlterTable
ALTER TABLE "NexNetCandidate" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeletedSoft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHiddenFromDefaultViews" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibilityScope" "CandidateVisibilityScope" NOT NULL DEFAULT 'TENANT_ONLY';

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequiredDefault" BOOLEAN NOT NULL DEFAULT false,
    "externalLmsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificationType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "issuingAuthority" TEXT,
    "defaultValidityMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequiredDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateTrainingAssignment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "trainingModuleId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CandidateTrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateTrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateTrainingAttempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "CandidateTrainingAttemptStatus" NOT NULL,
    "score" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateTrainingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateCertification" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "certificationTypeId" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "issuedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "CandidateCertificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateCertificationDocument" (
    "id" TEXT NOT NULL,
    "candidateCertificationId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "uploadedByUserId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "CandidateCertificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateMarketProfile" (
    "candidateId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "headline" TEXT,
    "skillsSummary" TEXT,
    "credentialsSummary" TEXT,
    "locationRegion" TEXT,
    "ratingNumeric" DOUBLE PRECISION,
    "ratingLabel" TEXT,
    "rateMin" DOUBLE PRECISION,
    "rateMax" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateMarketProfile_pkey" PRIMARY KEY ("candidateId")
);

-- CreateTable
CREATE TABLE "CandidatePoolVisibility" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "visibleToCompanyId" TEXT,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "CandidatePoolVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateInterest" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "requestingCompanyId" TEXT NOT NULL,
    "status" "CandidateInterestStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "handledByUserId" TEXT,

    CONSTRAINT "CandidateInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingModule_companyId_code_key" ON "TrainingModule"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CertificationType_companyId_code_key" ON "CertificationType"("companyId", "code");

-- CreateIndex
CREATE INDEX "CandidateTrainingAssignment_candidate_idx" ON "CandidateTrainingAssignment"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateTrainingAssignment_training_idx" ON "CandidateTrainingAssignment"("trainingModuleId");

-- CreateIndex
CREATE INDEX "CandidateTrainingAttempt_assignment_idx" ON "CandidateTrainingAttempt"("assignmentId");

-- CreateIndex
CREATE INDEX "CandidateCertification_candidate_idx" ON "CandidateCertification"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateCertification_type_idx" ON "CandidateCertification"("certificationTypeId");

-- CreateIndex
CREATE INDEX "CandidateCertDocument_cert_idx" ON "CandidateCertificationDocument"("candidateCertificationId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateMarketProfile_publicId_key" ON "CandidateMarketProfile"("publicId");

-- CreateIndex
CREATE INDEX "CandidatePoolVisibility_candidate_idx" ON "CandidatePoolVisibility"("candidateId");

-- CreateIndex
CREATE INDEX "CandidatePoolVisibility_visible_company_idx" ON "CandidatePoolVisibility"("visibleToCompanyId");

-- CreateIndex
CREATE INDEX "CandidateInterest_candidate_idx" ON "CandidateInterest"("candidateId");

-- CreateIndex
CREATE INDEX "CandidateInterest_requesting_company_idx" ON "CandidateInterest"("requestingCompanyId");

-- RenameForeignKey
ALTER TABLE "CompanyPriceList" RENAME CONSTRAINT "CompanyPriceList_basePriceList_fkey" TO "CompanyPriceList_basePriceListId_fkey";

-- RenameForeignKey
ALTER TABLE "CompanyPriceListItem" RENAME CONSTRAINT "CompanyPriceListItem_priceListItem_fkey" TO "CompanyPriceListItem_priceListItemId_fkey";

-- AddForeignKey
ALTER TABLE "CompanyPriceList" ADD CONSTRAINT "CompanyPriceList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_companyPriceListId_fkey" FOREIGN KEY ("companyPriceListId") REFERENCES "CompanyPriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "CompanyPriceList_company_active_rev_idx" RENAME TO "CompanyPriceList_companyId_isActive_revision_idx";

-- RenameIndex
ALTER INDEX "CompanyPriceListItem_company_cat_sel_idx" RENAME TO "CompanyPriceListItem_companyPriceListId_cat_sel_idx";

-- RenameIndex
ALTER INDEX "CompanyPriceListItem_company_hash_idx" RENAME TO "CompanyPriceListItem_companyPriceListId_canonicalKeyHash_idx";
