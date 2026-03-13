-- CreateEnum
CREATE TYPE "ShoppingCartStatus" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ShoppingCartHorizon" AS ENUM ('TODAY', 'THIS_WEEK', 'TWO_WEEKS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ShoppingCartItemStatus" AS ENUM ('PENDING', 'SOURCED', 'PURCHASED', 'RECEIVED');

-- CreateTable
CREATE TABLE "ShoppingCart" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "label" TEXT,
    "status" "ShoppingCartStatus" NOT NULL DEFAULT 'DRAFT',
    "horizon" "ShoppingCartHorizon" NOT NULL DEFAULT 'TODAY',
    "horizonDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingCartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "sowItemId" TEXT,
    "costBookItemId" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "projectNeedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cartQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recommendedQty" DOUBLE PRECISION,
    "recommendedReason" TEXT,
    "purchasedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ShoppingCartItemStatus" NOT NULL DEFAULT 'PENDING',
    "bestSupplierKey" TEXT,
    "bestSupplierName" TEXT,
    "bestUnitPrice" DOUBLE PRECISION,
    "cbaScore" DOUBLE PRECISION,
    "roomParticleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShoppingCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingCartPricingSnapshot" (
    "id" TEXT NOT NULL,
    "cartItemId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierAddress" TEXT,
    "distanceMiles" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "travelCostEstimate" DOUBLE PRECISION,
    "timeCostEstimate" DOUBLE PRECISION,
    "netBenefit" DOUBLE PRECISION,
    "availabilityStatus" TEXT,
    "leadTimeDays" INTEGER,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingCartPricingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialDrawdownLedger" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "totalProjectNeed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalOrdered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPurchased" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInstalled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialDrawdownLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingCart_company_project_status_idx" ON "ShoppingCart"("companyId", "projectId", "status");

-- CreateIndex
CREATE INDEX "ShoppingCart_project_status_idx" ON "ShoppingCart"("projectId", "status");

-- CreateIndex
CREATE INDEX "ShoppingCartItem_cart_key_idx" ON "ShoppingCartItem"("cartId", "normalizedKey");

-- CreateIndex
CREATE INDEX "ShoppingCartItem_sowItem_idx" ON "ShoppingCartItem"("sowItemId");

-- CreateIndex
CREATE INDEX "ShoppingCartItem_costBook_idx" ON "ShoppingCartItem"("costBookItemId");

-- CreateIndex
CREATE INDEX "ShoppingCartPricing_item_supplier_idx" ON "ShoppingCartPricingSnapshot"("cartItemId", "supplierKey");

-- CreateIndex
CREATE INDEX "MaterialDrawdown_project_idx" ON "MaterialDrawdownLedger"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialDrawdownLedger_companyId_projectId_normalizedKey_key" ON "MaterialDrawdownLedger"("companyId", "projectId", "normalizedKey");

-- AddForeignKey
ALTER TABLE "ShoppingCart" ADD CONSTRAINT "ShoppingCart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCart" ADD CONSTRAINT "ShoppingCart_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCart" ADD CONSTRAINT "ShoppingCart_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCartItem" ADD CONSTRAINT "ShoppingCartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "ShoppingCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCartItem" ADD CONSTRAINT "ShoppingCartItem_sowItemId_fkey" FOREIGN KEY ("sowItemId") REFERENCES "SowItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCartItem" ADD CONSTRAINT "ShoppingCartItem_costBookItemId_fkey" FOREIGN KEY ("costBookItemId") REFERENCES "CompanyPriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCartItem" ADD CONSTRAINT "ShoppingCartItem_roomParticleId_fkey" FOREIGN KEY ("roomParticleId") REFERENCES "ProjectParticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingCartPricingSnapshot" ADD CONSTRAINT "ShoppingCartPricingSnapshot_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "ShoppingCartItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDrawdownLedger" ADD CONSTRAINT "MaterialDrawdownLedger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialDrawdownLedger" ADD CONSTRAINT "MaterialDrawdownLedger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
