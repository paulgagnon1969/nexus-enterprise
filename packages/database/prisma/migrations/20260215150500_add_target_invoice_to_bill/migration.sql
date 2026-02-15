-- AlterTable
ALTER TABLE "ProjectBill" ADD COLUMN "targetInvoiceId" TEXT;

-- AddForeignKey
ALTER TABLE "ProjectBill" ADD CONSTRAINT "ProjectBill_targetInvoiceId_fkey" FOREIGN KEY ("targetInvoiceId") REFERENCES "ProjectInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ProjectBill_target_invoice_idx" ON "ProjectBill"("targetInvoiceId");
