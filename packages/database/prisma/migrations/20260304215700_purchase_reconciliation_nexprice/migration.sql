-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNLINKED', 'SUGGESTED', 'LINKED', 'PM_REVIEW', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ExpenseClassification" AS ENUM ('PROJECT_MATERIAL', 'ENTERTAINMENT', 'PERSONAL', 'FUEL', 'TOOL_EQUIPMENT', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "DispositionType" AS ENUM ('KEEP_ON_JOB', 'CREDIT_PERSONAL', 'MOVE_TO_PROJECT');

-- CreateEnum
CREATE TYPE "CcPaymentLinkStatus" AS ENUM ('SUGGESTED', 'LINKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PmReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "PmReviewTransactionType" AS ENUM ('IMPORTED', 'BANK', 'RECEIPT_LINE');

-- CreateEnum
CREATE TYPE "RegionType" AS ENUM ('ZIP3', 'METRO', 'STATE', 'COUNTRY');

-- CreateEnum
CREATE TYPE "NexPriceConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "CompanyPriceListItem" ADD COLUMN     "globalPriceListItemId" TEXT,
ADD COLUMN     "localizedPrice" DOUBLE PRECISION,
ADD COLUMN     "regionZip" TEXT,
ADD COLUMN     "sku" TEXT;

-- AlterTable
ALTER TABLE "ImportedTransaction" ADD COLUMN     "expenseClassification" "ExpenseClassification" NOT NULL DEFAULT 'UNCLASSIFIED',
ADD COLUMN     "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'UNLINKED';

-- AlterTable
ALTER TABLE "PriceListItem" ADD COLUMN     "contributorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenPrice" DOUBLE PRECISION,
ADD COLUMN     "normalizedPrice" DOUBLE PRECISION,
ADD COLUMN     "priceObservationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "regionZip" TEXT,
ADD COLUMN     "sku" TEXT;

-- CreateTable
CREATE TABLE "CreditCardPaymentLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "checkingTxnId" TEXT NOT NULL,
    "creditCardTxnId" TEXT NOT NULL,
    "status" "CcPaymentLinkStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confidence" DOUBLE PRECISION,
    "linkedByUserId" TEXT,
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardPaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLineDisposition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "ocrResultId" TEXT NOT NULL,
    "lineItemIndex" INTEGER NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION,
    "sourceProjectId" TEXT NOT NULL,
    "dispositionType" "DispositionType" NOT NULL,
    "targetProjectId" TEXT,
    "creditReason" TEXT,
    "dispositionedByUserId" TEXT,
    "dispositionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptLineDisposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PmReviewItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "transactionType" "PmReviewTransactionType" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "assignedToUserId" TEXT NOT NULL,
    "status" "PmReviewStatus" NOT NULL DEFAULT 'PENDING',
    "suggestedAmount" DOUBLE PRECISION,
    "suggestedProjectId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PmReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionalCostIndex" (
    "id" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "regionName" TEXT NOT NULL,
    "regionType" "RegionType" NOT NULL,
    "costIndex" DOUBLE PRECISION NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "source" TEXT,
    "effectiveYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegionalCostIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HdStoreLocation" (
    "id" TEXT NOT NULL,
    "storeNumber" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HdStoreLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCardPaymentLink_company_checking_idx" ON "CreditCardPaymentLink"("companyId", "checkingTxnId");

-- CreateIndex
CREATE INDEX "CreditCardPaymentLink_company_status_idx" ON "CreditCardPaymentLink"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardPaymentLink_companyId_creditCardTxnId_key" ON "CreditCardPaymentLink"("companyId", "creditCardTxnId");

-- CreateIndex
CREATE INDEX "ReceiptLineDisposition_company_dailyLog_idx" ON "ReceiptLineDisposition"("companyId", "dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptLineDisposition_ocrResultId_lineItemIndex_key" ON "ReceiptLineDisposition"("ocrResultId", "lineItemIndex");

-- CreateIndex
CREATE INDEX "PmReviewItem_company_project_status_idx" ON "PmReviewItem"("companyId", "projectId", "status");

-- CreateIndex
CREATE INDEX "PmReviewItem_assignee_status_idx" ON "PmReviewItem"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "RegionalCostIndex_type_code_idx" ON "RegionalCostIndex"("regionType", "regionCode");

-- CreateIndex
CREATE UNIQUE INDEX "RegionalCostIndex_regionCode_effectiveYear_key" ON "RegionalCostIndex"("regionCode", "effectiveYear");

-- CreateIndex
CREATE UNIQUE INDEX "HdStoreLocation_storeNumber_key" ON "HdStoreLocation"("storeNumber");

-- CreateIndex
CREATE INDEX "HdStoreLocation_zip_idx" ON "HdStoreLocation"("zip");

-- CreateIndex
CREATE INDEX "CompanyPriceListItem_priceList_sku_idx" ON "CompanyPriceListItem"("companyPriceListId", "sku");

-- CreateIndex
CREATE INDEX "CompanyPriceListItem_globalBackLink_idx" ON "CompanyPriceListItem"("globalPriceListItemId");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_reconStatus_idx" ON "ImportedTransaction"("companyId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_expenseClass_idx" ON "ImportedTransaction"("companyId", "expenseClassification");

-- CreateIndex
CREATE INDEX "PriceListItem_priceList_sku_vendor_idx" ON "PriceListItem"("priceListId", "sku", "sourceVendor");

-- AddForeignKey
ALTER TABLE "CompanyPriceListItem" ADD CONSTRAINT "CompanyPriceListItem_globalPriceListItemId_fkey" FOREIGN KEY ("globalPriceListItemId") REFERENCES "PriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentLink" ADD CONSTRAINT "CreditCardPaymentLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentLink" ADD CONSTRAINT "CreditCardPaymentLink_checkingTxnId_fkey" FOREIGN KEY ("checkingTxnId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentLink" ADD CONSTRAINT "CreditCardPaymentLink_creditCardTxnId_fkey" FOREIGN KEY ("creditCardTxnId") REFERENCES "ImportedTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardPaymentLink" ADD CONSTRAINT "CreditCardPaymentLink_linkedByUserId_fkey" FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineDisposition" ADD CONSTRAINT "ReceiptLineDisposition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineDisposition" ADD CONSTRAINT "ReceiptLineDisposition_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineDisposition" ADD CONSTRAINT "ReceiptLineDisposition_ocrResultId_fkey" FOREIGN KEY ("ocrResultId") REFERENCES "ReceiptOcrResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineDisposition" ADD CONSTRAINT "ReceiptLineDisposition_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineDisposition" ADD CONSTRAINT "ReceiptLineDisposition_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLineDisposition" ADD CONSTRAINT "ReceiptLineDisposition_dispositionedByUserId_fkey" FOREIGN KEY ("dispositionedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmReviewItem" ADD CONSTRAINT "PmReviewItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmReviewItem" ADD CONSTRAINT "PmReviewItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmReviewItem" ADD CONSTRAINT "PmReviewItem_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PmReviewItem" ADD CONSTRAINT "PmReviewItem_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

