-- AlterEnum
ALTER TYPE "ProjectInvoicePetlLineBillingTag" ADD VALUE 'PETL_LINE_ITEM';

-- AlterTable
ALTER TABLE "ProjectInvoiceLineItem" ADD COLUMN     "billingTag" "ProjectInvoicePetlLineBillingTag" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_invoice_billing_tag_idx" ON "ProjectInvoiceLineItem"("invoiceId", "billingTag");
