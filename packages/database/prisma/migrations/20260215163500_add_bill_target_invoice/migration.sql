-- Add targetInvoiceId column to ProjectBill for linking bills to specific invoices
ALTER TABLE "ProjectBill" ADD COLUMN "targetInvoiceId" TEXT;

-- Add foreign key constraint
ALTER TABLE "ProjectBill" ADD CONSTRAINT "ProjectBill_targetInvoiceId_fkey" 
    FOREIGN KEY ("targetInvoiceId") REFERENCES "ProjectInvoice"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for faster lookups
CREATE INDEX "ProjectBill_target_invoice_idx" ON "ProjectBill"("targetInvoiceId");
