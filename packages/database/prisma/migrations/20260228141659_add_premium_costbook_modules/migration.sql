-- AlterEnum
ALTER TYPE "PricingModel" ADD VALUE 'ONE_TIME_PURCHASE';

-- AlterTable
ALTER TABLE "ModuleCatalog" ADD COLUMN     "oneTimePurchasePrice" INTEGER;
