-- CreateEnum
CREATE TYPE "FingerprintConfidence" AS ENUM ('VERIFIED', 'BANK_CONFIRMED', 'RECEIPT', 'HD_PRO_XTRA', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FingerprintSource" AS ENUM ('RECEIPT_OCR', 'HD_PRO_XTRA', 'CBA_SCRAPE', 'BANK_CONFIRM', 'MANUAL');

-- CreateTable
CREATE TABLE "ProductFingerprint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "coverageValue" DOUBLE PRECISION,
    "coverageUnit" TEXT,
    "purchaseUnitLabel" TEXT,
    "packCount" INTEGER,
    "confidence" "FingerprintConfidence" NOT NULL DEFAULT 'LOW',
    "sourceType" "FingerprintSource" NOT NULL DEFAULT 'CBA_SCRAPE',
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "fingerprintId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "source" "FingerprintSource" NOT NULL,
    "transactionDate" TIMESTAMP(3),
    "receiptOcrResultId" TEXT,
    "importedTransactionId" TEXT,
    "bankTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageExtractionLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "requestedUnit" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "extractedValue" DOUBLE PRECISION,
    "confidence" TEXT,
    "fingerprintHit" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageExtractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductFingerprint_company_sku_idx" ON "ProductFingerprint"("companyId", "sku");

-- CreateIndex
CREATE INDEX "ProductFingerprint_company_supplier_idx" ON "ProductFingerprint"("companyId", "supplierKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFingerprint_companyId_supplierKey_productId_key" ON "ProductFingerprint"("companyId", "supplierKey", "productId");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_fp_created_idx" ON "ProductPriceHistory"("fingerprintId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_fp_txnDate_idx" ON "ProductPriceHistory"("fingerprintId", "transactionDate");

-- CreateIndex
CREATE INDEX "CoverageExtractionLog_company_created_idx" ON "CoverageExtractionLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CoverageExtractionLog_company_hit_idx" ON "CoverageExtractionLog"("companyId", "fingerprintHit");

-- AddForeignKey
ALTER TABLE "ProductFingerprint" ADD CONSTRAINT "ProductFingerprint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_fingerprintId_fkey" FOREIGN KEY ("fingerprintId") REFERENCES "ProductFingerprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageExtractionLog" ADD CONSTRAINT "CoverageExtractionLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
