-- AlterTable: Add rental offering and disposition fields to Asset
ALTER TABLE "Asset" ADD COLUMN     "availableForRent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rentalDailyRate" DECIMAL(12,4),
ADD COLUMN     "rentalNotes" TEXT,
ADD COLUMN     "offeredAt" TIMESTAMP(3),
ADD COLUMN     "offeredToCompanyId" TEXT,
ADD COLUMN     "dispositionId" TEXT;

-- CreateIndex
CREATE INDEX "Asset_companyId_dispositionId_idx" ON "Asset"("companyId", "dispositionId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_dispositionId_fkey" FOREIGN KEY ("dispositionId") REFERENCES "AssetDisposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
