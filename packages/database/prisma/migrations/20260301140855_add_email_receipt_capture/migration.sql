-- CreateEnum
CREATE TYPE "EmailReceiptStatus" AS ENUM ('PENDING_OCR', 'PENDING_MATCH', 'MATCHED', 'ASSIGNED', 'UNASSIGNED');

-- AlterEnum
ALTER TYPE "ImportJobType" ADD VALUE 'RECEIPT_EMAIL_OCR';

-- CreateTable
CREATE TABLE "EmailReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tenantEmailAddress" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "subject" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT,
    "rawEmailJson" JSONB,
    "attachmentUrls" JSONB,
    "status" "EmailReceiptStatus" NOT NULL DEFAULT 'PENDING_OCR',
    "ocrResultId" TEXT,
    "projectId" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchReason" TEXT,
    "assignedByUserId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailReceipt_messageId_key" ON "EmailReceipt"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailReceipt_ocrResultId_key" ON "EmailReceipt"("ocrResultId");

-- CreateIndex
CREATE INDEX "EmailReceipt_company_status_idx" ON "EmailReceipt"("companyId", "status");

-- CreateIndex
CREATE INDEX "EmailReceipt_company_project_idx" ON "EmailReceipt"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "EmailReceipt_company_received_idx" ON "EmailReceipt"("companyId", "receivedAt");

-- AddForeignKey
ALTER TABLE "EmailReceipt" ADD CONSTRAINT "EmailReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReceipt" ADD CONSTRAINT "EmailReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReceipt" ADD CONSTRAINT "EmailReceipt_ocrResultId_fkey" FOREIGN KEY ("ocrResultId") REFERENCES "ReceiptOcrResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReceipt" ADD CONSTRAINT "EmailReceipt_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
