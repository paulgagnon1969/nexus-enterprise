-- AlterTable
ALTER TABLE "ShoppingCartItem" ADD COLUMN     "coverageConfidence" TEXT,
ADD COLUMN     "coveragePerPurchaseUnit" DOUBLE PRECISION,
ADD COLUMN     "effectiveUnitPrice" DOUBLE PRECISION,
ADD COLUMN     "purchaseQty" DOUBLE PRECISION,
ADD COLUMN     "purchaseUnit" TEXT;

-- AlterTable
ALTER TABLE "ShoppingCartPricingSnapshot" ADD COLUMN     "coveragePerPurchaseUnit" DOUBLE PRECISION,
ADD COLUMN     "normalizedUnitPrice" DOUBLE PRECISION,
ADD COLUMN     "purchaseQty" DOUBLE PRECISION,
ADD COLUMN     "purchaseUnit" TEXT;
