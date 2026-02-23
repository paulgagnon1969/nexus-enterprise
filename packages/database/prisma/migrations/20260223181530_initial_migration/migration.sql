-- CreateEnum
CREATE TYPE "BomPricingSnapshotStatus" AS ENUM ('DRAFT', 'LOCKED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "BomPricingSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateVersionId" TEXT NOT NULL,
    "zipCode" TEXT,
    "totalLines" INTEGER NOT NULL,
    "searchableLines" INTEGER NOT NULL,
    "status" "BomPricingSnapshotStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BomPricingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomPricingHit" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sowItemId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT,
    "searchQuery" TEXT NOT NULL,
    "materialAmount" DOUBLE PRECISION,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "selectedProductIdx" INTEGER,

    CONSTRAINT "BomPricingHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomPricingProduct" (
    "id" TEXT NOT NULL,
    "hitId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "modelNumber" TEXT,
    "price" DOUBLE PRECISION,
    "wasPrice" DOUBLE PRECISION,
    "unit" TEXT,
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "rating" DOUBLE PRECISION,
    "inStock" BOOLEAN,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomPricingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPriceObservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "searchQuery" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "zipCode" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialPriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BomPricingSnapshot_companyId_projectId_idx" ON "BomPricingSnapshot"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "BomPricingSnapshot_projectId_estimateVersionId_idx" ON "BomPricingSnapshot"("projectId", "estimateVersionId");

-- CreateIndex
CREATE INDEX "BomPricingHit_snapshotId_idx" ON "BomPricingHit"("snapshotId");

-- CreateIndex
CREATE INDEX "BomPricingHit_sowItemId_idx" ON "BomPricingHit"("sowItemId");

-- CreateIndex
CREATE INDEX "BomPricingProduct_hitId_idx" ON "BomPricingProduct"("hitId");

-- CreateIndex
CREATE INDEX "MaterialPriceObservation_companyId_searchQuery_observedAt_idx" ON "MaterialPriceObservation"("companyId", "searchQuery", "observedAt");

-- CreateIndex
CREATE INDEX "MaterialPriceObservation_companyId_productId_observedAt_idx" ON "MaterialPriceObservation"("companyId", "productId", "observedAt");

-- CreateIndex
CREATE INDEX "MaterialPriceObservation_companyId_provider_observedAt_idx" ON "MaterialPriceObservation"("companyId", "provider", "observedAt");

-- AddForeignKey
ALTER TABLE "BomPricingSnapshot" ADD CONSTRAINT "BomPricingSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingSnapshot" ADD CONSTRAINT "BomPricingSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingSnapshot" ADD CONSTRAINT "BomPricingSnapshot_estimateVersionId_fkey" FOREIGN KEY ("estimateVersionId") REFERENCES "EstimateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingSnapshot" ADD CONSTRAINT "BomPricingSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingHit" ADD CONSTRAINT "BomPricingHit_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BomPricingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingHit" ADD CONSTRAINT "BomPricingHit_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingProduct" ADD CONSTRAINT "BomPricingProduct_hitId_fkey" FOREIGN KEY ("hitId") REFERENCES "BomPricingHit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPriceObservation" ADD CONSTRAINT "MaterialPriceObservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
