-- CreateEnum
CREATE TYPE "ReceiptOrigin" AS ENUM ('MANUAL', 'SHOPPING_CART');

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "receiptOrigin" "ReceiptOrigin",
ADD COLUMN     "shoppingCartId" TEXT;

-- AlterTable
ALTER TABLE "ProjectBill" ADD COLUMN     "receiptOrigin" "ReceiptOrigin";

-- CreateIndex
CREATE INDEX "DailyLog_shopping_cart_idx" ON "DailyLog"("shoppingCartId");

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_shoppingCartId_fkey" FOREIGN KEY ("shoppingCartId") REFERENCES "ShoppingCart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
