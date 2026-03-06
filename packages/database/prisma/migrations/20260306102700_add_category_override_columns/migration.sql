-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('ORIGINAL', 'TENTATIVE', 'VERIFIED');

-- AlterTable: BankTransaction — add category override columns
ALTER TABLE "BankTransaction" ADD COLUMN "categoryOverride" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN "categoryStatus" "CategoryStatus" NOT NULL DEFAULT 'ORIGINAL';
ALTER TABLE "BankTransaction" ADD COLUMN "categoryOverrideByUserId" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN "categoryOverrideAt" TIMESTAMP(3);

-- AlterTable: ImportedTransaction — add category override columns
ALTER TABLE "ImportedTransaction" ADD COLUMN "categoryOverride" TEXT;
ALTER TABLE "ImportedTransaction" ADD COLUMN "categoryStatus" "CategoryStatus" NOT NULL DEFAULT 'ORIGINAL';
ALTER TABLE "ImportedTransaction" ADD COLUMN "categoryOverrideByUserId" TEXT;
ALTER TABLE "ImportedTransaction" ADD COLUMN "categoryOverrideAt" TIMESTAMP(3);

-- CreateTable: MerchantCategoryRule
CREATE TABLE "MerchantCategoryRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "fromCategory" TEXT NOT NULL,
    "toCategory" TEXT NOT NULL,
    "ruleCount" INTEGER NOT NULL DEFAULT 1,
    "lastAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CategoryOverrideLog
CREATE TABLE "CategoryOverrideLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionSource" TEXT NOT NULL,
    "previousCategory" TEXT,
    "newCategory" TEXT NOT NULL,
    "previousStatus" "CategoryStatus" NOT NULL,
    "newStatus" "CategoryStatus" NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryOverrideLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCategoryRule_company_merchant_from_key" ON "MerchantCategoryRule"("companyId", "merchantKey", "fromCategory");
CREATE INDEX "MerchantCategoryRule_company_merchant_idx" ON "MerchantCategoryRule"("companyId", "merchantKey");

-- CreateIndex
CREATE INDEX "CategoryOverrideLog_company_txn_idx" ON "CategoryOverrideLog"("companyId", "transactionId");
CREATE INDEX "CategoryOverrideLog_company_date_idx" ON "CategoryOverrideLog"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantCategoryRule" ADD CONSTRAINT "MerchantCategoryRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryOverrideLog" ADD CONSTRAINT "CategoryOverrideLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategoryOverrideLog" ADD CONSTRAINT "CategoryOverrideLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
