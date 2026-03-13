-- AlterTable
ALTER TABLE "ShoppingCartItem" ADD COLUMN     "fulfillmentType" TEXT;

-- AlterTable
ALTER TABLE "ShoppingCartPricingSnapshot" ADD COLUMN     "deliveryEstimate" TEXT,
ADD COLUMN     "deliveryMaxDays" INTEGER,
ADD COLUMN     "deliveryMinDays" INTEGER,
ADD COLUMN     "fulfillmentType" TEXT,
ADD COLUMN     "shippingCost" DOUBLE PRECISION;
