-- CreateEnum
CREATE TYPE "CsvImportSource" AS ENUM ('HD_PRO_XTRA', 'CHASE_BANK', 'APPLE_CARD');

-- CreateTable
CREATE TABLE "CsvImportBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "CsvImportSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateRangeStart" DATE,
    "dateRangeEnd" DATE,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsvImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" "CsvImportSource" NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "merchant" TEXT,
    "jobNameRaw" TEXT,
    "jobName" TEXT,
    "sku" TEXT,
    "department" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "purchaser" TEXT,
    "qty" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION,
    "postingDate" DATE,
    "txnType" TEXT,
    "runningBalance" DOUBLE PRECISION,
    "checkOrSlip" TEXT,
    "clearingDate" DATE,
    "cardCategory" TEXT,
    "cardHolder" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CsvImportBatch_company_idx" ON "CsvImportBatch"("companyId");

-- CreateIndex
CREATE INDEX "CsvImportBatch_company_source_idx" ON "CsvImportBatch"("companyId", "source");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_date_idx" ON "ImportedTransaction"("companyId", "date");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_source_idx" ON "ImportedTransaction"("companyId", "source");

-- CreateIndex
CREATE INDEX "ImportedTransaction_batch_idx" ON "ImportedTransaction"("batchId");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_jobName_idx" ON "ImportedTransaction"("companyId", "jobName");

-- CreateIndex
CREATE INDEX "ImportedTransaction_company_merchant_idx" ON "ImportedTransaction"("companyId", "merchant");

-- AddForeignKey
ALTER TABLE "CsvImportBatch" ADD CONSTRAINT "CsvImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsvImportBatch" ADD CONSTRAINT "CsvImportBatch_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CsvImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedTransaction" ADD CONSTRAINT "ImportedTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
