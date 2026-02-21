-- AlterTable
ALTER TABLE "CompanyPriceListItem" ADD COLUMN     "lastPriceChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastPriceChangedByUserId" TEXT,
ADD COLUMN     "lastPriceChangedSource" TEXT,
ADD COLUMN     "lastPriceChangedSourceImportJobId" TEXT;

-- AlterTable
ALTER TABLE "SowItem" ADD COLUMN     "originalQty" DOUBLE PRECISION,
ADD COLUMN     "qtyFieldNotes" TEXT,
ADD COLUMN     "qtyFieldReported" DOUBLE PRECISION,
ADD COLUMN     "qtyFieldReportedAt" TIMESTAMP(3),
ADD COLUMN     "qtyFieldReportedByUserId" TEXT,
ADD COLUMN     "qtyFlaggedIncorrect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qtyReviewStatus" TEXT;

-- CreateTable
CREATE TABLE "TenantPriceUpdateLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyPriceListId" TEXT NOT NULL,
    "companyPriceListItemId" TEXT NOT NULL,
    "canonicalKeyHash" TEXT,
    "oldUnitPrice" DOUBLE PRECISION,
    "newUnitPrice" DOUBLE PRECISION,
    "source" TEXT NOT NULL,
    "sourceImportJobId" TEXT,
    "projectId" TEXT,
    "estimateVersionId" TEXT,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPriceUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantPriceUpdateLog_company_changed_idx" ON "TenantPriceUpdateLog"("companyId", "changedAt");

-- CreateIndex
CREATE INDEX "TenantPriceUpdateLog_item_changed_idx" ON "TenantPriceUpdateLog"("companyPriceListItemId", "changedAt");

-- AddForeignKey
ALTER TABLE "TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_companyPriceListId_fkey" FOREIGN KEY ("companyPriceListId") REFERENCES "CompanyPriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_companyPriceListItemId_fkey" FOREIGN KEY ("companyPriceListItemId") REFERENCES "CompanyPriceListItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPriceUpdateLog" ADD CONSTRAINT "TenantPriceUpdateLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
