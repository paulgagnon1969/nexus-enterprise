-- AlterEnum: Add MASTER to PriceListKind
ALTER TYPE "PriceListKind" ADD VALUE IF NOT EXISTS 'MASTER';

-- AlterEnum: Add MASTER_COSTBOOK to ImportJobType
ALTER TYPE "ImportJobType" ADD VALUE IF NOT EXISTS 'MASTER_COSTBOOK';

-- AlterEnum: Add MASTER_COSTBOOK to GoldenPriceUpdateSource
ALTER TYPE "GoldenPriceUpdateSource" ADD VALUE IF NOT EXISTS 'MASTER_COSTBOOK';

-- AlterTable: Add sourceCategory to PriceListItem
ALTER TABLE "PriceListItem" ADD COLUMN IF NOT EXISTS "sourceCategory" TEXT;

-- AlterTable: Add masterPriceListItemId to CompanyPriceListItem
ALTER TABLE "CompanyPriceListItem" ADD COLUMN IF NOT EXISTS "masterPriceListItemId" TEXT;

-- AddForeignKey
ALTER TABLE "CompanyPriceListItem"
  ADD CONSTRAINT "CompanyPriceListItem_masterPriceListItemId_fkey"
  FOREIGN KEY ("masterPriceListItemId")
  REFERENCES "PriceListItem"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PriceListItem_source_category_idx" ON "PriceListItem"("sourceCategory");
CREATE INDEX IF NOT EXISTS "CompanyPriceListItem_masterPriceListItemId_idx" ON "CompanyPriceListItem"("masterPriceListItemId");
