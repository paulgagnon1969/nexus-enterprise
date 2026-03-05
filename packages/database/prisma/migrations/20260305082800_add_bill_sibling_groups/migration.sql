-- CreateEnum
CREATE TYPE "BillRole" AS ENUM ('PRIMARY', 'VERIFICATION');

-- CreateEnum
CREATE TYPE "BillVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED');

-- AlterEnum: Add DUPLICATE_OFFSET to ProjectBillLineItemKind
ALTER TYPE "ProjectBillLineItemKind" ADD VALUE IF NOT EXISTS 'DUPLICATE_OFFSET';

-- AlterTable: Add billRole and siblingGroupId to ProjectBill
ALTER TABLE "ProjectBill" ADD COLUMN "billRole" "BillRole" NOT NULL DEFAULT 'PRIMARY';
ALTER TABLE "ProjectBill" ADD COLUMN "siblingGroupId" TEXT;

-- CreateTable
CREATE TABLE "BillSiblingGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "primaryBillId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchReason" TEXT,
    "verificationStatus" "BillVerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "amountVariance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillSiblingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillSiblingGroup_company_project_idx" ON "BillSiblingGroup"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "BillSiblingGroup_company_status_idx" ON "BillSiblingGroup"("companyId", "verificationStatus");

-- CreateIndex
CREATE INDEX "ProjectBill_sibling_group_idx" ON "ProjectBill"("siblingGroupId");

-- AddForeignKey
ALTER TABLE "ProjectBill" ADD CONSTRAINT "ProjectBill_siblingGroupId_fkey" FOREIGN KEY ("siblingGroupId") REFERENCES "BillSiblingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSiblingGroup" ADD CONSTRAINT "BillSiblingGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillSiblingGroup" ADD CONSTRAINT "BillSiblingGroup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
