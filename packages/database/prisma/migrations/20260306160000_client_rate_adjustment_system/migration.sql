-- AlterTable: Add client rate adjustment fields to ProjectInvoiceLineItem
ALTER TABLE "ProjectInvoiceLineItem" ADD COLUMN "adjustmentReasonId" TEXT,
ADD COLUMN "costBookUnitPrice" DOUBLE PRECISION,
ADD COLUMN "adjustedUnitPrice" DOUBLE PRECISION,
ADD COLUMN "discountPercent" DOUBLE PRECISION,
ADD COLUMN "parentLineItemId" TEXT,
ADD COLUMN "clientRateAdjustmentId" TEXT;

-- CreateTable: AdjustmentReasonType (admin-managed lookup)
CREATE TABLE "AdjustmentReasonType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdjustmentReasonType_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ClientRateAdjustment (persisted client-specific rates)
CREATE TABLE "ClientRateAdjustment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tenantClientId" TEXT NOT NULL,
    "companyPriceListItemId" TEXT NOT NULL,
    "adjustmentReasonId" TEXT,
    "adjustedUnitPrice" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRateAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: AdjustmentReasonType
CREATE UNIQUE INDEX "AdjustmentReasonType_company_slug_key" ON "AdjustmentReasonType"("companyId", "slug");
CREATE INDEX "AdjustmentReasonType_company_active_idx" ON "AdjustmentReasonType"("companyId", "isActive");

-- CreateIndex: ClientRateAdjustment
CREATE INDEX "ClientRateAdj_client_item_active_idx" ON "ClientRateAdjustment"("tenantClientId", "companyPriceListItemId", "isActive");
CREATE INDEX "ClientRateAdj_company_client_idx" ON "ClientRateAdjustment"("companyId", "tenantClientId");

-- CreateIndex: ProjectInvoiceLineItem (new indexes for adjustment fields)
CREATE INDEX "ProjectInvoiceLineItem_parent_line_idx" ON "ProjectInvoiceLineItem"("parentLineItemId");
CREATE INDEX "ProjectInvoiceLineItem_client_rate_adj_idx" ON "ProjectInvoiceLineItem"("clientRateAdjustmentId");

-- AddForeignKey: AdjustmentReasonType → Company
ALTER TABLE "AdjustmentReasonType" ADD CONSTRAINT "AdjustmentReasonType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ClientRateAdjustment → Company
ALTER TABLE "ClientRateAdjustment" ADD CONSTRAINT "ClientRateAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ClientRateAdjustment → TenantClient
ALTER TABLE "ClientRateAdjustment" ADD CONSTRAINT "ClientRateAdjustment_tenantClientId_fkey" FOREIGN KEY ("tenantClientId") REFERENCES "TenantClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ClientRateAdjustment → CompanyPriceListItem
ALTER TABLE "ClientRateAdjustment" ADD CONSTRAINT "ClientRateAdjustment_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "CompanyPriceListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ClientRateAdjustment → AdjustmentReasonType
ALTER TABLE "ClientRateAdjustment" ADD CONSTRAINT "ClientRateAdjustment_adjustmentReasonId_fkey" FOREIGN KEY ("adjustmentReasonId") REFERENCES "AdjustmentReasonType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ClientRateAdjustment → User (createdBy)
ALTER TABLE "ClientRateAdjustment" ADD CONSTRAINT "ClientRateAdjustment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ProjectInvoiceLineItem → AdjustmentReasonType
ALTER TABLE "ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_adjustmentReasonId_fkey" FOREIGN KEY ("adjustmentReasonId") REFERENCES "AdjustmentReasonType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ProjectInvoiceLineItem → ProjectInvoiceLineItem (parent → credit line)
ALTER TABLE "ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_parentLineItemId_fkey" FOREIGN KEY ("parentLineItemId") REFERENCES "ProjectInvoiceLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ProjectInvoiceLineItem → ClientRateAdjustment
ALTER TABLE "ProjectInvoiceLineItem" ADD CONSTRAINT "ProjectInvoiceLineItem_clientRateAdjustmentId_fkey" FOREIGN KEY ("clientRateAdjustmentId") REFERENCES "ClientRateAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
