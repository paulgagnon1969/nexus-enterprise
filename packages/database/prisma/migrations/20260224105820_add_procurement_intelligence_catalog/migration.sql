-- CreateEnum
CREATE TYPE "VendorProviderType" AS ENUM ('SERPAPI', 'BIGBOX', 'WEB_SCRAPER', 'MANUAL', 'API');

-- AlterTable
ALTER TABLE "BomPricingProduct" ADD COLUMN     "catalogItemId" TEXT;

-- AlterTable
ALTER TABLE "PriceListItem" ADD COLUMN     "catalogItemId" TEXT;

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "specHash" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "width" TEXT,
    "height" TEXT,
    "depth" TEXT,
    "finish" TEXT,
    "specJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRegistry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "providerType" "VendorProviderType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scrapeConfig" JSONB,
    "apiConfig" JSONB,
    "rateLimit" JSONB,
    "skuPrefix" TEXT,
    "prefixMap" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorQuote" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "vendorSku" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "wasPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "inStock" BOOLEAN,
    "stockQty" INTEGER,
    "leadTimeDays" INTEGER,
    "shippingCost" DOUBLE PRECISION,
    "productUrl" TEXT,
    "imageUrl" TEXT,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_specHash_key" ON "CatalogItem"("specHash");

-- CreateIndex
CREATE INDEX "CatalogItem_category_idx" ON "CatalogItem"("category");

-- CreateIndex
CREATE INDEX "CatalogItem_category_type_idx" ON "CatalogItem"("category", "productType");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRegistry_code_key" ON "VendorRegistry"("code");

-- CreateIndex
CREATE INDEX "VendorQuote_item_scraped_idx" ON "VendorQuote"("catalogItemId", "scrapedAt");

-- CreateIndex
CREATE INDEX "VendorQuote_vendor_scraped_idx" ON "VendorQuote"("vendorId", "scrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VendorQuote_item_vendor_sku_key" ON "VendorQuote"("catalogItemId", "vendorId", "vendorSku");

-- CreateIndex
CREATE INDEX "BomPricingProduct_catalog_item_idx" ON "BomPricingProduct"("catalogItemId");

-- CreateIndex
CREATE INDEX "PriceListItem_catalog_item_idx" ON "PriceListItem"("catalogItemId");

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomPricingProduct" ADD CONSTRAINT "BomPricingProduct_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorQuote" ADD CONSTRAINT "VendorQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "VendorRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
