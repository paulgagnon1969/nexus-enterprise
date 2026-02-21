-- CreateEnum
CREATE TYPE "PetlReconciliationEntryStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PetlReconciliationEntry" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "status" "PetlReconciliationEntryStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ProjectInvoicePetlLine" ADD COLUMN     "anchorGroupSubIndex" INTEGER,
ADD COLUMN     "anchorKind" TEXT,
ADD COLUMN     "anchorRootSourceLineNo" INTEGER,
ADD COLUMN     "anchorSubIndex" INTEGER,
ADD COLUMN     "displayLineNo" TEXT;

-- AddForeignKey
ALTER TABLE "PetlReconciliationEntry" ADD CONSTRAINT "PetlReconciliationEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
