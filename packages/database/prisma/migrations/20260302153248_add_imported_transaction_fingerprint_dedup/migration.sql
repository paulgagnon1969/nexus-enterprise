/*
  Warnings:

  - A unique constraint covering the columns `[companyId,source,fingerprint]` on the table `ImportedTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ImportedTransaction" ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ImportedTransaction_companyId_source_fingerprint_key" ON "ImportedTransaction"("companyId", "source", "fingerprint");
