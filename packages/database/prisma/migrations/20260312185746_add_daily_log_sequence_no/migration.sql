/*
  Warnings:

  - A unique constraint covering the columns `[companyId,sequenceYear,sequenceNo]` on the table `DailyLog` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "sequenceNo" INTEGER,
ADD COLUMN     "sequenceYear" INTEGER;

-- CreateIndex
CREATE INDEX "DailyLog_company_year_idx" ON "DailyLog"("companyId", "sequenceYear");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_companyId_sequenceYear_sequenceNo_key" ON "DailyLog"("companyId", "sequenceYear", "sequenceNo");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
