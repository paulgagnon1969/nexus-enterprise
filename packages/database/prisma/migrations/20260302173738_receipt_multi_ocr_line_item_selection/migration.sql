-- DropIndex
DROP INDEX "ReceiptOcrResult_dailyLogId_key";

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "creditAmount" DECIMAL(12,2),
ADD COLUMN     "excludedLineItemsJson" TEXT;

-- CreateIndex
CREATE INDEX "ReceiptOcrResult_daily_log_idx" ON "ReceiptOcrResult"("dailyLogId");
