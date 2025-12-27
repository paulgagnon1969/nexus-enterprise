-- CreateEnum
CREATE TYPE "PriceListKind" AS ENUM ('GOLDEN', 'ACTIVE');

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "kind" "PriceListKind" NOT NULL DEFAULT 'GOLDEN',
    "code" TEXT,
    "label" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "currency" TEXT DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "lineNo" INTEGER,
    "groupCode" TEXT,
    "groupDescription" TEXT,
    "description" TEXT,
    "cat" TEXT,
    "sel" TEXT,
    "unit" TEXT,
    "unitPrice" DOUBLE PRECISION,
    "coverage" TEXT,
    "activity" TEXT,
    "owner" TEXT,
    "sourceVendor" TEXT,
    "sourceDate" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceList_kind_active_revision_idx" ON "PriceList"("kind", "isActive", "revision");

-- CreateIndex
CREATE INDEX "PriceListItem_priceList_cat_sel_idx" ON "PriceListItem"("priceListId", "cat", "sel");

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
