-- Add COMPANY_PRICE_LIST import job type for tenant cost books
ALTER TYPE "ImportJobType" ADD VALUE IF NOT EXISTS 'COMPANY_PRICE_LIST';

-- Create per-company cost book tables seeded from the global Golden Price List

-- CompanyPriceList: one or more cost books per tenant company
CREATE TABLE "CompanyPriceList" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "basePriceListId" TEXT,
  "label" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "effectiveDate" TIMESTAMP(3),
  "currency" TEXT DEFAULT 'USD',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CompanyPriceList_pkey" PRIMARY KEY ("id")
);

-- CompanyPriceListItem: tenant-level price list rows that can diverge from Golden
CREATE TABLE "CompanyPriceListItem" (
  "id" TEXT NOT NULL,
  "companyPriceListId" TEXT NOT NULL,
  "priceListItemId" TEXT,
  "canonicalKeyHash" TEXT,
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
  "lastKnownUnitPrice" DOUBLE PRECISION,

  CONSTRAINT "CompanyPriceListItem_pkey" PRIMARY KEY ("id")
);

-- Indexes to support common lookups
CREATE INDEX "CompanyPriceList_company_active_rev_idx"
  ON "CompanyPriceList"("companyId", "isActive", "revision");

CREATE INDEX "CompanyPriceListItem_company_hash_idx"
  ON "CompanyPriceListItem"("companyPriceListId", "canonicalKeyHash");

CREATE INDEX "CompanyPriceListItem_company_cat_sel_idx"
  ON "CompanyPriceListItem"("companyPriceListId", "cat", "sel");

-- Foreign keys
ALTER TABLE "CompanyPriceList"
  ADD CONSTRAINT "CompanyPriceList_company_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyPriceList"
  ADD CONSTRAINT "CompanyPriceList_basePriceList_fkey"
  FOREIGN KEY ("basePriceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyPriceListItem"
  ADD CONSTRAINT "CompanyPriceListItem_companyPriceList_fkey"
  FOREIGN KEY ("companyPriceListId") REFERENCES "CompanyPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyPriceListItem"
  ADD CONSTRAINT "CompanyPriceListItem_priceListItem_fkey"
  FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
