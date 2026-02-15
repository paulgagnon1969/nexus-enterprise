-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ReceiptOcrResult" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT,
    "billId" TEXT,
    "projectFileId" TEXT NOT NULL,
    "status" "OcrStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "vendorName" TEXT,
    "vendorAddress" TEXT,
    "receiptDate" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2),
    "taxAmount" DECIMAL(12,2),
    "totalAmount" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'USD',
    "paymentMethod" TEXT,
    "lineItemsJson" TEXT,
    "rawResponseJson" TEXT,
    "confidence" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptOcrResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptOcrResult_dailyLogId_key" ON "ReceiptOcrResult"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptOcrResult_billId_key" ON "ReceiptOcrResult"("billId");

-- CreateIndex
CREATE INDEX "ReceiptOcrResult_status_idx" ON "ReceiptOcrResult"("status");

-- CreateIndex
CREATE INDEX "ReceiptOcrResult_project_file_idx" ON "ReceiptOcrResult"("projectFileId");

-- AddForeignKey
ALTER TABLE "ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
