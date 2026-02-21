-- CreateEnum
CREATE TYPE "DailyLogType" AS ENUM ('PUDL', 'RECEIPT_EXPENSE', 'JSA', 'INCIDENT', 'QUALITY', 'CUSTOM');

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN "type" "DailyLogType" NOT NULL DEFAULT 'PUDL';
ALTER TABLE "DailyLog" ADD COLUMN "expenseVendor" TEXT;
ALTER TABLE "DailyLog" ADD COLUMN "expenseAmount" DECIMAL(12,2);
ALTER TABLE "DailyLog" ADD COLUMN "expenseDate" TIMESTAMP(3);
ALTER TABLE "DailyLog" ADD COLUMN "sourceBillId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_sourceBillId_key" ON "DailyLog"("sourceBillId");

-- CreateIndex
CREATE INDEX "DailyLog_project_type_idx" ON "DailyLog"("projectId", "type");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_sourceBillId_fkey" FOREIGN KEY ("sourceBillId") REFERENCES "ProjectBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
