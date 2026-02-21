-- CreateEnum
CREATE TYPE "PetlActivity" AS ENUM ('REMOVE_AND_REPLACE', 'REMOVE', 'REPLACE', 'DETACH_AND_RESET', 'MATERIALS');

-- AlterTable: Add cost component and CO fields to PetlReconciliationEntry
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "workersWage" DOUBLE PRECISION;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "laborBurden" DOUBLE PRECISION;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "laborOverhead" DOUBLE PRECISION;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "materialCost" DOUBLE PRECISION;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "equipmentCost" DOUBLE PRECISION;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "activity" "PetlActivity";
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "sourceActivity" TEXT;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "isStandaloneChangeOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "coSequenceNo" INTEGER;

-- CreateIndex for CO entries lookup
CREATE INDEX "PetlReconEntry_standalone_co_idx" ON "PetlReconciliationEntry"("projectId", "isStandaloneChangeOrder") WHERE "isStandaloneChangeOrder" = true;
