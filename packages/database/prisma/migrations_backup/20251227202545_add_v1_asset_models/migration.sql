-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('LABOR', 'MATERIAL', 'EQUIPMENT', 'TOOL', 'RENTAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('TIME_AND_MATERIAL', 'FIXED_FEE', 'INCLUDED_IN_SCOPE', 'NO_CHARGE');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('PURCHASE', 'CONSUME', 'TRANSFER', 'RETURN', 'WASTE', 'TIME_PUNCH', 'MAINTENANCE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "assetType" "AssetType" NOT NULL,
    "baseUnit" TEXT,
    "baseRate" DECIMAL(12,4),
    "costBreakdown" JSONB,
    "attributes" JSONB,
    "isTrackable" BOOLEAN NOT NULL DEFAULT false,
    "isConsumable" BOOLEAN NOT NULL DEFAULT false,
    "priceListItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetUsage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sowItemId" TEXT,
    "dailyLogId" TEXT,
    "billingMode" "BillingMode" NOT NULL,
    "status" "UsageStatus" NOT NULL DEFAULT 'PLANNED',
    "quantity" DECIMAL(12,4),
    "unit" TEXT,
    "overrideRate" DECIMAL(12,4),
    "snapshotRate" DECIMAL(12,4),
    "snapshotCostBreakdown" JSONB,
    "actualCost" DECIMAL(14,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetTransaction" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "usageId" TEXT,
    "kind" "TransactionKind" NOT NULL,
    "quantity" DECIMAL(12,4),
    "unit" TEXT,
    "unitCost" DECIMAL(12,4),
    "totalCost" DECIMAL(14,2),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_company_type_idx" ON "Asset"("companyId", "assetType");

-- CreateIndex
CREATE INDEX "AssetUsage_company_project_idx" ON "AssetUsage"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "AssetUsage_asset_status_idx" ON "AssetUsage"("assetId", "status");

-- CreateIndex
CREATE INDEX "AssetTransaction_company_created_idx" ON "AssetTransaction"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetTransaction_asset_created_idx" ON "AssetTransaction"("assetId", "createdAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "AssetUsage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetTransaction" ADD CONSTRAINT "AssetTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
