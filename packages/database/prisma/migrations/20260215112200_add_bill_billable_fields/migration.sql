-- AlterTable: Add billable expense fields to ProjectBill
ALTER TABLE "ProjectBill" ADD COLUMN IF NOT EXISTS "isBillable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectBill" ADD COLUMN IF NOT EXISTS "markupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ProjectBill" ADD COLUMN IF NOT EXISTS "billableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ProjectBill" ADD COLUMN IF NOT EXISTS "sourceDailyLogId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectBill_source_daily_log_idx" ON "ProjectBill"("sourceDailyLogId");
