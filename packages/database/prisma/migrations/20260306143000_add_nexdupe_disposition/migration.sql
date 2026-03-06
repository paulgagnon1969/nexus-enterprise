-- CreateEnum
CREATE TYPE "DupEDecision" AS ENUM ('NOT_DUPLICATE', 'CONFIRMED_DUPLICATE', 'SAME_VENDOR_DIFFERENT_PURCHASE', 'INTENTIONAL_SPLIT');

-- AlterEnum
ALTER TYPE "BillRole" ADD VALUE 'SIBE';

-- CreateTable
CREATE TABLE "DuplicateExpenseDisposition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "decision" "DupEDecision" NOT NULL,
    "note" TEXT NOT NULL,
    "billIds" TEXT NOT NULL,
    "billDataSnapshot" TEXT,
    "snapshotImageUri" TEXT,
    "primaryBillId" TEXT,
    "sibeBillId" TEXT,
    "dispositionedByUserId" TEXT,
    "dispositionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateExpenseDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DuplicateExpenseDisposition_company_date_idx" ON "DuplicateExpenseDisposition"("companyId", "dispositionedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateExpenseDisposition_company_group_key" ON "DuplicateExpenseDisposition"("companyId", "groupId");

-- AddForeignKey
ALTER TABLE "DuplicateExpenseDisposition" ADD CONSTRAINT "DuplicateExpenseDisposition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateExpenseDisposition" ADD CONSTRAINT "DuplicateExpenseDisposition_dispositionedByUserId_fkey" FOREIGN KEY ("dispositionedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
