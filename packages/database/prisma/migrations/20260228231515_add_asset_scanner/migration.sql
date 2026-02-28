-- AlterTable: Add asset scanner fields to Asset
ALTER TABLE "Asset" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Asset" ADD COLUMN "templateAssetId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "scanModelUrl" TEXT;
ALTER TABLE "Asset" ADD COLUMN "scanThumbnailUrl" TEXT;
ALTER TABLE "Asset" ADD COLUMN "dimensions" JSONB;
ALTER TABLE "Asset" ADD COLUMN "tagPhotoUrl" TEXT;

-- CreateTable: AssetScan
CREATE TABLE "AssetScan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetId" TEXT,
    "scanType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "modelUrl" TEXT,
    "thumbnailUrl" TEXT,
    "boundingBox" JSONB,
    "dimensions" JSONB,
    "tagPhotoUrl" TEXT,
    "extractedData" JSONB,
    "rawAiResponse" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetScan_company_created_idx" ON "AssetScan"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AssetScan_company_type_idx" ON "AssetScan"("companyId", "scanType");

-- CreateIndex
CREATE INDEX "AssetScan_asset_idx" ON "AssetScan"("assetId");

-- CreateIndex
CREATE INDEX "Asset_template_idx" ON "Asset"("templateAssetId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_templateAssetId_fkey" FOREIGN KEY ("templateAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScan" ADD CONSTRAINT "AssetScan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScan" ADD CONSTRAINT "AssetScan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetScan" ADD CONSTRAINT "AssetScan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
