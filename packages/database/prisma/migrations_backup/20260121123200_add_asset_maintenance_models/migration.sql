-- CreateEnum
CREATE TYPE "MaintenanceTriggerStrategy" AS ENUM ('TIME_ONLY', 'METER_ONLY', 'TIME_OR_METER');

-- CreateEnum
CREATE TYPE "MaintenanceIntervalUnit" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "MaintenanceMeterType" AS ENUM ('HOURS', 'MILES', 'RUN_CYCLES', 'GENERATOR_HOURS');

-- CreateEnum
CREATE TYPE "MaintenanceTodoStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialRequirementStatus" AS ENUM ('PLANNED', 'DUE_SOON', 'LATE', 'ORDERED', 'RECEIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LocationType" ADD VALUE 'SUPPLIER';
ALTER TYPE "LocationType" ADD VALUE 'VENDOR';
ALTER TYPE "LocationType" ADD VALUE 'TRANSIT';
ALTER TYPE "LocationType" ADD VALUE 'LOGICAL';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EM';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maintLeadTimeDays" INTEGER,
ADD COLUMN     "maintMeterIntervalAmount" INTEGER,
ADD COLUMN     "maintMeterType" "MaintenanceMeterType",
ADD COLUMN     "maintNotes" TEXT,
ADD COLUMN     "maintOwnerEmail" TEXT,
ADD COLUMN     "maintOwnerExternalId" TEXT,
ADD COLUMN     "maintTimeIntervalUnit" "MaintenanceIntervalUnit",
ADD COLUMN     "maintTimeIntervalValue" INTEGER,
ADD COLUMN     "maintTriggerStrategy" "MaintenanceTriggerStrategy",
ADD COLUMN     "maintenanceProfileCode" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "serialNumberOrVin" TEXT,
ADD COLUMN     "year" INTEGER;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "internalLaborCost" DECIMAL(14,2),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "transportCost" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "AssetMaintenanceTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assetType" "AssetType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenanceRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerStrategy" "MaintenanceTriggerStrategy" NOT NULL,
    "timeIntervalValue" INTEGER,
    "timeIntervalUnit" "MaintenanceIntervalUnit",
    "meterType" "MaintenanceMeterType",
    "meterIntervalAmount" INTEGER,
    "leadTimeDays" INTEGER,
    "defaultAssigneeRole" "Role",
    "priority" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMaintenanceSchedule" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "lastServiceDate" TIMESTAMP(3),
    "lastServiceMeter" INTEGER,
    "nextTimeDueAt" TIMESTAMP(3),
    "nextMeterDueAt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetMaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTodo" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT,
    "scheduleId" TEXT,
    "ruleId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "MaintenanceTodoStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "assignedToUserId" TEXT,
    "assignedToRole" "Role",
    "priority" INTEGER,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceReviewSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "intervalValue" INTEGER NOT NULL,
    "intervalUnit" "MaintenanceIntervalUnit" NOT NULL,
    "nextReviewAt" TIMESTAMP(3),
    "lastReviewAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceReviewSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetMeterReading" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "meterType" "MaintenanceMeterType" NOT NULL,
    "value" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetMeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPosition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemType" "InventoryItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetMaintenanceTemplate_code_key" ON "AssetMaintenanceTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AssetMaintenanceSchedule_assetId_ruleId_key" ON "AssetMaintenanceSchedule"("assetId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceReviewSettings_companyId_key" ON "MaintenanceReviewSettings"("companyId");

-- CreateIndex
CREATE INDEX "AssetMeterReading_assetId_meterType_recordedAt_idx" ON "AssetMeterReading"("assetId", "meterType", "recordedAt");

-- CreateIndex
CREATE INDEX "InventoryPosition_companyId_locationId_idx" ON "InventoryPosition"("companyId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPosition_companyId_itemType_itemId_locationId_key" ON "InventoryPosition"("companyId", "itemType", "itemId", "locationId");

-- AddForeignKey
ALTER TABLE "AssetMaintenanceTemplate" ADD CONSTRAINT "AssetMaintenanceTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceRule" ADD CONSTRAINT "AssetMaintenanceRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssetMaintenanceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceSchedule" ADD CONSTRAINT "AssetMaintenanceSchedule_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMaintenanceSchedule" ADD CONSTRAINT "AssetMaintenanceSchedule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AssetMaintenanceRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AssetMaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTodo" ADD CONSTRAINT "MaintenanceTodo_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AssetMaintenanceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceReviewSettings" ADD CONSTRAINT "MaintenanceReviewSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMeterReading" ADD CONSTRAINT "AssetMeterReading_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetMeterReading" ADD CONSTRAINT "AssetMeterReading_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPosition" ADD CONSTRAINT "InventoryPosition_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPosition" ADD CONSTRAINT "InventoryPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
