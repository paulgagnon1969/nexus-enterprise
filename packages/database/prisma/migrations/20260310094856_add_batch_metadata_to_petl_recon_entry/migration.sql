-- AlterTable
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "batchLabel" TEXT;

-- CreateIndex
CREATE INDEX "PetlReconEntry_batch_idx" ON "PetlReconciliationEntry"("batchId");
