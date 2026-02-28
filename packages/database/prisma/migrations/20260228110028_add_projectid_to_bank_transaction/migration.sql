-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_company_project_idx" ON "BankTransaction"("companyId", "projectId");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
