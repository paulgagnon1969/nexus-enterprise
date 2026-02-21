/*
  Warnings:

  - Added the required column `addressLine1` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `Project` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProjectParticleType" AS ENUM ('ROOM', 'ZONE', 'EXTERIOR');

-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN     "projectParticleId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "addressLine1" TEXT NOT NULL,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "country" TEXT DEFAULT 'US',
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "primaryContactEmail" TEXT,
ADD COLUMN     "primaryContactName" TEXT,
ADD COLUMN     "primaryContactPhone" TEXT,
ADD COLUMN     "state" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "projectParticleId" TEXT;

-- CreateTable
CREATE TABLE "ProjectBuilding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectUnit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT,
    "externalCode" TEXT,
    "label" TEXT NOT NULL,
    "floor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectParticle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "buildingId" TEXT,
    "unitId" TEXT,
    "type" "ProjectParticleType" NOT NULL DEFAULT 'ROOM',
    "name" TEXT NOT NULL,
    "fullLabel" TEXT NOT NULL,
    "externalGroupCode" TEXT,
    "externalGroupDescription" TEXT,
    "parentParticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectParticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "estimateKind" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "defaultPayerType" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "importedByUserId" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawXactRow" (
    "id" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "groupCode" TEXT,
    "groupDescription" TEXT,
    "desc" TEXT,
    "age" DOUBLE PRECISION,
    "condition" TEXT,
    "qty" DOUBLE PRECISION,
    "itemAmount" DOUBLE PRECISION,
    "reportedCost" DOUBLE PRECISION,
    "unitCost" DOUBLE PRECISION,
    "unit" TEXT,
    "coverage" TEXT,
    "activity" TEXT,
    "workersWage" DOUBLE PRECISION,
    "laborBurden" DOUBLE PRECISION,
    "laborOverhead" DOUBLE PRECISION,
    "material" DOUBLE PRECISION,
    "equipment" DOUBLE PRECISION,
    "marketConditions" DOUBLE PRECISION,
    "laborMinimum" DOUBLE PRECISION,
    "salesTax" DOUBLE PRECISION,
    "rcv" DOUBLE PRECISION,
    "life" INTEGER,
    "depreciationType" TEXT,
    "depreciationAmount" DOUBLE PRECISION,
    "recoverable" BOOLEAN,
    "acv" DOUBLE PRECISION,
    "tax" DOUBLE PRECISION,
    "replaceFlag" BOOLEAN,
    "cat" TEXT,
    "sel" TEXT,
    "owner" TEXT,
    "originalVendor" TEXT,
    "sourceName" TEXT,
    "sourceDate" TIMESTAMP(3),
    "note1" TEXT,
    "adjSource" TEXT,
    "rawRowJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawXactRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "totalAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SowLogicalItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectParticleId" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowLogicalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SowItem" (
    "id" TEXT NOT NULL,
    "sowId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "rawRowId" TEXT NOT NULL,
    "logicalItemId" TEXT NOT NULL,
    "projectParticleId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "unitCost" DOUBLE PRECISION,
    "itemAmount" DOUBLE PRECISION,
    "rcvAmount" DOUBLE PRECISION,
    "acvAmount" DOUBLE PRECISION,
    "depreciationAmount" DOUBLE PRECISION,
    "salesTaxAmount" DOUBLE PRECISION,
    "categoryCode" TEXT,
    "selectionCode" TEXT,
    "activity" TEXT,
    "materialAmount" DOUBLE PRECISION,
    "equipmentAmount" DOUBLE PRECISION,
    "payerType" TEXT NOT NULL,
    "performed" BOOLEAN NOT NULL DEFAULT false,
    "eligibleForAcvRefund" BOOLEAN NOT NULL DEFAULT false,
    "acvRefundAmount" DOUBLE PRECISION,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NameAlias" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NameAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetlEditSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ncc-petl-ui',
    "meta" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlEditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetlEditChange" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetlEditChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectUnit_projectId_label_key" ON "ProjectUnit"("projectId", "label");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBuilding" ADD CONSTRAINT "ProjectBuilding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBuilding" ADD CONSTRAINT "ProjectBuilding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUnit" ADD CONSTRAINT "ProjectUnit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUnit" ADD CONSTRAINT "ProjectUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectUnit" ADD CONSTRAINT "ProjectUnit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticle" ADD CONSTRAINT "ProjectParticle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticle" ADD CONSTRAINT "ProjectParticle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticle" ADD CONSTRAINT "ProjectParticle_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "ProjectBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticle" ADD CONSTRAINT "ProjectParticle_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ProjectUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectParticle" ADD CONSTRAINT "ProjectParticle_parentParticleId_fkey" FOREIGN KEY ("parentParticleId") REFERENCES "ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateVersion" ADD CONSTRAINT "EstimateVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawXactRow" ADD CONSTRAINT "RawXactRow_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sow" ADD CONSTRAINT "Sow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sow" ADD CONSTRAINT "Sow_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowLogicalItem" ADD CONSTRAINT "SowLogicalItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowLogicalItem" ADD CONSTRAINT "SowLogicalItem_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "ProjectParticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowItem" ADD CONSTRAINT "SowItem_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "Sow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowItem" ADD CONSTRAINT "SowItem_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowItem" ADD CONSTRAINT "SowItem_rawRowId_fkey" FOREIGN KEY ("rawRowId") REFERENCES "RawXactRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowItem" ADD CONSTRAINT "SowItem_logicalItemId_fkey" FOREIGN KEY ("logicalItemId") REFERENCES "SowLogicalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SowItem" ADD CONSTRAINT "SowItem_projectParticleId_fkey" FOREIGN KEY ("projectParticleId") REFERENCES "ProjectParticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlEditSession" ADD CONSTRAINT "PetlEditSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlEditChange" ADD CONSTRAINT "PetlEditChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PetlEditSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetlEditChange" ADD CONSTRAINT "PetlEditChange_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
