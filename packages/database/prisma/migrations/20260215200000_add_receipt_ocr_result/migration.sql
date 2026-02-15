-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "ReceiptOcrResult" (
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

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "ReceiptOcrResult_dailyLogId_key" ON "ReceiptOcrResult"("dailyLogId");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "ReceiptOcrResult_billId_key" ON "ReceiptOcrResult"("billId");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ReceiptOcrResult_status_idx" ON "ReceiptOcrResult"("status");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ReceiptOcrResult_project_file_idx" ON "ReceiptOcrResult"("projectFileId");

-- AddForeignKey (idempotent - check if constraint exists)
DO $$ BEGIN
    ALTER TABLE "ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ProjectBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "ReceiptOcrResult" ADD CONSTRAINT "ReceiptOcrResult_projectFileId_fkey" FOREIGN KEY ("projectFileId") REFERENCES "ProjectFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
