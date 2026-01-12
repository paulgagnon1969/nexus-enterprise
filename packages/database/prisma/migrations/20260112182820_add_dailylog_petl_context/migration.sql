-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('SITE', 'BUILDING', 'WAREHOUSE', 'ZONE', 'AISLE', 'SHELF', 'BIN', 'PERSON', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('ASSET', 'MATERIAL', 'PARTICLE');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "currentLocationId" TEXT;

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "buildingId" TEXT,
ADD COLUMN     "roomParticleId" TEXT,
ADD COLUMN     "sowItemId" TEXT,
ADD COLUMN     "unitId" TEXT;

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentLocationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonLocation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "PersonLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "currentLocationId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryParticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentEntityType" TEXT NOT NULL,
    "parentEntityId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "virtualLocationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryParticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemType" "InventoryItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "movedByUserId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_companyId_type_idx" ON "Location"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_code_key" ON "Location"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PersonLocation_companyId_userId_key" ON "PersonLocation"("companyId", "userId");

-- CreateIndex
CREATE INDEX "MaterialLot_companyId_sku_idx" ON "MaterialLot"("companyId", "sku");

-- CreateIndex
CREATE INDEX "MaterialLot_companyId_currentLocationId_idx" ON "MaterialLot"("companyId", "currentLocationId");

-- CreateIndex
CREATE INDEX "InventoryParticle_companyId_locationId_idx" ON "InventoryParticle"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryParticle_companyId_parentEntityType_parentEntityId_idx" ON "InventoryParticle"("companyId", "parentEntityType", "parentEntityId");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_itemType_itemId_idx" ON "InventoryMovement"("companyId", "itemType", "itemId");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_toLocationId_movedAt_idx" ON "InventoryMovement"("companyId", "toLocationId", "movedAt");

-- CreateIndex
CREATE INDEX "Asset_companyId_currentLocationId_idx" ON "Asset"("companyId", "currentLocationId");

-- CreateIndex
CREATE INDEX "DailyLog_project_room_idx" ON "DailyLog"("projectId", "roomParticleId");

-- CreateIndex
CREATE INDEX "DailyLog_project_sow_idx" ON "DailyLog"("projectId", "sowItemId");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProjectUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_roomParticleId_fkey" FOREIGN KEY ("roomParticleId") REFERENCES "ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLocation" ADD CONSTRAINT "PersonLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLocation" ADD CONSTRAINT "PersonLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonLocation" ADD CONSTRAINT "PersonLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryParticle" ADD CONSTRAINT "InventoryParticle_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryParticle" ADD CONSTRAINT "InventoryParticle_virtualLocationId_fkey" FOREIGN KEY ("virtualLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryParticle" ADD CONSTRAINT "InventoryParticle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_movedByUserId_fkey" FOREIGN KEY ("movedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
