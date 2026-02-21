-- CreateEnum
CREATE TYPE "PetlReconciliationEntryTag" AS ENUM ('SUPPLEMENT', 'CHANGE_ORDER', 'OTHER', 'WARRANTY');

-- AlterTable
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN "tag" "PetlReconciliationEntryTag";
