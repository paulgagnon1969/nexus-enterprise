-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('WILL_CALL', 'DELIVERY', 'RETURN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InventoryMoveType" AS ENUM ('DROP', 'PICKUP', 'TRANSFER');

-- AlterEnum
ALTER TYPE "DailyLogType" ADD VALUE 'INVENTORY_MOVE';

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "expectedDeliveryDate" TIMESTAMP(3),
ADD COLUMN     "fulfillmentMethod" "FulfillmentMethod",
ADD COLUMN     "inventoryLedgerJson" JSONB,
ADD COLUMN     "inventoryMoveItemsJson" JSONB,
ADD COLUMN     "moveFromLocationId" TEXT,
ADD COLUMN     "moveToLocationId" TEXT,
ADD COLUMN     "moveType" "InventoryMoveType",
ADD COLUMN     "originLocationId" TEXT,
ADD COLUMN     "receiptCaptureGeoAccuracy" DOUBLE PRECISION,
ADD COLUMN     "receiptCaptureLat" DOUBLE PRECISION,
ADD COLUMN     "receiptCaptureLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MaterialLot" ADD COLUMN     "destinationProjectId" TEXT,
ADD COLUMN     "lotKey" TEXT,
ADD COLUMN     "originLocationId" TEXT,
ADD COLUMN     "sourceDailyLogId" TEXT;

-- AlterTable
ALTER TABLE "ReceiptOcrResult" ADD COLUMN     "captureGeoAccuracy" DOUBLE PRECISION,
ADD COLUMN     "captureLat" DOUBLE PRECISION,
ADD COLUMN     "captureLng" DOUBLE PRECISION,
ADD COLUMN     "receiptTime" TEXT,
ADD COLUMN     "vendorCity" TEXT,
ADD COLUMN     "vendorPhone" TEXT,
ADD COLUMN     "vendorState" TEXT,
ADD COLUMN     "vendorStoreNumber" TEXT,
ADD COLUMN     "vendorZip" TEXT;

-- CreateIndex
CREATE INDEX "MaterialLot_company_origin_location_idx" ON "MaterialLot"("companyId", "originLocationId");

-- CreateIndex
CREATE INDEX "MaterialLot_company_project_idx" ON "MaterialLot"("companyId", "destinationProjectId");

-- CreateIndex
CREATE INDEX "MaterialLot_lotKey_idx" ON "MaterialLot"("lotKey");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_moveFromLocationId_fkey" FOREIGN KEY ("moveFromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_moveToLocationId_fkey" FOREIGN KEY ("moveToLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_originLocationId_fkey" FOREIGN KEY ("originLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_sourceDailyLogId_fkey" FOREIGN KEY ("sourceDailyLogId") REFERENCES "DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_destinationProjectId_fkey" FOREIGN KEY ("destinationProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
