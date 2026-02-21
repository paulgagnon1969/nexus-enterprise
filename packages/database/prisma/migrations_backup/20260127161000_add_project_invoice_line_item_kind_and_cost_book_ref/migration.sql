-- CreateEnum
CREATE TYPE "ProjectInvoiceLineItemKind" AS ENUM ('MANUAL', 'BILLABLE_HOURS', 'EQUIPMENT_RENTAL', 'COST_BOOK');

-- AlterTable
ALTER TABLE "ProjectInvoiceLineItem"
ADD COLUMN     "kind" "ProjectInvoiceLineItemKind" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "companyPriceListItemId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_invoice_kind_idx" ON "ProjectInvoiceLineItem"("invoiceId", "kind");

-- CreateIndex
CREATE INDEX "ProjectInvoiceLineItem_company_price_item_idx" ON "ProjectInvoiceLineItem"("companyPriceListItemId");

-- AddForeignKey
ALTER TABLE "ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "CompanyPriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
